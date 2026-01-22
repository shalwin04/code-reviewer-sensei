#!/usr/bin/env node

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { runReview } from "../orchestrator/index.js";

const program = new Command();

program
  .name("ai-tutor")
  .description("Team-aware AI Tutor with review + follow-up questions")
  .version("1.0.0");

/**
 * SESSION COMMAND
 * Runs review first, then allows interactive questions
 */
program
  .command("session")
  .description("Run a review and ask follow-up questions")
  .option("-p, --pr <number>", "PR number (optional)")
  .action(async () => {
    const rl = readline.createInterface({ input, output });

    console.log("\n🔍 Running review...\n");

    // 1️⃣ Run REVIEW (learner + reviewer + tutor)
    let state = await runReview({ context: "REVIEW" });

    // Show review feedback
    console.log("📝 Review Feedback:\n");
    console.log(
      JSON.stringify(state.explainedFeedback, null, 2)
    );

    // 2️⃣ Question loop
    while (true) {
      const question = await rl.question(
        "\n❓ Ask a question (type 'exit' to quit): "
      );

      if (question.trim().toLowerCase() === "exit") {
        rl.close();
        process.exit(0);
      }

      // 3️⃣ Ask QUESTION using SAME STATE
      state = await runReview({
        context: "QUESTION",
        question,
        state, // ← reuse learned + reviewed state
      });

      const answer =
        state.explainedFeedback.at(-1)?.explanation;

      console.log("\n🧠 Answer:\n");
      console.log(answer ?? "No answer generated.");
    }
  });

/**
 * REVIEW COMMAND
 * One-shot review (CI / GitHub usage)
 */
program
  .command("review")
  .description("Run a one-time review (no questions)")
  .action(async () => {
    const state = await runReview({ context: "REVIEW" });
    console.log(JSON.stringify(state, null, 2));
  });

program.parse();
