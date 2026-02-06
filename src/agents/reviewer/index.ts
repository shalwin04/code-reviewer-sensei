// ============================================================================
// Reviewer Agent — RAG-Based PR Review
//
// Architecture: Retrieval-Augmented Generation
// - Retrieves ONLY relevant conventions per category/file
// - Does NOT rely on memory of all conventions
// - Each violation grounded in specific retrieved convention
//
// Flow:
//   START → route_files → [retrieve + review per category] → aggregate → END
// ============================================================================

import { StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { config } from "../../config/index.js";
import { getModelForTask } from "../../utils/llm.js";
import { retrieveContextForReview } from "../../knowledge/retriever.js";

import { structureReviewNode } from "./sub-reviewers/structure-reviewer.js";
import { testingReviewNode } from "./sub-reviewers/testing-reviewer.js";
import { namingReviewNode } from "./sub-reviewers/naming-reviewer.js";
import { patternReviewNode } from "./sub-reviewers/pattern-reviewer.js";

import {
  ReviewerOrchestratorAnnotation,
  type ReviewerGraphState,
} from "./state.js";

import type {
  Convention,
  PRDiffInput,
  ReviewerState,
  ReviewerCategory,
  FileRouting,
} from "../../types/index.js";

// ============================================
// RAG: Retrieve Conventions for Review
// ============================================

async function retrieveConventionsForReview(
  state: ReviewerGraphState
): Promise<Partial<ReviewerGraphState>> {
  console.log("\n📚 Reviewer: Retrieving relevant conventions via RAG...");

  if (!state.prDiff || state.prDiff.files.length === 0) {
    return { conventions: [] };
  }

  if (!config.repository.fullName) {
    console.log("   No repository configured");
    return { conventions: [] };
  }

  try {
    // Retrieve conventions relevant to this specific diff
    const categories = ["naming", "structure", "pattern", "testing"];
    const allRetrieved: Convention[] = [];

    for (const category of categories) {
      const conventions = await retrieveContextForReview(
        state.prDiff,
        config.repository.fullName,
        category
      );
      allRetrieved.push(...conventions);
    }

    // Deduplicate by ID
    const unique = Array.from(
      new Map(allRetrieved.map((c) => [c.id, c])).values()
    );

    console.log(`   Retrieved ${unique.length} relevant conventions`);

    const byCategory: Record<string, number> = {};
    for (const c of unique) {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    }
    console.log(
      `   By category: ${Object.entries(byCategory)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`
    );

    return { conventions: unique };
  } catch (error) {
    console.error(`   Failed to retrieve conventions: ${error}`);
    return { conventions: [] };
  }
}

// ============================================
// LLM Orchestrator — Routes Files to Sub-Reviewers
// ============================================

async function routeFilesToReviewers(
  state: ReviewerGraphState
): Promise<Partial<ReviewerGraphState>> {
  console.log("\n🧠 Reviewer Orchestrator: Analyzing PR and routing files...");

  if (!state.prDiff || state.prDiff.files.length === 0) {
    console.log("   No files to review");
    return {
      routingPlan: [],
      status: "complete",
    };
  }

  // Determine which convention categories are available from retrieval
  const availableCategories = [
    ...new Set(state.conventions.map((c) => c.category)),
  ].filter((cat): cat is ReviewerCategory =>
    ["naming", "structure", "pattern", "testing"].includes(cat)
  );

  // Fallback: if no conventions retrieved, route all files to all reviewers
  if (availableCategories.length === 0) {
    console.log(
      "   ⚠️ No conventions retrieved — routing all files to all reviewers"
    );
    return {
      routingPlan: state.prDiff.files.map((f) => ({
        filePath: f.path,
        assignedReviewers: [
          "naming",
          "structure",
          "pattern",
          "testing",
        ] as ReviewerCategory[],
        reasoning: "No conventions retrieved — running all reviewers as fallback",
      })),
      status: "reviewing",
    };
  }

  const llm = getModelForTask("reviewer", "google");

  // Build concise file summaries for the LLM
  const fileSummaries = state.prDiff.files
    .map((f) => {
      const ext = f.path.split(".").pop() || "";
      const isTest =
        f.path.includes(".test.") || f.path.includes(".spec.");
      const dir = f.path.split("/").slice(0, -1).join("/");
      const diffLines = f.diff.split("\n").length;
      return `- ${f.path} (ext: .${ext}, dir: ${dir}, isTest: ${isTest}, diffLines: ${diffLines})`;
    })
    .join("\n");

  const conventionSummary = availableCategories
    .map((cat) => {
      const rules = state.conventions.filter((c) => c.category === cat);
      return `  ${cat} (${rules.length} rules): e.g. "${rules[0]?.rule || "N/A"}"`;
    })
    .join("\n");

  const systemPrompt = `You are the Reviewer Orchestrator — a senior engineer who triages incoming PR files and decides which specialized sub-reviewers should analyze each file.

Available sub-reviewers:
- naming: Checks file names, variable names, function names, class names against team naming conventions
- structure: Checks folder placement, module boundaries, import patterns, layer violations
- pattern: Checks architectural patterns, error handling, forbidden patterns, API consistency
- testing: Checks test coverage, test file naming, test structure, untested logic paths

Retrieved conventions (relevant to this PR):
${conventionSummary}

Your routing rules:
1. Analyze each file's path, extension, directory, and nature
2. Assign ONLY the RELEVANT sub-reviewers — do NOT blindly assign all 4
3. Test files (.test.ts, .spec.ts) MUST get "testing"
4. Source files with new logic SHOULD get "testing" to flag missing tests
5. Files in layered directories (controllers, services, models, routes) → "structure" + "pattern"
6. ALL code files should get "naming" when naming conventions exist
7. Config files, docs, and non-code files need minimal or no review

Return ONLY a JSON array. No markdown fences. Each item:
{
  "filePath": string,
  "assignedReviewers": ["naming" | "structure" | "pattern" | "testing"],
  "reasoning": string
}`;

  const userPrompt = `PR: "${state.prDiff.title}" (${state.prDiff.baseBranch} ← ${state.prDiff.headBranch})

Files changed in this PR:
${fileSummaries}

Analyze each file and assign the appropriate sub-reviewers. Be selective.`;

  try {
    const res = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const content = res.content.toString();
    const match = content.match(/\[[\s\S]*\]/);

    if (!match) {
      console.log(
        "   ⚠️ LLM routing produced no valid JSON — falling back to all reviewers"
      );
      return {
        routingPlan: state.prDiff.files.map((f) => ({
          filePath: f.path,
          assignedReviewers: availableCategories,
          reasoning: "Fallback: LLM routing produced no valid JSON",
        })),
        status: "reviewing",
      };
    }

    const parsed: FileRouting[] = JSON.parse(match[0]);

    // Validate and sanitize the routing plan
    const validCategories = new Set<string>([
      "naming",
      "structure",
      "pattern",
      "testing",
    ]);
    const validPlan = parsed
      .map((route) => ({
        filePath: route.filePath,
        assignedReviewers: (route.assignedReviewers || []).filter(
          (r): r is ReviewerCategory => validCategories.has(r)
        ),
        reasoning: route.reasoning || "",
      }))
      .filter((r) => r.assignedReviewers.length > 0);

    // Ensure every PR file appears in the plan
    const plannedFiles = new Set(validPlan.map((r) => r.filePath));
    for (const file of state.prDiff.files) {
      if (!plannedFiles.has(file.path)) {
        validPlan.push({
          filePath: file.path,
          assignedReviewers: ["naming"] as ReviewerCategory[],
          reasoning: "Not explicitly routed — default naming review",
        });
      }
    }

    console.log("   📋 Routing plan:");
    for (const route of validPlan) {
      console.log(
        `      ${route.filePath} → [${route.assignedReviewers.join(", ")}] (${route.reasoning})`
      );
    }

    return {
      routingPlan: validPlan,
      status: "reviewing",
    };
  } catch (error) {
    console.error(`   ❌ Routing failed: ${error}`);
    return {
      routingPlan: state.prDiff.files.map((f) => ({
        filePath: f.path,
        assignedReviewers: availableCategories,
        reasoning: "Fallback: routing error",
      })),
      status: "reviewing",
      errors: [`Routing error: ${error}`],
    };
  }
}

// ============================================
// Aggregation Node
// ============================================

async function aggregateResults(
  state: ReviewerGraphState
): Promise<Partial<ReviewerGraphState>> {
  console.log("\n📊 Reviewer: Aggregating results...");
  console.log(`   Total violations found: ${state.violations.length}`);

  const byType: Record<string, number> = {};
  for (const v of state.violations) {
    byType[v.type] = (byType[v.type] || 0) + 1;
  }

  if (Object.keys(byType).length > 0) {
    console.log(
      `   Breakdown: ${Object.entries(byType)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`
    );
  } else {
    console.log("   No violations detected — PR looks clean.");
  }

  // Validate that violations are grounded in conventions
  const groundedCount = state.violations.filter((v) =>
    state.conventions.some((c) => c.id === v.conventionId)
  ).length;

  console.log(
    `   Grounded violations: ${groundedCount}/${state.violations.length}`
  );

  const agenticCount = state.violations.filter(
    (v) => v.reasoning && v.impact && v.recommendation
  ).length;
  console.log(
    `   With full context (reasoning/impact/recommendation): ${agenticCount}/${state.violations.length}`
  );

  return { status: "complete" };
}

// ============================================
// Conditional Edge: Check if conventions provided
// ============================================

function shouldRetrieveConventions(state: ReviewerGraphState): string {
  if (state.conventions.length > 0) {
    console.log(`   Using ${state.conventions.length} pre-loaded conventions`);
    return "route_files";
  }
  return "retrieve_conventions";
}

// ============================================
// Build Reviewer Graph
// ============================================

export function createReviewerGraph() {
  return new StateGraph(ReviewerOrchestratorAnnotation)
    .addNode("retrieve_conventions", retrieveConventionsForReview)
    .addNode("route_files", routeFilesToReviewers)
    .addNode("naming_review", namingReviewNode)
    .addNode("structure_review", structureReviewNode)
    .addNode("pattern_review", patternReviewNode)
    .addNode("testing_review", testingReviewNode)
    .addNode("aggregate", aggregateResults)

    // If conventions provided (from parent orchestrator), skip retrieval
    .addConditionalEdges(START, shouldRetrieveConventions, {
      retrieve_conventions: "retrieve_conventions",
      route_files: "route_files",
    })
    .addEdge("retrieve_conventions", "route_files")

    // LLM orchestrator routes files, then sub-reviewers run in sequence
    .addEdge("route_files", "naming_review")
    .addEdge("naming_review", "structure_review")
    .addEdge("structure_review", "pattern_review")
    .addEdge("pattern_review", "testing_review")
    .addEdge("testing_review", "aggregate")
    .addEdge("aggregate", END)

    .compile();
}

// ============================================
// Entry Point
// ============================================

export async function reviewPR(
  prDiff: PRDiffInput,
  conventions?: Convention[]
): Promise<ReviewerState> {
  console.log(`\n🔍 Starting PR Review: ${prDiff.title}`);
  console.log(`   Files: ${prDiff.files.length}`);
  console.log(`   Branch: ${prDiff.headBranch} → ${prDiff.baseBranch}`);

  const graph = createReviewerGraph();

  const result = await graph.invoke({
    prDiff,
    conventions: conventions ?? [],
    violations: [],
    routingPlan: [],
    status: "pending",
    errors: [],
  });

  return {
    prNumber: prDiff.prNumber,
    violations: result.violations,
    status: result.status,
    reviewedFiles: prDiff.files.map((f) => f.path),
  };
}
