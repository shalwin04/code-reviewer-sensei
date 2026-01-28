import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { OrchestratorState } from "../../../orchestrator/index.js";
import type { RawViolation } from "../../../types/index.js";
import { getModelForTask } from "../../../utils/llm.js";

export async function namingReviewNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🏷️ Orchestrator: Running naming review...");

  if (!state.prDiff) return {};

  const namingConventions = state.conventions.filter(
    (c) => c.category === "naming"
  );

  if (namingConventions.length === 0) return {};

  const llm = getModelForTask("reviewer", "google");
  const violations: RawViolation[] = [];

  for (const file of state.prDiff.files) {
    const systemPrompt = `
You are a senior engineer enforcing TEAM NAMING CONVENTIONS.

Your job is NOT to restate rules.
Your job is to explain:
- WHY the team chose this naming convention
- What breaks if consistency is lost
- How it affects readability, reviews, and velocity

## Team Naming Conventions:
${namingConventions.map(c => `
Rule: ${c.rule}
Description: ${c.description}
Tags: ${c.tags.join(", ")}
Confidence: ${c.confidence}
`).join("\n---\n")}

Return ONLY a JSON array.
Each item must be:
{
  "issue": string,
  "conventionId": string,
  "file": string,
  "line": number,
  "code": string,
  "severity": "error" | "warning" | "suggestion",
  "reasoning": string,
  "impact": string,
  "recommendation": string
}
`;

    const userPrompt = `
File: ${file.path}
Code:
${file.diff}

Identify naming inconsistencies ONLY.
Explain why the TEAM naming style matters.
`;

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
  }
    console.log(
  state.violations.map(v => ({
    type: v.type,
    hasReasoning: !!v.reasoning,
    hasImpact: !!v.impact,
    hasRecommendation: !!v.recommendation,
  }))
);


  return {
    violations: [...state.violations, ...violations],
  };
}
