import type { OrchestratorState } from "../graph.js";
import { createLLM } from "../../utils/llm.js";
import { config } from "../../config/index.js";

export async function tutorAgent(
  state: OrchestratorState
): Promise<Partial<OrchestratorState>> {

  /* ================= QUESTION MODE ================= */
  if (state.context === "QUESTION") {
  const llm = createLLM(config.agents.tutor);

  const res = await llm.invoke(`
You are a concise engineering tutor.

Answer the question in **3–4 sentences max**.
Do NOT give long explanations.
Focus only on team reasoning.

Question:
${state.question}
`);

  let explanation = res.content.toString();
  explanation = explanation.replace(/\n+/g, " ").trim();
  explanation = explanation.split(". ").slice(0, 4).join(". ") + ".";

  return {
    explainedFeedback: [
      {
        id: "question-answer",
        violation: {
          id: "question-answer",
          type: "question",
          issue: state.question || "",
          conventionId: "",
          file: "",
          line: 0,
          severity: "suggestion" as const,
        },
        explanation,
        teamExpectation: "Follow team conventions",
      },
    ],
    status: "completed",
  };
}

  /* ================= REVIEW MODE ================= */
  const llm = createLLM(config.agents.tutor);
  const explained = [];

  for (const violation of state.violations) {
    const convention = state.teamKnowledge.find(
      (c) => c.id === violation.conventionId
    );
    if (!convention) continue;

    const approvedPattern =
      convention.examples?.[0]?.good ??
      convention.examples?.[0]?.explanation ??
      "Follow the documented team pattern.";

    const prompt = `
You are a calm engineering tutor.

Violation:
${violation.file}:${violation.line}
${violation.code}

Team rule:
${convention.rule}

Why this rule exists:
${convention.description}

Approved pattern:
${approvedPattern}

Instructions:
Keep the explanation concise (4–6 sentences).
Teach. Do not shame.
`;

    const res = await llm.invoke(prompt);

    let explanation = res.content.toString();
    explanation = explanation.replace(/\n+/g, " ").trim();
    explanation = explanation.split(". ").slice(0, 5).join(". ") + ".";
    explanation = explanation.replace(/\.\.+$/, ".");

    explained.push({
      id: `explain-${violation.id}`,
      violation,
      explanation,
      teamExpectation: approvedPattern,
    });
  }

  return {
    explainedFeedback: explained,
    status: "completed",
  };
}
