import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";
import { config } from "../../config/index.js";
import { structureReviewNode } from "./sub-reviewers/structure-reviewer.js";
import type {
  RawViolation,
  Convention,
  PRDiffInput,
  ReviewerState,
} from "../../types/index.js";

// ============================================
// Reviewer Orchestrator State
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
    reducer: (_, b) => b, // structure node returns merged violations
    default: () => [],
  }),

  status: Annotation<ReviewerState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
});

type ReviewerOrchestratorState =
  typeof ReviewerOrchestratorAnnotation.State;

// ============================================
// Nodes
// ============================================

async function loadConventions(
  _state: ReviewerOrchestratorState
): Promise<Partial<ReviewerOrchestratorState>> {
  console.log("📖 Reviewer: Loading team conventions...");

  if (!config.repository.fullName) {
    throw new Error("Repository full name not configured");
  }

  const store = await getSupabaseKnowledgeStore(config.repository.fullName);
  const conventions = await store.getAllConventions();

  console.log(`   Loaded ${conventions.length} conventions`);

  return {
    conventions,
    status: "reviewing",
  };
}

// ============================================
// Build Reviewer Graph
// ============================================

export function createReviewerGraph() {
  return new StateGraph(ReviewerOrchestratorAnnotation)
    .addNode("load_conventions", loadConventions)

    // 👇 YOUR STRUCTURE REVIEWER RUNS AS A NODE
    .addNode("structure_review", structureReviewNode)

    .addEdge(START, "load_conventions")
    .addEdge("load_conventions", "structure_review")
    .addEdge("structure_review", END)
    .compile();
}

// ============================================
// Reviewer Entry Point
// ============================================

export async function reviewPR(prDiff: PRDiffInput): Promise<ReviewerState> {
  console.log(`\n🚀 Starting review for PR #${prDiff.prNumber}: ${prDiff.title}`);

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
    reviewedFiles: result.prDiff.files.map(f => f.path),
  };
}
