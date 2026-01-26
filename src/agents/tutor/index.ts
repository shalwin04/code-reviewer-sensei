import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { createLLM } from "../../utils/llm.js";
import { config } from "../../config/index.js";
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";
import type { RawViolation, ExplainedFeedback, TutorState, Convention } from "../../types/index.js";

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
  let conventions: Convention[] = [];
  let conventionContext = "";

  try {
    if (config.repository.fullName) {
      console.log(`   Loading conventions from: ${config.repository.fullName}`);
      const store = await getSupabaseKnowledgeStore(config.repository.fullName);
      conventions = await store.getAllConventions();
      console.log(`   Found ${conventions.length} conventions`);

      if (conventions.length > 0) {
        // Build detailed context from conventions
        conventionContext = `
## Team Conventions (${conventions.length} total)

${conventions.slice(0, 15).map(c => `### [${c.category.toUpperCase()}] ${c.rule}
${c.description}
${c.examples?.[0]?.good ? `Good: ${c.examples[0].good.substring(0, 100)}...` : ""}
`).join("\n")}
`;
      }
    } else {
      console.log("   No repository configured - answering without conventions");
    }
  } catch (error) {
    console.error("   Error loading conventions:", error);
  }

  const prompt = conventionContext ? `
You are a helpful engineering tutor for a development team. You have access to the team's coding conventions and standards.

${conventionContext}

Based on the team conventions above, answer this question:
"${question}"

Instructions:
- Reference specific conventions when applicable
- Explain the team's reasoning behind the convention
- Be concise but educational (3-5 sentences)
- If no convention directly applies, say so and provide general best practices
` : `
You are a helpful engineering tutor answering questions about coding practices.

Question: "${question}"

Instructions:
- Note: No team conventions are loaded. Providing general best practices.
- Answer concisely in 3-5 sentences
- Be helpful and educational
`;

  try {
    const response = await llm.invoke(prompt);
    let answer = response.content?.toString() || "";

    // Light cleanup - preserve formatting
    answer = answer.trim();

    // Add convention count info
    if (conventions.length > 0) {
      answer = `[Based on ${conventions.length} team conventions]\n\n${answer}`;
    }

    return answer;
  } catch (error) {
    console.error("Error answering question:", error);
    return "I'm sorry, I couldn't answer that question. Please try rephrasing or ask about a specific convention.";
  }
}
