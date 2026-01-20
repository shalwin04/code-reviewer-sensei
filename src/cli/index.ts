#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { promises as fs } from "fs";
import path from "path";
import {
  orchestrateReview,
  orchestrateQuestion,
  orchestrateLearning,
  formatForConsole,
} from "../orchestrator/index.js";
import { getKnowledgeStore } from "../knowledge/store.js";
import { config } from "../config/index.js";
import { fetchPRDiff } from "../integrations/github.js";
import type { FeedbackControllerStateUpdated } from "../types/index.js";

const program = new Command();

program
  .name("ai-tutor")
  .description("Team-Aware AI Tutor + PR Reviewer")
  .version("1.0.0");

// ============================================
// Review Command
// ============================================

program
  .command("review")
  .description("Review a pull request or local changes")
  .option("-p, --pr <number>", "GitHub PR number to review")
  .option("-r, --repo <owner/repo>", "GitHub repository (e.g., owner/repo)")
  .option("-f, --files <paths...>", "Local files to review")
  .option("-d, --diff <path>", "Path to a diff file")
  .option("--format <type>", "Output format: console, json, github", "console")
  .action(async (options) => {
    const spinner = ora("Starting review...").start();

    try {
      let prDiff;

      if (options.pr && options.repo) {
        spinner.text = `Fetching PR #${options.pr} from ${options.repo}...`;
        prDiff = await fetchPRDiff(options.repo, parseInt(options.pr));
      } else if (options.diff) {
        spinner.text = `Reading diff from ${options.diff}...`;
        const diffContent = await fs.readFile(options.diff, "utf-8");
        prDiff = {
          prNumber: 0,
          title: "Local Review",
          files: [
            {
              path: options.diff,
              diff: diffContent,
              status: "modified" as const,
              additions: 0,
              deletions: 0,
            },
          ],
          baseBranch: "main",
          headBranch: "local",
        };
      } else if (options.files) {
        spinner.text = "Reading local files...";
        const files = await Promise.all(
          options.files.map(async (filePath: string) => {
            const content = await fs.readFile(filePath, "utf-8");
            return {
              path: filePath,
              diff: content,
              status: "modified" as const,
              additions: content.split("\n").length,
              deletions: 0,
            };
          })
        );
        prDiff = {
          prNumber: 0,
          title: "Local Review",
          files,
          baseBranch: "main",
          headBranch: "local",
        };
      } else {
        spinner.fail("Please provide either --pr with --repo, --diff, or --files");
        process.exit(1);
      }

      spinner.text = "Analyzing code...";
      const result = await orchestrateReview(prDiff);

      spinner.succeed("Review complete!");

      if (result.status === "error") {
        console.error(chalk.red("\nErrors occurred:"));
        result.errors.forEach((e) => console.error(chalk.red(`  - ${e}`)));
        process.exit(1);
      }

      if (options.format === "json") {
        console.log(JSON.stringify(result.finalOutput, null, 2));
      } else {
        const output = formatForConsole(
          result.finalOutput as FeedbackControllerStateUpdated
        );
        console.log(output);
      }
    } catch (error) {
      spinner.fail("Review failed");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// ============================================
// Learn Command
// ============================================

program
  .command("learn")
  .description("Learn conventions from your codebase")
  .option("-c, --codebase <path>", "Path to codebase directory")
  .option("-a, --adrs <path>", "Path to ADR directory")
  .option("--pr-reviews <path>", "Path to PR review history file")
  .option("--incidents <path>", "Path to incident reports file")
  .action(async (options) => {
    const spinner = ora("Gathering learning sources...").start();

    try {
      const sources = {
        codebase: [] as string[],
        adrs: [] as string[],
        prReviews: [] as string[],
        incidents: [] as string[],
      };

      if (options.codebase) {
        spinner.text = "Scanning codebase...";
        sources.codebase = await scanCodebase(options.codebase);
        console.log(chalk.gray(`\n  Found ${sources.codebase.length} code files`));
      }

      if (options.adrs) {
        spinner.text = "Reading ADRs...";
        sources.adrs = await readDirectory(options.adrs);
        console.log(chalk.gray(`  Found ${sources.adrs.length} ADR files`));
      }

      if (options.prReviews) {
        spinner.text = "Reading PR reviews...";
        const content = await fs.readFile(options.prReviews, "utf-8");
        sources.prReviews = [content];
      }

      if (options.incidents) {
        spinner.text = "Reading incident reports...";
        const content = await fs.readFile(options.incidents, "utf-8");
        sources.incidents = [content];
      }

      if (
        sources.codebase.length === 0 &&
        sources.adrs.length === 0 &&
        sources.prReviews.length === 0 &&
        sources.incidents.length === 0
      ) {
        spinner.fail("No learning sources provided");
        console.log(
          chalk.yellow(
            "\nUse --codebase, --adrs, --pr-reviews, or --incidents to specify sources"
          )
        );
        process.exit(1);
      }

      spinner.text = "Learning conventions...";
      const result = await orchestrateLearning(sources);

      spinner.succeed("Learning complete!");
      console.log(chalk.green(`\n${result.finalOutput}`));

      // Show stats
      const store = await getKnowledgeStore(config.knowledgeStore.path);
      const stats = store.getStats();
      console.log(chalk.cyan("\nKnowledge Store Stats:"));
      console.log(chalk.gray(`  Conventions: ${stats.conventions}`));
      console.log(chalk.gray(`  Entries: ${stats.entries}`));
      console.log(chalk.gray(`  Examples: ${stats.examples}`));
    } catch (error) {
      spinner.fail("Learning failed");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// ============================================
// Ask Command
// ============================================

program
  .command("ask <question>")
  .description("Ask a question about team conventions")
  .action(async (question) => {
    const spinner = ora("Thinking...").start();

    try {
      const result = await orchestrateQuestion(question);

      spinner.succeed("Here's what I found:");
      console.log(chalk.white(`\n${result.finalOutput}\n`));
    } catch (error) {
      spinner.fail("Failed to answer question");
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// ============================================
// Interactive Command
// ============================================

program
  .command("interactive")
  .alias("i")
  .description("Start interactive mode")
  .action(async () => {
    console.log(chalk.cyan("\n🤖 AI Tutor Interactive Mode"));
    console.log(chalk.gray("Type 'exit' to quit, 'help' for commands\n"));

    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to do?",
          choices: [
            { name: "📝 Review code", value: "review" },
            { name: "📚 Learn from codebase", value: "learn" },
            { name: "❓ Ask a question", value: "ask" },
            { name: "📊 View knowledge stats", value: "stats" },
            { name: "🚪 Exit", value: "exit" },
          ],
        },
      ]);

      if (action === "exit") {
        console.log(chalk.cyan("\nGoodbye! 👋\n"));
        break;
      }

      if (action === "stats") {
        const store = await getKnowledgeStore(config.knowledgeStore.path);
        const stats = store.getStats();
        console.log(chalk.cyan("\nKnowledge Store Stats:"));
        console.log(chalk.gray(`  Conventions: ${stats.conventions}`));
        console.log(chalk.gray(`  Entries: ${stats.entries}`));
        console.log(chalk.gray(`  Examples: ${stats.examples}\n`));
        continue;
      }

      if (action === "ask") {
        const { question } = await inquirer.prompt([
          {
            type: "input",
            name: "question",
            message: "Your question:",
          },
        ]);

        if (question) {
          const spinner = ora("Thinking...").start();
          try {
            const result = await orchestrateQuestion(question);
            spinner.succeed("Answer:");
            console.log(chalk.white(`\n${result.finalOutput}\n`));
          } catch (error) {
            spinner.fail("Failed");
            console.error(chalk.red(error));
          }
        }
        continue;
      }

      if (action === "review") {
        const { reviewType } = await inquirer.prompt([
          {
            type: "list",
            name: "reviewType",
            message: "What to review?",
            choices: [
              { name: "GitHub PR", value: "pr" },
              { name: "Local files", value: "files" },
              { name: "Diff file", value: "diff" },
            ],
          },
        ]);

        console.log(
          chalk.gray(
            `\nUse 'ai-tutor review' with appropriate options for ${reviewType} review\n`
          )
        );
        continue;
      }

      if (action === "learn") {
        console.log(
          chalk.gray("\nUse 'ai-tutor learn' with appropriate options\n")
        );
        continue;
      }
    }
  });

// ============================================
// Status Command
// ============================================

program
  .command("status")
  .description("Show knowledge store status")
  .action(async () => {
    try {
      const store = await getKnowledgeStore(config.knowledgeStore.path);
      const stats = store.getStats();

      console.log(chalk.cyan("\n📊 AI Tutor Status\n"));
      console.log(chalk.white("Knowledge Store:"));
      console.log(chalk.gray(`  Path: ${config.knowledgeStore.path}`));
      console.log(chalk.gray(`  Conventions: ${stats.conventions}`));
      console.log(chalk.gray(`  Entries: ${stats.entries}`));
      console.log(chalk.gray(`  Examples: ${stats.examples}`));

      console.log(chalk.white("\nConfiguration:"));
      console.log(
        chalk.gray(`  Learner Model: ${config.agents.learner.model}`)
      );
      console.log(
        chalk.gray(`  Reviewer Model: ${config.agents.reviewer.model}`)
      );
      console.log(chalk.gray(`  Tutor Model: ${config.agents.tutor.model}`));

      console.log();
    } catch (error) {
      console.error(chalk.red("Failed to get status"));
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// ============================================
// Helper Functions
// ============================================

async function scanCodebase(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];

  async function scan(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          await scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          const content = await fs.readFile(fullPath, "utf-8");
          // Only include files under 10KB to avoid overwhelming the model
          if (content.length < 10000) {
            results.push(content);
          }
        }
      }
    }
  }

  await scan(dirPath);
  return results.slice(0, 50); // Limit to 50 files
}

async function readDirectory(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const fullPath = path.join(dirPath, entry.name);
      const content = await fs.readFile(fullPath, "utf-8");
      results.push(content);
    }
  }

  return results;
}

// ============================================
// Run CLI
// ============================================

program.parse();
