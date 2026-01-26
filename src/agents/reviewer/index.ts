import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";
import { config } from "../../config/index.js";
import {
  reviewNaming,
  reviewStructure,
  reviewPatterns,
  reviewTesting,
} from "./sub-reviewers/index.js";
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
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  status: Annotation<ReviewerState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
  currentFile: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  reviewedFiles: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

type ReviewerOrchestratorState = typeof ReviewerOrchestratorAnnotation.State;

// ============================================
// Node Functions
// ============================================

async function loadConventions(
  _state: ReviewerOrchestratorState
): Promise<Partial<ReviewerOrchestratorState>> {
  console.log("📖 Reviewer: Loading team conventions from Supabase...");

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

async function runSubReviewers(
  state: ReviewerOrchestratorState
): Promise<Partial<ReviewerOrchestratorState>> {
  console.log("🔍 Reviewer: Running sub-reviewers...");
  console.log(
    "   Active conventions:",
    state.conventions.map(c => `${c.category}: ${c.rule}`)
  );

  const allViolations: RawViolation[] = [];
  const reviewedFiles: string[] = [];

  for (const file of state.prDiff.files) {
    console.log(`   Reviewing: ${file.path}`);

    const [
      namingViolations,
      structureViolations,
      patternViolations,
      testingViolations,
    ] = await Promise.all([
      reviewNaming(file.diff, file.path, state.conventions),
      reviewStructure(file.diff, file.path, state.conventions),
      reviewPatterns(file.diff, file.path, state.conventions),
      reviewTesting(file.diff, file.path, state.conventions),
    ]);

    allViolations.push(
      ...namingViolations,
      ...structureViolations,
      ...patternViolations,
      ...testingViolations
    );

    reviewedFiles.push(file.path);
  }

  console.log(`   Found ${allViolations.length} violations`);

  return {
    violations: allViolations,
    reviewedFiles,
  };
}

async function aggregateResults(
  state: ReviewerOrchestratorState
): Promise<Partial<ReviewerOrchestratorState>> {
  console.log("📊 Reviewer: Aggregating results...");

  const sortedViolations = [...state.violations].sort((a, b) => {
    const order = { error: 0, warning: 1, suggestion: 2 };
    const diff = order[a.severity] - order[b.severity];
    return diff !== 0 ? diff : a.file.localeCompare(b.file);
  });

  return {
    violations: sortedViolations,
    status: "complete",
  };
}

// ============================================
// Build Reviewer Graph
// ============================================

export function createReviewerGraph() {
  return new StateGraph(ReviewerOrchestratorAnnotation)
    .addNode("load_conventions", loadConventions)
    .addNode("run_sub_reviewers", runSubReviewers)
    .addNode("aggregate_results", aggregateResults)
    .addEdge(START, "load_conventions")
    .addEdge("load_conventions", "run_sub_reviewers")
    .addEdge("run_sub_reviewers", "aggregate_results")
    .addEdge("aggregate_results", END)
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
    currentFile: "",
    reviewedFiles: [],
  });

  return {
    prNumber: prDiff.prNumber,
    violations: result.violations,
    status: result.status,
    reviewedFiles: result.reviewedFiles,
  };
}

export * from "./sub-reviewers/index.js";
