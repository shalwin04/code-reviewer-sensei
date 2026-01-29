import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";
import { config } from "../../config/index.js";

import { structureReviewNode } from "./sub-reviewers/structure-reviewer.js";
<<<<<<< HEAD
import { testingReviewNode } from "./sub-reviewers/testing-reviewer.js";

=======
import { namingReviewNode } from "./sub-reviewers/naming-reviewer.js";
import { patternReviewNode } from "./sub-reviewers/pattern-reviewer.js";
>>>>>>> 8cb3ffe71540cacfd77690f870db43e1e5cf3f21
import type {
  RawViolation,
  Convention,
  PRDiffInput,
  ReviewerState,
} from "../../types/index.js";

// ============================================
// Reviewer State
// ============================================

const ReviewerOrchestratorAnnotation = Annotation.Root({
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
<<<<<<< HEAD
    reducer: (_, b) => b, // sub-reviewers return merged violations
=======
    reducer: (_, b) => b,
>>>>>>> 8cb3ffe71540cacfd77690f870db43e1e5cf3f21
    default: () => [],
  }),

  status: Annotation<ReviewerState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
});

// ============================================
// Load conventions
// ============================================

async function loadConventions(state: any) {
  if (!config.repository.fullName) {
    throw new Error("Repository full name not configured");
  }

  const store = await getSupabaseKnowledgeStore(config.repository.fullName);
  const conventions = await store.getAllConventions();

  return { conventions, status: "reviewing" };
}

// ============================================
// Build Graph
// ============================================

export function createReviewerGraph() {
  return new StateGraph(ReviewerOrchestratorAnnotation)
    .addNode("load_conventions", loadConventions)
<<<<<<< HEAD

    // 1️⃣ structure reviewer
=======
>>>>>>> 8cb3ffe71540cacfd77690f870db43e1e5cf3f21
    .addNode("structure_review", structureReviewNode)
    .addNode("naming_review", namingReviewNode)
    .addNode("pattern_review", patternReviewNode)

    // 2️⃣ testing reviewer
    .addNode("testing_review", testingReviewNode)

    // Flow
    .addEdge(START, "load_conventions")
    .addEdge("load_conventions", "structure_review")
<<<<<<< HEAD
    .addEdge("structure_review", "testing_review")
    .addEdge("testing_review", END)

=======
    .addEdge("structure_review", "naming_review")
    .addEdge("naming_review", "pattern_review")
    .addEdge("pattern_review", END)
>>>>>>> 8cb3ffe71540cacfd77690f870db43e1e5cf3f21
    .compile();
}

// ============================================
// Entry Point
// ============================================

export async function reviewPR(prDiff: PRDiffInput): Promise<ReviewerState> {
  const graph = createReviewerGraph();

  const result = await graph.invoke({
    prDiff,
    conventions: [],
    violations: [],
    status: "pending",
  });

  return {
    prNumber: prDiff.prNumber,
    violations: result.violations,
    status: result.status,
    reviewedFiles: prDiff.files.map(f => f.path),
  };
}