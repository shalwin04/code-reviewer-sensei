// ============================================================================
// Naming Reviewer — GROUNDED, DIFF-BOUNDED, EDUCATIONAL
//
// Philosophy: Explain why THIS REPOSITORY cares, with enough detail for learning.
// Output: Concise but helpful. 1-2 sentences per field so juniors understand.
// ============================================================================

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ReviewerGraphState } from "../state.js";
import type { RawViolation } from "../../../types/index.js";
import { getModelForTask } from "../../../utils/llm.js";

export async function namingReviewNode(
  state: ReviewerGraphState
): Promise<Partial<ReviewerGraphState>> {
  console.log("\n🏷️  Naming Reviewer: Starting...");

  if (!state.prDiff) return {};

  const namingConventions = state.conventions.filter(
    (c) => c.category === "naming"
  );

  if (namingConventions.length === 0) {
    console.log("   ⏭️  No naming conventions — skipping");
    return {};
  }

  const assignedFiles =
    state.routingPlan.length > 0
      ? state.prDiff.files.filter((f) =>
          state.routingPlan.some(
            (r) => r.filePath === f.path && r.assignedReviewers.includes("naming")
          )
        )
      : state.prDiff.files;

  if (assignedFiles.length === 0) {
    console.log("   ⏭️  No files assigned");
    return {};
  }

  console.log(`   Reviewing ${assignedFiles.length} file(s)`);

  const llm = getModelForTask("reviewer", "google");
  const violations: RawViolation[] = [];

  for (const file of assignedFiles) {
    console.log(`   🏷️  ${file.path}`);

    // Build conventions with examples for better grounding
    const conventionsWithExamples = namingConventions
      .map((c) => {
        const example = c.examples?.[0];
        return `- [${c.id}] ${c.rule}: ${c.description}${
          example ? `\n  ✅ Good: ${example.good || "N/A"} | ❌ Bad: ${example.bad || "N/A"}` : ""
        }`;
      })
      .join("\n");

    const systemPrompt = `You are a code reviewer checking naming conventions.

## THIS REPOSITORY'S NAMING RULES (only use these):
${conventionsWithExamples}

## YOUR TASK:
Find naming violations in the diff. For each violation:
- Only cite rules from above (NEVER invent generic programming rules)
- Only flag code that appears in the diff
- Explain clearly so a junior developer can understand and learn

## OUTPUT FORMAT (JSON array only, no markdown):
[{
  "issue": "Clear description of the naming problem",
  "conventionId": "The ID from conventions above (e.g., conv-naming-1)",
  "file": "file path",
  "line": line number,
  "code": "the problematic identifier",
  "severity": "error|warning|suggestion",
  "reasoning": "Why this matters to OUR team (1-2 sentences citing the specific convention)",
  "impact": "What problems this causes: code review friction, confusion, tooling issues (1-2 sentences)",
  "recommendation": "Specific fix: rename X to Y following our convention"
}]

Return [] if no violations found.`;

    const userPrompt = `File: ${file.path}
Diff:
${file.diff}

Find naming violations. Only use the repository's conventions listed above.`;

    try {
      const res = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const match = res.content.toString().match(/\[[\s\S]*\]/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]);
      for (const v of parsed) {
        violations.push({
          id: `naming-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: "naming",
          ...v,
        });
      }
    } catch (err) {
      console.error(`   ❌ Failed: ${file.path}`, err);
    }
  }

  console.log(`   ✅ Found ${violations.length} violations`);
  return { violations: [...state.violations, ...violations] };
}
