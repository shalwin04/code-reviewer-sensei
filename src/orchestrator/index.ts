import { START, END } from "@langchain/langgraph";
import { createMainGraph } from "../agents/graph.js";

import { learnerAgent } from "../agents/learner/index.js";
import { reviewerAgent } from "../agents/reviewer/index.js";
import { tutorAgent } from "../agents/tutor/index.js";

export async function runReview(
  input: {
    context: "REVIEW" | "QUESTION";
    question?: string;
    state?: any;
  }
) {
  const graph = createMainGraph()
    .addNode("learner", learnerAgent)
    .addNode("reviewer", reviewerAgent)
    .addNode("tutor", tutorAgent)
    .addEdge(START, "learner")
    .addEdge("learner", "reviewer")
    .addEdge("reviewer", "tutor")
    .addEdge("tutor", END);

  const app = graph.compile();

  return app.invoke({
    ...input.state,   // 👈 reuse previous state
    context: input.context,
    question: input.question,
  });
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
});

type OrchestratorState = typeof OrchestratorAnnotation.State;

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

async function reviewPRNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🔍 Orchestrator: Starting PR review...");

  if (!state.prDiff) {
    return {
      status: "error",
      errors: ["No PR diff provided"],
    };
  }

  try {
    const reviewResult = await reviewPR({
      prNumber: state.prDiff.prNumber,
      title: state.prDiff.title,
      files: state.prDiff.files,
      baseBranch: state.prDiff.baseBranch,
      headBranch: state.prDiff.headBranch,
    });

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
    const tutorResult = await explainFeedback(state.violations);

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
    .addNode("review_pr", reviewPRNode)
    .addNode("explain_violations", explainViolationsNode)
    .addNode("prepare_feedback", prepareFeedbackNode)
    .addNode("answer_question", answerQuestionNode)
    .addNode("learn_conventions", learnConventionsNode)
    .addConditionalEdges(START, routeTrigger, {
      review_pr: "review_pr",
      answer_question: "answer_question",
      learn_conventions: "learn_conventions",
    })
    .addEdge("review_pr", "explain_violations")
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
    violations: [],
    explainedFeedback: [],
    finalOutput: null,
    status: "pending",
    errors: [],
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
    violations: [],
    explainedFeedback: [],
    finalOutput: null,
    status: "pending",
    errors: [],
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
    violations: [],
    explainedFeedback: [],
    finalOutput: null,
    status: "pending",
    errors: [],
  });

  return result;
}

