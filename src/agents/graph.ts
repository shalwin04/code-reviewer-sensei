import { Annotation, StateGraph } from "@langchain/langgraph";
import type {
  Convention,
  RawViolation,
  ExplainedFeedback,
  PRDiffInput,
  TutorContext,
} from "../types/index.js";
/* ================= TYPES ================= */


/* ================= GRAPH STATE ================= */

export const OrchestratorAnnotation = Annotation.Root({

  question: Annotation<string | null>({
  reducer: (_, b) => b,
  default: () => null,
  }),


  teamKnowledge: Annotation<Convention[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),

  prDiff: Annotation<PRDiffInput | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  violations: Annotation<RawViolation[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),

  explainedFeedback: Annotation<ExplainedFeedback[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  context: Annotation<TutorContext>({
  reducer: (_, b) => b,
  default: () => "REVIEW",
}),

  status: Annotation<"pending" | "completed">({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
});

export type OrchestratorState =
  typeof OrchestratorAnnotation.State;

/* ================= GRAPH FACTORY ================= */

export function createMainGraph() {
  return new StateGraph(OrchestratorAnnotation);
}
