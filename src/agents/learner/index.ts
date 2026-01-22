import type { OrchestratorState } from "../graph.js";

export async function learnerAgent(): Promise<Partial<OrchestratorState>> {
  return {
    teamKnowledge: [
      {
        id: "ERR-03",
        category: "error-handling",
        rule: "External service calls must handle failures",
        description:
          "Unhandled failures caused a production outage when the payment service went down.",
        examples: [
          {
            explanation: "External service calls should never be made without protection.",
            good: "Wrap calls in try/catch with logging or use a circuit breaker.",
            bad: "Calling external services directly without handling failures.",
          },
        ],
        source: {
          type: "incident",
          reference: "INC-429",
          timestamp: new Date().toISOString(),
        },
        confidence: 0.9,
        tags: ["reliability", "payments", "downtime"],
      },
    ],
  };
}
