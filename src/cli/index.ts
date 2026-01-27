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
import { getSupabaseKnowledgeStore } from "../knowledge/supabase-store.js";
import { config } from "../config/index.js";
import { fetchPRDiff, fetchRepoCodeFiles, fetchRepoADRs } from "../integrations/github.js";
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

     if (options.repo) {
    config.repository.fullName = options.repo;
  }
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
  .requiredOption("-r, --repo <owner/repo>", "Repository full name (e.g., owner/repo)")
  .option("--from-github", "Fetch code directly from GitHub (no local clone needed)")
  .option("-c, --codebase <path>", "Path to local codebase directory")
  .option("-a, --adrs <path>", "Path to local ADR directory")
  .option("--pr-reviews <path>", "Path to PR review history file")
  .option("--incidents <path>", "Path to incident reports file")
  .option("-b, --branch <branch>", "GitHub branch to fetch from (default: main branch)")
  .action(async (options) => {
    const spinner = ora("Gathering learning sources...").start();

    try {
      // Validate repository name
      if (!options.repo || !options.repo.includes("/")) {
        spinner.fail("Invalid repository name");
        console.log(chalk.yellow("\nRepository must be in format: owner/repo"));
        process.exit(1);
      }

      console.log(chalk.cyan(`\nRepository: ${options.repo}`));

      const sources = {
        codebase: [] as string[],
        adrs: [] as string[],
        prReviews: [] as string[],
        incidents: [] as string[],
      };

      // Fetch from GitHub if --from-github flag is set
      if (options.fromGithub) {
        spinner.text = "Fetching code from GitHub...";
        console.log(chalk.gray(`\n  Fetching from GitHub: ${options.repo}`));

        try {
          // Fetch code files
          const codeFiles = await fetchRepoCodeFiles(options.repo, options.branch);
          sources.codebase = codeFiles.map((f) => `// File: ${f.path}\n${f.content}`);
          console.log(chalk.gray(`  Fetched ${sources.codebase.length} code files`));

          // Fetch ADRs if present
          const adrFiles = await fetchRepoADRs(options.repo, options.branch);
          sources.adrs = adrFiles.map((f) => `# File: ${f.path}\n${f.content}`);
          if (sources.adrs.length > 0) {
            console.log(chalk.gray(`  Fetched ${sources.adrs.length} ADR files`));
          }
        } catch (error) {
          spinner.fail("Failed to fetch from GitHub");
          console.error(chalk.red(`\nError: ${error}`));
          console.log(chalk.yellow("\nMake sure GITHUB_TOKEN is set in your .env file"));
          process.exit(1);
        }
      } else {
        // Local file sources
        if (options.codebase) {
          spinner.text = "Scanning codebase...";
          sources.codebase = await scanCodebase(options.codebase);
          console.log(chalk.gray(`  Found ${sources.codebase.length} code files`));
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
      }

      if (
        sources.codebase.length === 0 &&
        sources.adrs.length === 0 &&
        sources.prReviews.length === 0 &&
        sources.incidents.length === 0
      ) {
        spinner.fail("No learning sources found");
        console.log(
          chalk.yellow(
            "\nUse --from-github to fetch from GitHub, or --codebase for local files"
          )
        );
        process.exit(1);
      }

      spinner.text = "Learning conventions...";
      const result = await orchestrateLearning(sources, options.repo);

      spinner.succeed("Learning complete!");
      console.log(chalk.green(`\n${result.finalOutput}`));

      // Show stats from Supabase
      const store = await getSupabaseKnowledgeStore(options.repo);
      const stats = await store.getStats();
      console.log(chalk.cyan("\nKnowledge Store Stats:"));
      console.log(chalk.gray(`  Repository: ${options.repo}`));
      console.log(chalk.gray(`  Total Conventions: ${stats.conventions}`));
      if (Object.keys(stats.byCategory).length > 0) {
        console.log(chalk.gray(`  By Category:`));
        for (const [category, count] of Object.entries(stats.byCategory)) {
          console.log(chalk.gray(`    - ${category}: ${count}`));
        }
      }
      if (stats.lastLearned) {
        console.log(chalk.gray(`  Last Learned: ${new Date(stats.lastLearned).toLocaleString()}`));
      }
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
  .command("ask [question...]")
  .description("Ask a question about team conventions")
  .action(async (questionParts: string[]) => {
    let question: string;

    // If question provided as arguments, join them
    if (questionParts && questionParts.length > 0) {
      question = questionParts.join(" ");
    } else {
      // Interactive mode - prompt for question
      const { userQuestion } = await inquirer.prompt([
        {
          type: "input",
          name: "userQuestion",
          message: "What would you like to ask?",
          validate: (input: string) => input.trim().length > 0 || "Please enter a question",
        },
      ]);
      question = userQuestion;
    }

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
        // Ask for repository name
        const { repoName } = await inquirer.prompt([
          {
            type: "input",
            name: "repoName",
            message: "Repository (owner/repo):",
            validate: (input: string) => input.includes("/") || "Must be in format owner/repo",
          },
        ]);

        try {
          const store = await getSupabaseKnowledgeStore(repoName);
          const stats = await store.getStats();
          console.log(chalk.cyan("\nKnowledge Store Stats:"));
          console.log(chalk.gray(`  Repository: ${repoName}`));
          console.log(chalk.gray(`  Total Conventions: ${stats.conventions}`));
          if (Object.keys(stats.byCategory).length > 0) {
            for (const [category, count] of Object.entries(stats.byCategory)) {
              console.log(chalk.gray(`    - ${category}: ${count}`));
            }
          }
          if (stats.lastLearned) {
            console.log(chalk.gray(`  Last Learned: ${new Date(stats.lastLearned).toLocaleString()}`));
          }
        } catch (error) {
          console.error(chalk.red(`Failed to get stats: ${error}`));
        }
        console.log();
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
  .option("-r, --repo <owner/repo>", "Repository full name (e.g., owner/repo)")
  .action(async (options) => {
    try {
      console.log(chalk.cyan("\n📊 AI Tutor Status\n"));

      // Show Supabase status if repo is provided
      if (options.repo) {
        const store = await getSupabaseKnowledgeStore(options.repo);
        const stats = await store.getStats();
        const repoInfo = await store.getRepositoryInfo();

        console.log(chalk.white("Knowledge Store (Supabase):"));
        console.log(chalk.gray(`  Repository: ${options.repo}`));
        console.log(chalk.gray(`  Total Conventions: ${stats.conventions}`));
        if (Object.keys(stats.byCategory).length > 0) {
          console.log(chalk.gray(`  By Category:`));
          for (const [category, count] of Object.entries(stats.byCategory)) {
            console.log(chalk.gray(`    - ${category}: ${count}`));
          }
        }
        if (stats.lastLearned) {
          console.log(chalk.gray(`  Last Learned: ${new Date(stats.lastLearned).toLocaleString()}`));
        }
        if (repoInfo?.primary_language) {
          console.log(chalk.gray(`  Primary Language: ${repoInfo.primary_language}`));
        }
      } else {
        console.log(chalk.yellow("No repository specified. Use --repo to see knowledge store status."));
        console.log(chalk.gray("  Example: ai-tutor status --repo owner/repo"));
      }

      console.log(chalk.white("\nConfiguration:"));
      console.log(chalk.gray(`  Supabase URL: ${config.supabase.url ? "configured" : "not configured"}`));
      console.log(chalk.gray(`  Learner Model: ${config.agents.learner.model}`));
      console.log(chalk.gray(`  Reviewer Model: ${config.agents.reviewer.model}`));
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
