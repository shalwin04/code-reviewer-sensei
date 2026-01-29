import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { OrchestratorState } from "../../../orchestrator/index.js";
import type { RawViolation } from "../../../types/index.js";
import { getModelForTask } from "../../../utils/llm.js";

export async function patternReviewNode(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {
  console.log("\n🧠 Orchestrator: Running pattern review...");

  if (!state.prDiff) return {};

  const patternConventions = state.conventions.filter(
    (c) => c.category === "pattern"
  );

  if (patternConventions.length === 0) return {};

  const llm = getModelForTask("reviewer", "google");
  const violations: RawViolation[] = [];

  for (const file of state.prDiff.files) {
    const systemPrompt = `
You are a STAFF ENGINEER reviewing architectural patterns.

Focus on:
- API consistency
- Latency implications
- Coupling and long-term maintainability
- Why the TEAM standardized this pattern

## Team Architectural Patterns:
${patternConventions.map(c => `
Rule: ${c.rule}
Description: ${c.description}
Tags: ${c.tags.join(", ")}
Confidence: ${c.confidence}
`).join("\n---\n")}

Return ONLY JSON array with:
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

Detect architectural or API pattern deviations.
Explain trade-offs (latency, coupling, scaling).
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
        id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "pattern",
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
