// ============================================================================
// GLOBAL STRUCTURE REVIEWER NODE
// Runs INSIDE the orchestrator graph
// ============================================================================

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { OrchestratorState } from "../../../orchestrator/index.js";
import type { Convention, RawViolation } from "../../../types/index.js";
import { getModelForTask } from "../../../utils/llm.js";

// ============================================================================
// Structure Review Node
// ============================================================================

export async function structureReviewNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🏗️ Orchestrator: Running structure review...");

  if (!state.prDiff) {
    return {
      status: "error",
      errors: ["No PR diff available for structure review"],
    };
  }

  // 1️⃣ Read conventions from GLOBAL shared memorys
  const structureConventions = state.conventions.filter(
    (c) => c.category === "structure"
  );

  if (structureConventions.length === 0) {
    console.log("   ⚠️ No structure conventions found");
    return {}; // do nothing, keep existing violations
  }

  const llm = getModelForTask("reviewer", "google");
  const newViolations: RawViolation[] = [];

  // 2️⃣ Review each file in the PR
  for (const file of state.prDiff.files) {
    console.log(`   🏗️ Reviewing structure of ${file.path}`);

    const systemPrompt = `
You are an expert code structure reviewer.

## Team Structure Conventions:
${structureConventions
  .map(
    (c) => `
### ${c.rule}
${c.description}
Tags: ${c.tags.join(", ")}
Confidence: ${c.confidence}
`
  )
  .join("\n---\n")}

Return ONLY a JSON array of violations.
Each violation must be:
{
  "issue": string,
  "conventionId": string,
  "file": string,
  "line": number,
  "code": string,
  "severity": "error" | "warning" | "suggestion"
}
If none, return [].
`;

    const userPrompt = `
File path: ${file.path}

Code diff:
${file.diff}

Analyze ONLY structural issues.
`;

    try {
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content.toString();
      const match = content.match(/\[[\s\S]*\]/);

      if (!match) continue;

      const parsed = JSON.parse(match[0]);

      for (const v of parsed) {
        newViolations.push({
          id: `structure-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`,
          type: "structure",
          ...v,
        });
      }
    } catch (err) {
      console.error(`   ❌ Structure review failed for ${file.path}`, err);
    }
  }

  console.log(`   ✅ Structure review found ${newViolations.length} violations`);

  // 3️⃣ WRITE DIRECTLY TO GLOBAL SHARED MEMORY
  return {
    violations: [...state.violations, ...newViolations],
  };
}
