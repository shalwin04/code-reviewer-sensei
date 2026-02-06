// ============================================================================
// Reviewer Agent — Shared State Definition
// Used by reviewer/index.ts and all sub-reviewers to avoid circular imports
// ============================================================================

import { Annotation } from "@langchain/langgraph";
import type {
  RawViolation,
  Convention,
  PRDiffInput,
  ReviewerState,
  FileRouting,
} from "../../types/index.js";

// ============================================
// Reviewer Orchestrator Annotation (LangGraph)
// ============================================

export const ReviewerOrchestratorAnnotation = Annotation.Root({
  prDiff: Annotation<PRDiffInput>({
    reducer: (_, b) => b,
    default: () => ({
      prNumber: 0,
      title: "",
      files: [],
      baseBranch: "",
      headBranch: "",
    }),
  }),

  conventions: Annotation<Convention[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),

  violations: Annotation<RawViolation[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),

  routingPlan: Annotation<FileRouting[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),

  status: Annotation<ReviewerState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),

  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type ReviewerGraphState = typeof ReviewerOrchestratorAnnotation.State;
