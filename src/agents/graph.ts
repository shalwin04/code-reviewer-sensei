import { StateGraph, Annotation } from "@langchain/langgraph";
import type {
  OrchestratorState,
  LearnerState,
  ReviewerState,
  TutorState,
  FeedbackControllerState,
  Convention,
  ReviewResult,
} from "../types/index.js";

// ============================================
// State Annotations for LangGraph
// ============================================

const LearnerAnnotation = Annotation.Root({
  sources: Annotation<LearnerState["sources"]>({
    reducer: (_, b) => b,
    default: () => ({ codebase: [], adrs: [], prReviews: [], incidents: [] }),
  }),
  extractedConventions: Annotation<Convention[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  processingStatus: Annotation<LearnerState["processingStatus"]>({
    reducer: (_, b) => b,
    default: () => "idle",
  }),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

const ReviewerAnnotation = Annotation.Root({
  prNumber: Annotation<ReviewerState["prNumber"]>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
  violations: Annotation<ReviewerState["violations"]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  status: Annotation<ReviewerState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
  reviewedFiles: Annotation<ReviewerState["reviewedFiles"]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

const TutorAnnotation = Annotation.Root({
  violations: Annotation<TutorState["violations"]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  explainedFeedback: Annotation<TutorState["explainedFeedback"]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  status: Annotation<TutorState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
});

const FeedbackControllerAnnotation = Annotation.Root({
  prNumber: Annotation<FeedbackControllerState["prNumber"]>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
  explainedFeedback: Annotation<FeedbackControllerState["explainedFeedback"]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  formattedComments: Annotation<FeedbackControllerState["formattedComments"]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  summary: Annotation<FeedbackControllerState["summary"]>({
    reducer: (_, b) => b,
    default: () => "",
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

// ============================================
// Main Orchestrator State Annotation
// ============================================

export const OrchestratorAnnotation = Annotation.Root({
  trigger: Annotation<OrchestratorState["trigger"]>({
    reducer: (_, b) => b,
    default: () => ({ type: "pr_review" as const, payload: null }),
  }),
  learner: Annotation<LearnerState>({
    reducer: (_, b) => b,
    default: () => ({
      sources: { codebase: [], adrs: [], prReviews: [], incidents: [] },
      extractedConventions: [],
      processingStatus: "idle",
      errors: [],
    }),
  }),
  reviewer: Annotation<ReviewerState>({
    reducer: (_, b) => b,
    default: () => ({
      prNumber: 0,
      violations: [],
      status: "pending",
      reviewedFiles: [],
    }),
  }),
  tutor: Annotation<TutorState>({
    reducer: (_, b) => b,
    default: () => ({
      violations: [],
      explainedFeedback: [],
      status: "pending",
    }),
  }),
  feedbackController: Annotation<FeedbackControllerState>({
    reducer: (_, b) => b,
    default: () => ({
      prNumber: 0,
      explainedFeedback: [],
      formattedComments: [],
      summary: "",
      status: "pending",
      deliveryTarget: "github",
    }),
  }),
  teamKnowledge: Annotation<Convention[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  result: Annotation<ReviewResult | string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  status: Annotation<OrchestratorState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type OrchestratorStateType = typeof OrchestratorAnnotation.State;

// ============================================
// Graph Builder Factory
// ============================================

export function createOrchestratorGraph() {
  const graph = new StateGraph(OrchestratorAnnotation);

  // Nodes will be added by each agent module
  return graph;
}

// Export annotations for subgraphs
export {
  LearnerAnnotation,
  ReviewerAnnotation,
  TutorAnnotation,
  FeedbackControllerAnnotation,
};
