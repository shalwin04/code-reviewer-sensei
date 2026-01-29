// ============================================================================
// GLOBAL TESTING REVIEWER NODE
// Runs INSIDE the orchestrator graph
// ============================================================================

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { OrchestratorState } from "../../../orchestrator/index.js";
import type { Convention, RawViolation } from "../../../types/index.js";
import { getModelForTask } from "../../../utils/llm.js";

// ============================================================================
// Testing Review Node
// ============================================================================

export async function testingReviewNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🧪 Orchestrator: Running testing review...");

  if (!state.prDiff) {
    return {
      status: "error",
      errors: ["No PR diff available for testing review"],
    };
  }

  // 1️⃣ Read testing conventions from GLOBAL shared memory
  const testingConventions = state.conventions.filter(
    (c) => c.category === "testing"
  );

  if (testingConventions.length === 0) {
    console.log("   ⚠️ No testing conventions found");
    return {}; // do nothing
  }

  const llm = getModelForTask("reviewer", "google");
  const newViolations: RawViolation[] = [];

  // 2️⃣ Review each file in the PR
  for (const file of state.prDiff.files) {
    const fileName = file.path.split("/").pop() ?? "";
    const isTestFile =
      fileName.includes(".test.") || fileName.includes(".spec.");

    console.log(
      `   🧪 Reviewing ${isTestFile ? "TEST" : "SOURCE"} file: ${file.path}`
    );

    const systemPrompt = `
You are an expert testing practices reviewer.

${isTestFile ? `
For TEST FILES:
- Ensure describe/it structure
- Ensure assertions exist
- Check test naming clarity
- Avoid shared mutable state
- Proper beforeEach / afterEach usage
` : `
For SOURCE FILES:
- Check if new logic lacks tests
- Identify critical untested paths
`}

Team Testing Conventions:
${testingConventions
  .map(
    (c) => `
Rule: ${c.rule}
Description: ${c.description}
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
Return [] if none.
`;

    const userPrompt = `
File path: ${file.path}

Code diff:
${file.diff}
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
          id: `testing-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`,
          type: "testing",
          ...v,
        });
      }
    } catch (err) {
      console.error(`   ❌ Testing review failed for ${file.path}`, err);
    }
  }

  console.log(
    `   ✅ Testing review found ${newViolations.length} violations`
  );

  // 3️⃣ WRITE BACK TO GLOBAL SHARED STATE
  return {
    violations: [...state.violations, ...newViolations],
  };
}
