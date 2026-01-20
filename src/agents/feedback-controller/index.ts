import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { PromptTemplate } from "@langchain/core/prompts";
import { createLLM } from "../../utils/llm.js";
import { config } from "../../config/index.js";
import type {
  ExplainedFeedback,
  FormattedComment,
  FeedbackControllerState,
} from "../../types/index.js";

// ============================================
// Feedback Controller State
// ============================================

const FeedbackControllerAnnotation = Annotation.Root({
  explainedFeedback: Annotation<ExplainedFeedback[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  formattedComments: Annotation<FormattedComment[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  prNumber: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
  status: Annotation<FeedbackControllerState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
  deliveryTarget: Annotation<FeedbackControllerState["deliveryTarget"]>({
    reducer: (_, b) => b,
    default: () => "github",
  }),
});

type FeedbackControllerAgentState = typeof FeedbackControllerAnnotation.State;

// ============================================
// Prompts
// ============================================

const FORMAT_COMMENT_PROMPT = PromptTemplate.fromTemplate(`
You are formatting code review feedback for a developer. Make it clear, actionable, and educational.

## Original Feedback:
- Issue: {issue}
- Explanation: {explanation}
- Team Expectation: {teamExpectation}
- Severity: {severity}

## Code Example (if available):
Before: {codeBefore}
After: {codeAfter}

## Instructions:
Format this as a helpful GitHub PR comment that:
1. Clearly states the issue
2. Explains why it matters
3. Shows the fix
4. Is encouraging, not condescending

Keep it concise but complete. Use markdown formatting.
`);

const SUMMARY_PROMPT = PromptTemplate.fromTemplate(`
You are creating a summary of code review feedback for a pull request.

## Feedback Items:
{feedbackItems}

## Statistics:
- Total issues: {totalIssues}
- Errors: {errors}
- Warnings: {warnings}
- Suggestions: {suggestions}

## Instructions:
Create a brief, professional summary that:
1. Gives an overview of the review
2. Highlights the most important issues
3. Acknowledges what's done well (if applicable)
4. Ends with encouragement

Use markdown formatting. Keep it under 200 words.
`);

// ============================================
// Node Functions
// ============================================

async function deduplicateFeedback(
  state: FeedbackControllerAgentState
): Promise<Partial<FeedbackControllerAgentState>> {
  console.log("🔄 Feedback Controller: Deduplicating feedback...");

  const seen = new Map<string, ExplainedFeedback>();
  const deduplicated: ExplainedFeedback[] = [];

  for (const feedback of state.explainedFeedback) {
    const key = `${feedback.violation.file}:${feedback.violation.line}:${feedback.violation.type}`;

    if (!seen.has(key)) {
      seen.set(key, feedback);
      deduplicated.push(feedback);
    }
  }

  console.log(
    `   Reduced from ${state.explainedFeedback.length} to ${deduplicated.length} items`
  );

  return {
    explainedFeedback: deduplicated,
    status: "formatting",
  };
}

async function formatComments(
  state: FeedbackControllerAgentState
): Promise<Partial<FeedbackControllerAgentState>> {
  console.log("✍️ Feedback Controller: Formatting comments...");

  const llm = createLLM(config.agents.feedbackController);
  const formattedComments: FormattedComment[] = [];

  for (const feedback of state.explainedFeedback) {
    try {
      const prompt = await FORMAT_COMMENT_PROMPT.format({
        issue: feedback.violation.issue,
        explanation: feedback.explanation,
        teamExpectation: feedback.teamExpectation,
        severity: feedback.violation.severity,
        codeBefore: feedback.codeExample?.before || "N/A",
        codeAfter: feedback.codeExample?.after || "N/A",
      });

      const response = await llm.invoke(prompt);

      formattedComments.push({
        id: `comment-${feedback.id}`,
        file: feedback.violation.file,
        line: feedback.violation.line,
        body: response.content as string,
        severity: feedback.violation.severity,
        type: feedback.violation.type,
      });
    } catch (error) {
      console.error(`Error formatting comment for ${feedback.id}:`, error);
      // Fallback to simple format
      formattedComments.push({
        id: `comment-${feedback.id}`,
        file: feedback.violation.file,
        line: feedback.violation.line,
        body: formatSimpleComment(feedback),
        severity: feedback.violation.severity,
        type: feedback.violation.type,
      });
    }
  }

  return {
    formattedComments,
  };
}

function formatSimpleComment(feedback: ExplainedFeedback): string {
  const severityEmoji = {
    error: "🔴",
    warning: "🟡",
    suggestion: "💡",
  };

  let comment = `${severityEmoji[feedback.violation.severity]} **${feedback.violation.type.toUpperCase()}**: ${feedback.violation.issue}\n\n`;
  comment += `**Why this matters:** ${feedback.explanation}\n\n`;
  comment += `**What to do:** ${feedback.teamExpectation}`;

  if (feedback.codeExample) {
    comment += `\n\n**Example fix:**\n\`\`\`diff\n- ${feedback.codeExample.before}\n+ ${feedback.codeExample.after}\n\`\`\``;
  }

  return comment;
}

async function generateSummary(
  state: FeedbackControllerAgentState
): Promise<Partial<FeedbackControllerAgentState>> {
  console.log("📝 Feedback Controller: Generating summary...");

  const llm = createLLM(config.agents.feedbackController);

  const errors = state.formattedComments.filter((c) => c.severity === "error");
  const warnings = state.formattedComments.filter(
    (c) => c.severity === "warning"
  );
  const suggestions = state.formattedComments.filter(
    (c) => c.severity === "suggestion"
  );

  const feedbackItems = state.formattedComments
    .slice(0, 10)
    .map((c) => `- [${c.severity}] ${c.file}:${c.line} - ${c.type}`)
    .join("\n");

  const prompt = await SUMMARY_PROMPT.format({
    feedbackItems,
    totalIssues: state.formattedComments.length,
    errors: errors.length,
    warnings: warnings.length,
    suggestions: suggestions.length,
  });

  const response = await llm.invoke(prompt);

  return {
    summary: response.content as string,
    status: "ready",
  };
}

async function finalizeOutput(
  _state: FeedbackControllerAgentState
): Promise<Partial<FeedbackControllerAgentState>> {
  console.log("✅ Feedback Controller: Finalizing output...");

  return {
    status: "complete",
  };
}

// ============================================
// Build Feedback Controller Graph
// ============================================

export function createFeedbackControllerGraph() {
  const graph = new StateGraph(FeedbackControllerAnnotation)
    .addNode("deduplicate", deduplicateFeedback)
    .addNode("format_comments", formatComments)
    .addNode("generate_summary", generateSummary)
    .addNode("finalize", finalizeOutput)
    .addEdge(START, "deduplicate")
    .addEdge("deduplicate", "format_comments")
    .addEdge("format_comments", "generate_summary")
    .addEdge("generate_summary", "finalize")
    .addEdge("finalize", END);

  return graph.compile();
}

// ============================================
// Feedback Controller Entry Point
// ============================================

export async function prepareFeedback(
  explainedFeedback: ExplainedFeedback[],
  prNumber: number,
  deliveryTarget: FeedbackControllerState["deliveryTarget"] = "github"
): Promise<FeedbackControllerState> {
  console.log(
    `\n📤 Feedback Controller: Preparing ${explainedFeedback.length} items for delivery`
  );

  const graph = createFeedbackControllerGraph();

  const result = await graph.invoke({
    explainedFeedback,
    formattedComments: [],
    summary: "",
    prNumber,
    status: "pending",
    deliveryTarget,
  });

  return {
    prNumber,
    explainedFeedback,
    formattedComments: result.formattedComments,
    summary: result.summary,
    status: result.status,
    deliveryTarget,
  };
}

// ============================================
// Output Formatters
// ============================================

export function formatForGitHub(state: FeedbackControllerState): {
  summary: string;
  comments: Array<{ path: string; line: number; body: string }>;
} {
  return {
    summary: state.summary,
    comments: state.formattedComments.map((c) => ({
      path: c.file,
      line: c.line,
      body: c.body,
    })),
  };
}

export function formatForConsole(state: FeedbackControllerState): string {
  let output = "\n" + "=".repeat(60) + "\n";
  output += `📋 PR #${state.prNumber} Review Summary\n`;
  output += "=".repeat(60) + "\n\n";
  output += state.summary + "\n\n";
  output += "-".repeat(60) + "\n";
  output += "Detailed Feedback:\n";
  output += "-".repeat(60) + "\n\n";

  for (const comment of state.formattedComments) {
    output += `📁 ${comment.file}:${comment.line}\n`;
    output += comment.body + "\n\n";
    output += "-".repeat(40) + "\n\n";
  }

  return output;
}
