import { START, END } from "@langchain/langgraph";
import { createMainGraph } from "../agents/graph.js";

import { learnerAgent } from "../agents/learner/index.js";
import { reviewerAgent } from "../agents/reviewer/index.js";
import { tutorAgent } from "../agents/tutor/index.js";

export async function runReview(
  input: {
    context: "REVIEW" | "QUESTION";
    question?: string;
    state?: any;
  }
) {
  const graph = createMainGraph()
    .addNode("learner", learnerAgent)
    .addNode("reviewer", reviewerAgent)
    .addNode("tutor", tutorAgent)
    .addEdge(START, "learner")
    .addEdge("learner", "reviewer")
    .addEdge("reviewer", "tutor")
    .addEdge("tutor", END);

  const app = graph.compile();

  return app.invoke({
    ...input.state,   // 👈 reuse previous state
    context: input.context,
    question: input.question,
  });
}

