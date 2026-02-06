import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { runLearner } from "../agents/learner/index.js";
import { reviewPR } from "../agents/reviewer/index.js";
import { explainFeedback, answerQuestion } from "../agents/tutor/index.js";
import {
  prepareFeedback,
  formatForConsole,
  formatForGitHub,
} from "../agents/feedback-controller/index.js";
import { getSupabaseKnowledgeStore } from "../knowledge/supabase-store.js";
import { config } from "../config/index.js";
import type {
  PRDiffInput,
  RawViolation,
  ExplainedFeedback,
  FeedbackControllerStateUpdated,
  LearnerState,
  Convention,
} from "../types/index.js";

// ============================================
// Main Orchestrator State
// ============================================

const OrchestratorAnnotation = Annotation.Root({
  trigger: Annotation<{
    type: "pr_review" | "question" | "learn";
    payload: unknown;
  }>({
    reducer: (_, b) => b,
    default: () => ({ type: "pr_review", payload: null }),
  }),
  prDiff: Annotation<PRDiffInput | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  question: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  learningSources: Annotation<LearnerState["sources"] | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  // Conventions JSON - loaded from DB, shared across agents
  conventions: Annotation<Convention[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  violations: Annotation<RawViolation[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  explainedFeedback: Annotation<ExplainedFeedback[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  finalOutput: Annotation<FeedbackControllerStateUpdated | string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  status: Annotation<"pending" | "in_progress" | "complete" | "error">({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  reviewSummary: Annotation<string | null>({
  reducer: (_, b) => b,
  default: () => null,
}),

});

export type OrchestratorState = typeof OrchestratorAnnotation.State;

// ============================================
// Router Node
// ============================================

function routeTrigger(state: OrchestratorState): string {
  switch (state.trigger.type) {
    case "pr_review":
      return "review_pr";
    case "question":
      return "answer_question";
    case "learn":
      return "learn_conventions";
    default:
      return "review_pr";
  }
}

// ============================================
// Node Functions
// ============================================

// Load conventions from Supabase into state (JSON)
// This runs BEFORE the reviewer so conventions are in the shared state
async function loadConventionsNode(
  _state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n📚 Orchestrator: Loading conventions from knowledge store...");

  if (!config.repository.fullName) {
    console.log("   No repository configured, skipping convention loading");
    return { conventions: [] };
  }

  try {
    const store = await getSupabaseKnowledgeStore(config.repository.fullName);
    const conventions = await store.getAllConventions();

    console.log(`   Loaded ${conventions.length} conventions as JSON`);
    console.log(`   Categories: ${[...new Set(conventions.map(c => c.category))].join(", ")}`);

    return {
      conventions,
    };
  } catch (error) {
    console.error(`   Failed to load conventions: ${error}`);
    return { conventions: [] };
  }
}

async function reviewPRNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🔍 Orchestrator: Starting PR review...");
  console.log(`   Conventions available in state: ${state.conventions.length}`);

  if (!state.prDiff) {
    return {
      status: "error",
      errors: ["No PR diff provided"],
    };
  }

  try {
    // Pass conventions from orchestrator state so the reviewer
    // skips its own convention loading (already done here)
    const reviewResult = await reviewPR(
      {
        prNumber: state.prDiff.prNumber,
        title: state.prDiff.title,
        files: state.prDiff.files,
        baseBranch: state.prDiff.baseBranch,
        headBranch: state.prDiff.headBranch,
      },
      state.conventions
    );

    return {
      violations: reviewResult.violations,
      status: "in_progress",
    };
  } catch (error) {
    return {
      status: "error",
      errors: [`Review failed: ${error}`],
    };
  }
}

async function explainViolationsNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🎓 Orchestrator: Getting explanations...");

  if (state.violations.length === 0) {
    return {
      explainedFeedback: [],
    };
  }

  try {
    // Pass conventions from state so tutor doesn't reload from Supabase
    const tutorResult = await explainFeedback(
      state.violations,
      state.conventions
    );

    return {
      explainedFeedback: tutorResult.explainedFeedback,
    };
  } catch (error) {
    return {
      status: "error",
      errors: [`Explanation failed: ${error}`],
    };
  }
}
async function summarizeReviewNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🧑‍🏫 Orchestrator: Summarizing PR review...");

  if (state.violations.length === 0) {
    return {
      reviewSummary: "No issues found. This PR looks good to merge.",
    };
  }

  // Only trust agentic violations
  const agentic = state.violations.filter(
    v => v.reasoning && v.impact && v.recommendation
  );

  if (agentic.length === 0) {
    return {
      reviewSummary:
        "Issues were detected, but they lack sufficient reasoning to explain clearly.",
    };
  }

  const llm = await import("../utils/llm.js").then(m =>
    m.getModelForTask("reviewer", "google")
  );

  const prompt = `
You are a senior engineer explaining THIS pull request to a junior developer.

Rules:
- Do NOT explain team rules
- Do NOT restate conventions
- Explain what is wrong in THIS PR
- Be encouraging and human

Violations:
${agentic.map(v => `
Type: ${v.type}
Issue: ${v.issue}
Impact: ${v.impact}
`).join("\n---\n")}

Write a 5–7 sentence summary.
`;

  const res = await llm.invoke(prompt);

  return {
    reviewSummary: res.content.toString().trim(),
  };
}

async function prepareFeedbackNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n📤 Orchestrator: Preparing feedback...");

  if (!state.prDiff) {
    return {
      status: "error",
      errors: ["No PR context"],
    };
  }

  try {
    const feedbackResult = await prepareFeedback(
      state.explainedFeedback,
      state.prDiff.prNumber,
      "console"
    );

    return {
      finalOutput: feedbackResult,
      status: "complete",
    };
  } catch (error) {
    return {
      status: "error",
      errors: [`Feedback preparation failed: ${error}`],
    };
  }
}

async function answerQuestionNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n❓ Orchestrator: Answering question...");

  if (!state.question) {
    return {
      status: "error",
      errors: ["No question provided"],
    };
  }

  try {
    const answer = await answerQuestion(state.question);

    return {
      finalOutput: answer,
      status: "complete",
    };
  } catch (error) {
    return {
      status: "error",
      errors: [`Question answering failed: ${error}`],
    };
  }
}

async function learnConventionsNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n📚 Orchestrator: Learning conventions...");

  if (!state.learningSources) {
    return {
      status: "error",
      errors: ["No learning sources provided"],
    };
  }

  // Validate repository name
  if (!config.repository.fullName) {
    return {
      status: "error",
      errors: ["Repository name not configured. Set REPOSITORY_FULL_NAME or use --repo flag."],
    };
  }

  try {
    const learnerResult = await runLearner(state.learningSources);

    // Get stats from Supabase store
    const store = await getSupabaseKnowledgeStore(config.repository.fullName);
    const stats = await store.getStats();

    return {
      finalOutput: `Learning complete! Found ${learnerResult.extractedConventions.length} conventions. Total in knowledge store: ${stats.conventions}`,
      status: "complete",
    };
  } catch (error) {
    return {
      status: "error",
      errors: [`Learning failed: ${error}`],
    };
  }
}

// ============================================
// Build Main Orchestrator Graph
// ============================================

export function createOrchestratorGraph() {
  const graph = new StateGraph(OrchestratorAnnotation)
    .addNode("load_conventions", loadConventionsNode)
    .addNode("review_pr", reviewPRNode)
    .addNode("explain_violations", explainViolationsNode)
    .addNode("prepare_feedback", prepareFeedbackNode)
    .addNode("answer_question", answerQuestionNode)
    .addNode("learn_conventions", learnConventionsNode)
    .addNode("summarize_review", summarizeReviewNode)
    .addConditionalEdges(START, routeTrigger, {
      review_pr: "load_conventions",         // load conventions first
      answer_question: "answer_question",
      learn_conventions: "learn_conventions",
    })
    .addEdge("load_conventions", "review_pr") // then review
    .addEdge("review_pr", "summarize_review")
    .addEdge("summarize_review", "explain_violations")
    .addEdge("explain_violations", "prepare_feedback")
    .addEdge("prepare_feedback", END)
    .addEdge("answer_question", END)
    .addEdge("learn_conventions", END);

  return graph.compile();
}

// ============================================
// Public API
// ============================================

export async function orchestrateReview(prDiff: PRDiffInput) {
  const graph = createOrchestratorGraph();

  const result = await graph.invoke({
    trigger: { type: "pr_review", payload: prDiff },
    prDiff,
    question: null,
    learningSources: null,
    conventions: [],       // loaded by load_conventions node
    violations: [],
    explainedFeedback: [],
    finalOutput: null,
    status: "pending",
    errors: [],
    reviewSummary: null,
  });

  return result;
}

export async function orchestrateQuestion(question: string) {
  const graph = createOrchestratorGraph();

  const result = await graph.invoke({
    trigger: { type: "question", payload: question },
    prDiff: null,
    question,
    learningSources: null,
    conventions: [],
    violations: [],
    explainedFeedback: [],
    finalOutput: null,
    status: "pending",
    errors: [],
    reviewSummary: null,
  });

  return result;
}

export async function orchestrateLearning(
  sources: LearnerState["sources"],
  repositoryFullName?: string
) {
  // Set repository name in config if provided
  if (repositoryFullName) {
    config.repository.fullName = repositoryFullName;
  }

  const graph = createOrchestratorGraph();

  const result = await graph.invoke({
    trigger: { type: "learn", payload: sources },
    prDiff: null,
    question: null,
    learningSources: sources,
    conventions: [],
    violations: [],
    explainedFeedback: [],
    finalOutput: null,
    status: "pending",
    errors: [],
    reviewSummary: null,
  });

  return result;
}

// Re-export formatters
export { formatForConsole, formatForGitHub };