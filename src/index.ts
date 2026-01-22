import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runReview } from "./orchestrator/index.js";

const rl = readline.createInterface({ input, output });

// 1️⃣ Run REVIEW first
console.log("\n🔍 Running review...\n");

let state = await runReview({
  context: "REVIEW",
});

console.log(JSON.stringify(state.explainedFeedback, null, 2));

// 2️⃣ Enter question loop
while (true) {
  const question = await rl.question(
    "\n❓ Ask a question (or type 'exit'): "
  );

  if (question.toLowerCase() === "exit") {
    rl.close();
    process.exit(0);
  }

  state = await runReview({
    context: "QUESTION",
    question,
    state, // 👈 reuse everything from review
  });

  console.log("\n🧠 Answer:\n");
  console.log(state.explainedFeedback.at(-1)?.explanation);
}
