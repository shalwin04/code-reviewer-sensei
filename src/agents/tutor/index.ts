import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { createLLM } from "../../utils/llm.js";
import { config } from "../../config/index.js";
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";
import type { RawViolation, ExplainedFeedback, TutorState } from "../../types/index.js";

// ============================================
// Tutor Agent State
// ============================================

const TutorAgentAnnotation = Annotation.Root({
  violations: Annotation<RawViolation[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  explainedFeedback: Annotation<ExplainedFeedback[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  status: Annotation<TutorState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
});

type TutorAgentState = typeof TutorAgentAnnotation.State;

// ============================================
// Node Functions
// ============================================

async function explainViolationsNode(
  state: TutorAgentState
): Promise<Partial<TutorAgentState>> {
  console.log("🎓 Tutor Agent: Explaining violations...");

  const llm = createLLM(config.agents.tutor);
  const explained: ExplainedFeedback[] = [];

  // Get conventions from knowledge store for context
  let conventions: any[] = [];
  try {
    if (config.repository.fullName) {
      const store = await getSupabaseKnowledgeStore(config.repository.fullName);
      conventions = await store.getAllConventions();
    }
  } catch {
    // Continue without conventions if store unavailable
  }

  for (const violation of state.violations) {
    // Find matching convention
    const convention = conventions.find(
      (c) => c.id === violation.conventionId
    );

    const approvedPattern = convention?.examples?.[0]?.good ??
      convention?.examples?.[0]?.explanation ??
      "Follow the documented team pattern.";

    const prompt = `
You are a calm engineering tutor helping a developer understand a code review finding.

Violation found:
- File: ${violation.file}
- Line: ${violation.line}
- Code: ${violation.code || "N/A"}
- Issue: ${violation.issue}
- Severity: ${violation.severity}

${convention ? `
Team Convention:
- Rule: ${convention.rule}
- Why: ${convention.description}
- Approved pattern: ${approvedPattern}
` : ""}

Instructions:
- Explain in 4-6 sentences why this matters
- Be constructive and educational
- Show the right way to do it
- Don't shame, teach
`;

    try {
      const response = await llm.invoke(prompt);
      let explanation = response.content?.toString() || "";

      // Clean up the explanation
      explanation = explanation.replace(/\n+/g, " ").trim();
      explanation = explanation.split(". ").slice(0, 5).join(". ") + ".";
      explanation = explanation.replace(/\.\.+$/, ".");

      explained.push({
        id: `explain-${violation.id}`,
        violation,
        explanation,
        teamExpectation: approvedPattern,
      });
    } catch (error) {
      console.error(`   Error explaining violation ${violation.id}:`, error);
      explained.push({
        id: `explain-${violation.id}`,
        violation,
        explanation: `This code violates: ${violation.issue}`,
        teamExpectation: "Follow team conventions",
      });
    }
  }

  console.log(`   Explained ${explained.length} violations`);

  return {
    explainedFeedback: explained,
    status: "complete",
  };
}

// ============================================
// Build Tutor Graph
// ============================================

export function createTutorGraph() {
  const graph = new StateGraph(TutorAgentAnnotation)
    .addNode("explain_violations", explainViolationsNode)
    .addEdge(START, "explain_violations")
    .addEdge("explain_violations", END);

  return graph.compile();
}

// ============================================
// Public API
// ============================================

export async function explainFeedback(violations: RawViolation[]): Promise<TutorState> {
  console.log(`\n🎓 Starting Tutor for ${violations.length} violations`);

  const graph = createTutorGraph();

  const result = await graph.invoke({
    violations,
    explainedFeedback: [],
    status: "pending",
  });

  return {
    violations: result.violations,
    explainedFeedback: result.explainedFeedback,
    status: result.status,
  };
}

export async function answerQuestion(question: string): Promise<string> {
  console.log(`\n❓ Tutor Agent: Answering question: "${question.substring(0, 50)}..."`);

  const llm = createLLM(config.agents.tutor);

  // Get conventions from knowledge store for context
  let conventionContext = "";
  try {
    if (config.repository.fullName) {
      const store = await getSupabaseKnowledgeStore(config.repository.fullName);
      const conventions = await store.getAllConventions();
      if (conventions.length > 0) {
        conventionContext = `
Available team conventions for context:
${conventions.slice(0, 10).map(c => `- [${c.category}] ${c.rule}`).join("\n")}
`;
      }
    }
  } catch {
    // Continue without conventions if store unavailable
  }

  const prompt = `
You are a helpful engineering tutor answering questions about team conventions and coding practices.

${conventionContext}

Question: ${question}

Instructions:
- Answer concisely in 3-5 sentences
- Focus on the team's perspective and reasoning
- Be helpful and educational
- If the question is about something not covered by team conventions, provide general best practices
`;

  try {
    const response = await llm.invoke(prompt);
    let answer = response.content?.toString() || "";

    // Clean up
    answer = answer.replace(/\n+/g, " ").trim();
    answer = answer.split(". ").slice(0, 5).join(". ") + ".";
    answer = answer.replace(/\.\.+$/, ".");

    return answer;
  } catch (error) {
    console.error("Error answering question:", error);
    return "I'm sorry, I couldn't answer that question. Please try rephrasing or ask about a specific convention.";
  }
}
