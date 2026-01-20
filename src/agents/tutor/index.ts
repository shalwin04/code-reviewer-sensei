import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { createLLM } from "../../utils/llm.js";
import { getKnowledgeStore } from "../../knowledge/store.js";
import { config } from "../../config/index.js";
import type {
  RawViolation,
  ExplainedFeedback,
  Convention,
  TutorState,
} from "../../types/index.js";

// ============================================
// Tutor Agent State
// ============================================

const TutorAgentAnnotation = Annotation.Root({
  violations: Annotation<RawViolation[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  conventions: Annotation<Convention[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  explainedFeedback: Annotation<ExplainedFeedback[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  currentViolation: Annotation<RawViolation | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  status: Annotation<TutorState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
});

type TutorAgentState = typeof TutorAgentAnnotation.State;

// ============================================
// Explanation Schema
// ============================================

const ExplanationSchema = z.object({
  explanation: z.object({
    whyItMatters: z
      .string()
      .describe("Why this issue matters to the team - be specific"),
    whatTeamExpects: z
      .string()
      .describe("What the team expects instead - with concrete guidance"),
    codeExample: z
      .object({
        before: z.string().describe("The problematic code pattern"),
        after: z.string().describe("The corrected code pattern"),
        file: z.string().optional().describe("Reference file from the codebase"),
        line: z.number().optional().describe("Line number reference"),
      })
      .optional(),
    relatedIncident: z
      .string()
      .optional()
      .describe("Related incident or history if available"),
    learningResources: z
      .array(z.string())
      .optional()
      .describe("Links or references for further learning"),
  }),
});

const explanationParser = StructuredOutputParser.fromZodSchema(ExplanationSchema);

// ============================================
// Prompts
// ============================================

const EXPLAIN_VIOLATION_PROMPT = PromptTemplate.fromTemplate(`
You are a patient, knowledgeable engineering tutor. Your job is to explain code violations in a way that helps developers learn and grow.

## The Violation:
- Type: {violationType}
- File: {file}
- Line: {line}
- Issue: {issue}
- Code: {code}
- Severity: {severity}

## Related Team Convention:
{convention}

## Team Context (if available):
{teamContext}

## Your Task:
Create an educational explanation that:
1. Explains WHY this matters to the team specifically
2. Describes WHAT the team expects instead
3. Shows a concrete code example of the fix
4. References any related team history (incidents, previous decisions)
5. Maintains an encouraging, teaching tone

Remember: You're not just pointing out mistakes - you're helping developers understand and internalize team standards.

{format_instructions}
`);

const ANSWER_QUESTION_PROMPT = PromptTemplate.fromTemplate(`
You are a helpful engineering tutor answering a developer's question about code feedback.

## Developer's Question:
{question}

## Original Feedback Context:
{feedbackContext}

## Team Conventions:
{conventions}

## Team Knowledge Base:
{knowledgeBase}

## Instructions:
- Answer the question directly and helpfully
- Reference specific team conventions when relevant
- Provide concrete examples from the team's codebase when possible
- Be encouraging and educational
- If you don't have enough information, say so honestly

Provide a clear, helpful answer:
`);

// ============================================
// Node Functions
// ============================================

async function loadContext(
  _state: TutorAgentState
): Promise<Partial<TutorAgentState>> {
  console.log("📚 Tutor: Loading team context...");

  const store = await getKnowledgeStore(config.knowledgeStore.path);
  const conventions = store.getAllConventions();

  return {
    conventions,
    status: "explaining",
  };
}

async function explainViolations(
  state: TutorAgentState
): Promise<Partial<TutorAgentState>> {
  console.log(`🎓 Tutor: Explaining ${state.violations.length} violations...`);

  const llm = createLLM(config.agents.tutor);
  const explainedFeedback: ExplainedFeedback[] = [];

  for (const violation of state.violations) {
    try {
      // Find related convention
      const relatedConvention = state.conventions.find(
        (c) => c.id === violation.conventionId || c.category === violation.type
      );

      const conventionText = relatedConvention
        ? `${relatedConvention.rule}: ${relatedConvention.description}`
        : "No specific convention found, but this is a general best practice.";

      // Get any related team context
      const store = await getKnowledgeStore(config.knowledgeStore.path);
      const relatedExamples = store.getExamplesForCategory(violation.type);

      const prompt = await EXPLAIN_VIOLATION_PROMPT.format({
        violationType: violation.type,
        file: violation.file,
        line: violation.line,
        issue: violation.issue,
        code: violation.code,
        severity: violation.severity,
        convention: conventionText,
        teamContext: relatedExamples.length > 0
          ? `Found ${relatedExamples.length} similar examples in the team's codebase.`
          : "No specific team history available.",
        format_instructions: explanationParser.getFormatInstructions(),
      });

      const response = await llm.invoke(prompt);
      const parsed = await explanationParser.parse(response.content as string);

      explainedFeedback.push({
        id: `explained-${violation.id}`,
        violation,
        explanation: parsed.explanation.whyItMatters,
        teamExpectation: parsed.explanation.whatTeamExpects,
        codeExample: parsed.explanation.codeExample,
        relatedIncident: parsed.explanation.relatedIncident,
        learningResources: parsed.explanation.learningResources,
        conventionReference: relatedConvention
          ? {
              id: relatedConvention.id,
              rule: relatedConvention.rule,
            }
          : undefined,
      });
    } catch (error) {
      console.error(`Error explaining violation ${violation.id}:`, error);
      // Fallback to basic explanation
      explainedFeedback.push({
        id: `explained-${violation.id}`,
        violation,
        explanation: violation.issue,
        teamExpectation: "Please review and fix this issue.",
      });
    }
  }

  return {
    explainedFeedback,
  };
}

async function finalizeExplanations(
  _state: TutorAgentState
): Promise<Partial<TutorAgentState>> {
  console.log("✅ Tutor: Finalizing explanations...");

  return {
    status: "complete",
  };
}

// ============================================
// Build Tutor Graph
// ============================================

export function createTutorGraph() {
  const graph = new StateGraph(TutorAgentAnnotation)
    .addNode("load_context", loadContext)
    .addNode("explain_violations", explainViolations)
    .addNode("finalize", finalizeExplanations)
    .addEdge(START, "load_context")
    .addEdge("load_context", "explain_violations")
    .addEdge("explain_violations", "finalize")
    .addEdge("finalize", END);

  return graph.compile();
}

// ============================================
// Tutor Entry Points
// ============================================

export async function explainFeedback(
  violations: RawViolation[]
): Promise<TutorState> {
  console.log(`\n🎓 Tutor Agent: Processing ${violations.length} violations`);

  const graph = createTutorGraph();

  const result = await graph.invoke({
    violations,
    conventions: [],
    explainedFeedback: [],
    currentViolation: null,
    status: "pending",
  });

  return {
    violations,
    explainedFeedback: result.explainedFeedback,
    status: result.status,
  };
}

export async function answerQuestion(
  question: string,
  feedbackContext?: ExplainedFeedback
): Promise<string> {
  console.log(`\n❓ Tutor Agent: Answering question: "${question}"`);

  const llm = createLLM(config.agents.tutor);
  const store = await getKnowledgeStore(config.knowledgeStore.path);

  const conventions = store.getAllConventions();
  const conventionsText = conventions
    .slice(0, 10)
    .map((c) => `- [${c.category}] ${c.rule}`)
    .join("\n");

  const prompt = await ANSWER_QUESTION_PROMPT.format({
    question,
    feedbackContext: feedbackContext
      ? `Violation: ${feedbackContext.violation.issue}\nExplanation: ${feedbackContext.explanation}`
      : "No specific feedback context provided.",
    conventions: conventionsText || "No conventions loaded yet.",
    knowledgeBase: "Team knowledge base is being built.",
  });

  const response = await llm.invoke(prompt);
  return response.content as string;
}
