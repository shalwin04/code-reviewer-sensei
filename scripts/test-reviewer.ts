#!/usr/bin/env tsx
// ============================================================================
// Manual Integration Test — Reviewer + Tutor Agents with Real LLM
//
// Usage:
//   npx tsx scripts/test-reviewer.ts
//
// Requirements:
//   - GOOGLE_API_KEY in .env (for Gemini LLM calls)
//   - NO Supabase needed (conventions are passed inline)
//
// What this tests:
//   1. Reviewer agent: LLM orchestrator routes files to sub-reviewers
//   2. Sub-reviewers: Generate violations with reasoning, impact, recommendation
//   3. Tutor agent: Explains violations in junior-dev-friendly language (no hallucination)
// ============================================================================

import { config as dotenvConfig } from "dotenv";
dotenvConfig();

// Validate API key before doing anything
if (!process.env.GOOGLE_API_KEY) {
  console.error("\n❌ GOOGLE_API_KEY is not set in your .env file.");
  console.error("   The reviewer and tutor need Gemini to run.\n");
  process.exit(1);
}

import { reviewPR } from "../src/agents/reviewer/index.js";
import { explainFeedback } from "../src/agents/tutor/index.js";
import type { PRDiffInput, Convention } from "../src/types/index.js";

// ============================================================================
// 1. Sample Team Conventions (what the learner would produce)
// ============================================================================

const now = new Date().toISOString();

const sampleConventions: Convention[] = [
  // --- Naming ---
  {
    id: "naming-001",
    category: "naming",
    rule: "Use camelCase for all function and variable names",
    description:
      "Functions and local variables must use camelCase (e.g. getUser, firstName). No snake_case or PascalCase for functions.",
    examples: [
      {
        good: "function getUser() {}",
        bad: "function get_user() {}",
        explanation: "snake_case is forbidden for functions",
      },
    ],
    source: { type: "codebase", reference: "src/", timestamp: now },
    confidence: 0.95,
    tags: ["naming", "functions", "variables"],
  },
  {
    id: "naming-002",
    category: "naming",
    rule: "Use PascalCase for class names",
    description: "Class names must be PascalCase (e.g. UserController, PaymentService).",
    examples: [
      {
        good: "class UserController {}",
        bad: "class user_controller {}",
        explanation: "Classes are PascalCase in this codebase",
      },
    ],
    source: { type: "codebase", reference: "src/", timestamp: now },
    confidence: 0.9,
    tags: ["naming", "classes"],
  },

  // --- Structure ---
  {
    id: "structure-001",
    category: "structure",
    rule: "Controllers must NOT import from database modules directly",
    description:
      "Controllers handle HTTP only. They call services, which call the DB. This keeps layers separate and testable.",
    examples: [
      {
        bad: "import { db } from '../database/connection'",
        good: "import { UserService } from '../services/user.service'",
        explanation: "Controller should use service, not DB directly",
      },
    ],
    source: { type: "adr", reference: "docs/adr-002.md", timestamp: now },
    confidence: 0.95,
    tags: ["structure", "layering", "controllers"],
  },

  // --- Pattern ---
  {
    id: "pattern-001",
    category: "pattern",
    rule: "No raw SQL queries outside the repository layer",
    description:
      "Raw SQL (db.query, knex.raw) must live in repository files only. This prevents SQL injection and centralizes queries.",
    examples: [
      {
        bad: "db.query('SELECT * FROM users')",
        good: "userRepository.findAll()",
        explanation: "Use repository methods, not raw SQL",
      },
    ],
    source: { type: "pr-review", reference: "PR #42", timestamp: now },
    confidence: 0.9,
    tags: ["pattern", "sql", "security"],
  },
  {
    id: "pattern-002",
    category: "pattern",
    rule: "No console.log in production code",
    description:
      "Use the team logger (logger.info, logger.error) instead of console.log. This ensures proper log levels and structured output.",
    examples: [
      {
        good: "logger.info('User fetched', { userId })",
        bad: "console.log('User fetched:', result)",
        explanation: "console.log has no log levels",
      },
    ],
    source: { type: "incident", reference: "INC-2024-017", timestamp: now },
    confidence: 0.85,
    tags: ["pattern", "logging"],
  },

  // --- Testing ---
  {
    id: "testing-001",
    category: "testing",
    rule: "Every service file must have a corresponding test file",
    description:
      "When you add or modify a service, there must be a matching .test.ts or .spec.ts file with tests.",
    examples: [
      {
        good: "payment.service.ts → payment.service.test.ts",
        explanation: "Test file matches service file",
      },
    ],
    source: { type: "codebase", reference: "src/tests/", timestamp: now },
    confidence: 0.9,
    tags: ["testing", "coverage"],
  },
  {
    id: "testing-002",
    category: "testing",
    rule: "Tests must not share mutable state",
    description:
      "Each test must be independent. Don't use let variables at describe scope that are mutated across tests.",
    examples: [
      {
        bad: "let state = {}; it('test 1', () => { state.x = 1; });",
        good: "it('test 1', () => { const state = {}; ... });",
        explanation: "Shared state makes tests order-dependent and flaky",
      },
    ],
    source: { type: "pr-review", reference: "PR #55", timestamp: now },
    confidence: 0.95,
    tags: ["testing", "isolation"],
  },
];

// ============================================================================
// 2. Sample PR Diff — intentionally bad code
// ============================================================================

const samplePRDiff: PRDiffInput = {
  prNumber: 42,
  title: "feat: add user management and payment processing",
  baseBranch: "main",
  headBranch: "feature/user-payments",
  files: [
    // File 1: Controller with MANY issues
    {
      path: "src/controllers/user_controller.ts",
      diff: `+import { db } from '../database/connection';
+import { Request, Response } from 'express';
+
+export class user_controller {
+  async get_user(req: Request, res: Response) {
+    const user_id = req.params.id;
+    const result = await db.query(
+      'SELECT * FROM users WHERE id = $1',
+      [user_id]
+    );
+    console.log('User fetched:', result);
+    res.json(result.rows[0]);
+  }
+}`,
    },

    // File 2: Service with no tests
    {
      path: "src/services/payment.service.ts",
      diff: `+export function processPayment(amount: number, currency: string) {
+  if (amount <= 0) return { success: false, error: 'Invalid amount' };
+  console.log('Processing payment:', amount, currency);
+  return { success: true, transactionId: 'txn_' + Math.random() };
+}`,
    },

    // File 3: Test file with bad practices
    {
      path: "src/tests/auth.spec.ts",
      diff: `+import { describe, it, expect } from 'vitest';
+
+let globalUser: any = null;
+
+describe('auth', () => {
+  it('test 1', () => {
+    globalUser = { id: 1, name: 'Alice' };
+  });
+
+  it('test 2', () => {
+    expect(globalUser).not.toBeNull();
+  });
+});`,
    },
  ],
};

// ============================================================================
// 3. Run the test
// ============================================================================

async function main() {
  console.log("=".repeat(70));
  console.log("  REVIEWER + TUTOR AGENTS — Integration Test");
  console.log("  Using real Gemini LLM calls (GOOGLE_API_KEY from .env)");
  console.log("=".repeat(70));
  console.log();
  console.log(`PR: "${samplePRDiff.title}" (#${samplePRDiff.prNumber})`);
  console.log(`Files: ${samplePRDiff.files.length}`);
  console.log(`Conventions: ${sampleConventions.length}`);
  console.log();

  const startTime = Date.now();

  try {
    // =========================================
    // STEP 1: Run Reviewer Agent
    // =========================================
    console.log("\n" + "=".repeat(70));
    console.log("  STEP 1: REVIEWER AGENT");
    console.log("=".repeat(70));

    const reviewResult = await reviewPR(samplePRDiff, sampleConventions);

    console.log("\n--- Reviewer Output ---");
    console.log(`Status: ${reviewResult.status}`);
    console.log(`Total violations: ${reviewResult.violations.length}`);

    // Group by type
    const byType: Record<string, typeof reviewResult.violations> = {};
    for (const v of reviewResult.violations) {
      byType[v.type] = byType[v.type] || [];
      byType[v.type].push(v);
    }

    for (const [type, violations] of Object.entries(byType)) {
      console.log(`\n📌 ${type.toUpperCase()} (${violations.length}):`);
      for (const v of violations) {
        console.log(`   • ${v.file}:${v.line} — ${v.issue}`);
        if (v.reasoning) console.log(`     💡 Why: ${v.reasoning.slice(0, 100)}...`);
      }
    }

    // =========================================
    // STEP 2: Run Tutor Agent (explain violations)
    // =========================================
    if (reviewResult.violations.length > 0) {
      console.log("\n" + "=".repeat(70));
      console.log("  STEP 2: TUTOR AGENT (RAG-based, no hallucination)");
      console.log("=".repeat(70));

      const tutorResult = await explainFeedback(
        reviewResult.violations,
        sampleConventions // Pass conventions to avoid Supabase call
      );

      console.log("\n--- Tutor Output (Junior-Dev-Friendly Explanations) ---");
      for (const feedback of tutorResult.explainedFeedback) {
        console.log();
        console.log(`📝 ${feedback.violation.file}:${feedback.violation.line}`);
        console.log(`   Type: ${feedback.violation.type}`);
        console.log(`   Issue: ${feedback.violation.issue}`);
        console.log();
        console.log(`   🎓 Explanation:`);
        console.log(`   ${feedback.explanation}`);
        console.log();
        console.log(`   ✅ Team Expectation: ${feedback.teamExpectation}`);
        if (feedback.codeExample) {
          console.log(`   📋 Before: ${feedback.codeExample.before}`);
          console.log(`   📋 After:  ${feedback.codeExample.after}`);
        }
        if (feedback.conventionReference) {
          console.log(`   📚 Convention: ${feedback.conventionReference.rule}`);
        }
        console.log("   " + "-".repeat(60));
      }
    }

    // =========================================
    // Summary
    // =========================================
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(70));
    console.log("  SUMMARY");
    console.log("=".repeat(70));
    console.log(`Time: ${elapsed}s`);
    console.log(`Files reviewed: ${reviewResult.reviewedFiles.length}`);
    console.log(`Violations found: ${reviewResult.violations.length}`);

    const agenticCount = reviewResult.violations.filter(
      (v) => v.reasoning && v.impact && v.recommendation
    ).length;
    console.log(`Agentic violations (with reasoning): ${agenticCount}/${reviewResult.violations.length}`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
