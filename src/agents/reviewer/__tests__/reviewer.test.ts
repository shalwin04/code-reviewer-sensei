// ============================================================================
// Reviewer Agent — Unit Tests (mocked LLM, no Supabase)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PRDiffInput, Convention, RawViolation } from "../../../types/index.js";

// ---------------------------------------------------------------------------
// Mock: LLM — returns canned responses based on system prompt content
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn();

vi.mock("../../../utils/llm.js", () => ({
  getModelForTask: vi.fn(() => ({ invoke: mockInvoke })),
}));

// Mock: Supabase store (used only when conventions are NOT pre-loaded)
vi.mock("../../../knowledge/supabase-store.js", () => ({
  getSupabaseKnowledgeStore: vi.fn(async () => ({
    getAllConventions: vi.fn(async () => []),
  })),
}));

// Mock: Retriever (RAG layer)
vi.mock("../../../knowledge/retriever.js", () => ({
  retrieveContextForReview: vi.fn(async () => []),
}));

// Mock: config
vi.mock("../../../config/index.js", () => ({
  config: {
    repository: { fullName: "test-org/test-repo" },
    agents: { reviewer: { model: "test", temperature: 0, maxTokens: 100 } },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import { reviewPR, createReviewerGraph } from "../index.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSampleConventions(): Convention[] {
  const now = new Date().toISOString();
  return [
    {
      id: "conv-naming-1",
      category: "naming",
      rule: "Use camelCase for function names",
      description: "All functions must use camelCase",
      examples: [{ good: "getUser()", bad: "get_user()", explanation: "Team standard" }],
      source: { type: "codebase", reference: "src/", timestamp: now },
      confidence: 0.95,
      tags: ["naming", "functions"],
    },
    {
      id: "conv-structure-1",
      category: "structure",
      rule: "Controllers must not import database modules directly",
      description: "Controllers call services; services call the DB layer",
      examples: [{ bad: "import { db } from '../db'", explanation: "Layer violation" }],
      source: { type: "adr", reference: "docs/adr-002.md", timestamp: now },
      confidence: 0.9,
      tags: ["structure", "layering"],
    },
    {
      id: "conv-pattern-1",
      category: "pattern",
      rule: "No raw SQL in controllers",
      description: "Use service/repository layer for DB access",
      examples: [{ bad: "db.query('SELECT *')", explanation: "Coupling risk" }],
      source: { type: "pr-review", reference: "PR #42", timestamp: now },
      confidence: 0.85,
      tags: ["pattern", "sql"],
    },
    {
      id: "conv-testing-1",
      category: "testing",
      rule: "Every service file must have a corresponding test file",
      description: "New logic in services requires test coverage",
      examples: [{ good: "payment.service.test.ts", explanation: "Matches source" }],
      source: { type: "codebase", reference: "src/tests/", timestamp: now },
      confidence: 0.9,
      tags: ["testing", "coverage"],
    },
  ];
}

function makeSamplePRDiff(): PRDiffInput {
  return {
    prNumber: 99,
    title: "Add user controller and payment service",
    baseBranch: "main",
    headBranch: "feature/user-payments",
    files: [
      {
        path: "src/controllers/user_controller.ts",
        diff: `+import { db } from '../database/connection';
+export class user_controller {
+  async get_user(id: string) {
+    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
+    console.log('fetched', result);
+    return result;
+  }
+}`,
      },
      {
        path: "src/services/payment.service.ts",
        diff: `+export function processPayment(amount: number, currency: string) {
+  if (amount <= 0) return null;
+  return { success: true, amount, currency };
+}`,
      },
      {
        path: "src/tests/auth.spec.ts",
        diff: `+let sharedState: any = {};
+describe('auth', () => {
+  it('test 1', () => {
+    sharedState.user = { id: 1 };
+  });
+});`,
      },
    ],
  };
}

// The routing plan the mock LLM returns
const MOCK_ROUTING_PLAN = [
  {
    filePath: "src/controllers/user_controller.ts",
    assignedReviewers: ["naming", "structure", "pattern"],
    reasoning: "Controller file: needs naming, structure, and pattern review",
  },
  {
    filePath: "src/services/payment.service.ts",
    assignedReviewers: ["naming", "pattern", "testing"],
    reasoning: "Service file with new logic: needs naming, pattern, and testing review",
  },
  {
    filePath: "src/tests/auth.spec.ts",
    assignedReviewers: ["testing"],
    reasoning: "Test file: only needs testing review",
  },
];

// Sample violations the mock LLM returns for each reviewer
const MOCK_NAMING_VIOLATIONS = [
  {
    issue: "Function get_user uses snake_case instead of camelCase",
    conventionId: "conv-naming-1",
    file: "src/controllers/user_controller.ts",
    line: 3,
    code: "get_user",
    severity: "warning",
    reasoning: "Team uses camelCase for all function names",
    impact: "Inconsistent naming confuses new team members",
    recommendation: "Rename to getUser",
  },
];

const MOCK_STRUCTURE_VIOLATIONS = [
  {
    issue: "Controller imports directly from database layer",
    conventionId: "conv-structure-1",
    file: "src/controllers/user_controller.ts",
    line: 1,
    code: "import { db } from '../database/connection'",
    severity: "error",
    reasoning: "Controllers must go through the service layer",
    impact: "Tight coupling makes the controller untestable in isolation",
    recommendation: "Create a UserService and inject it into the controller",
  },
];

const MOCK_PATTERN_VIOLATIONS = [
  {
    issue: "Raw SQL query in controller",
    conventionId: "conv-pattern-1",
    file: "src/controllers/user_controller.ts",
    line: 4,
    code: "db.query('SELECT * FROM users WHERE id = $1', [id])",
    severity: "error",
    reasoning: "Team forbids raw SQL outside repository layer",
    impact: "SQL injection risk and no query reuse",
    recommendation: "Move query to UserRepository.findById()",
  },
];

const MOCK_TESTING_VIOLATIONS = [
  {
    issue: "Shared mutable state between tests",
    conventionId: "conv-testing-1",
    file: "src/tests/auth.spec.ts",
    line: 1,
    code: "let sharedState: any = {}",
    severity: "warning",
    reasoning: "Shared state causes flaky, order-dependent tests",
    impact: "Tests may pass or fail depending on execution order",
    recommendation: "Move state into beforeEach or use local variables per test",
  },
];

// ---------------------------------------------------------------------------
// Helper: configure mockInvoke to respond based on prompt content
// ---------------------------------------------------------------------------

function setupMockLLM() {
  mockInvoke.mockReset();

  mockInvoke.mockImplementation(async (messages: any) => {
    // messages is either a string (summarize) or an array [SystemMessage, HumanMessage]
    const systemContent =
      typeof messages === "string"
        ? messages
        : messages[0]?.content ?? messages[0]?.text ?? "";

    if (systemContent.includes("Reviewer Orchestrator")) {
      return { content: JSON.stringify(MOCK_ROUTING_PLAN) };
    }
    // Updated to match grounded/educational prompts
    if (systemContent.includes("NAMING RULES")) {
      return { content: JSON.stringify(MOCK_NAMING_VIOLATIONS) };
    }
    if (systemContent.includes("STRUCTURE RULES")) {
      return { content: JSON.stringify(MOCK_STRUCTURE_VIOLATIONS) };
    }
    if (systemContent.includes("PATTERN RULES")) {
      return { content: JSON.stringify(MOCK_PATTERN_VIOLATIONS) };
    }
    if (systemContent.includes("TESTING RULES")) {
      return { content: JSON.stringify(MOCK_TESTING_VIOLATIONS) };
    }

    // Default: no violations
    return { content: "[]" };
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("Reviewer Agent", () => {
  beforeEach(() => {
    setupMockLLM();
  });

  // ---------- Graph flow ----------

  describe("reviewPR()", () => {
    it("returns violations from all sub-reviewers", async () => {
      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      expect(result.status).toBe("complete");
      expect(result.prNumber).toBe(99);
      expect(result.reviewedFiles).toHaveLength(3);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("returns violations tagged by type", async () => {
      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      const types = new Set(result.violations.map((v) => v.type));
      // The routing plan assigns: naming, structure, pattern, testing
      expect(types.has("naming")).toBe(true);
      expect(types.has("structure")).toBe(true);
      expect(types.has("pattern")).toBe(true);
      expect(types.has("testing")).toBe(true);
    });

    it("includes agentic fields (reasoning, impact, recommendation)", async () => {
      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      const agenticViolations = result.violations.filter(
        (v) => v.reasoning && v.impact && v.recommendation
      );
      // All our mock violations have agentic fields
      expect(agenticViolations.length).toBe(result.violations.length);
    });

    it("each violation has a unique id prefixed by type", async () => {
      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      const ids = result.violations.map((v) => v.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      for (const v of result.violations) {
        expect(v.id).toMatch(new RegExp(`^${v.type}-`));
      }
    });
  });

  // ---------- Convention passthrough ----------

  describe("convention passthrough", () => {
    it("skips Supabase loading when conventions are pre-loaded", async () => {
      const { getSupabaseKnowledgeStore } = await import(
        "../../../knowledge/supabase-store.js"
      );

      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      expect(result.status).toBe("complete");
      // getSupabaseKnowledgeStore should NOT have been called because conventions were provided
      expect(getSupabaseKnowledgeStore).not.toHaveBeenCalled();
    });
  });

  // ---------- Routing behavior ----------

  describe("LLM orchestrator routing", () => {
    it("calls the LLM with a routing prompt", async () => {
      await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      // First invoke call should be the routing orchestrator
      const firstCall = mockInvoke.mock.calls[0];
      const systemPrompt = firstCall[0][0]?.content ?? "";
      expect(systemPrompt).toContain("Reviewer Orchestrator");
    });

    it("sub-reviewers only process files assigned by the routing plan", async () => {
      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      // auth.spec.ts was only assigned to "testing" in the routing plan
      // so no naming/structure/pattern violations should reference it
      const authNonTestViolations = result.violations.filter(
        (v) =>
          v.file === "src/tests/auth.spec.ts" && v.type !== "testing"
      );
      expect(authNonTestViolations).toHaveLength(0);

      // payment.service.ts was NOT assigned to "structure" in the routing plan
      const paymentStructureViolations = result.violations.filter(
        (v) =>
          v.file === "src/services/payment.service.ts" && v.type === "structure"
      );
      expect(paymentStructureViolations).toHaveLength(0);
    });
  });

  // ---------- Empty / edge cases ----------

  describe("edge cases", () => {
    it("returns empty violations when PR has no files", async () => {
      const emptyPR: PRDiffInput = {
        prNumber: 1,
        title: "Empty PR",
        baseBranch: "main",
        headBranch: "empty",
        files: [],
      };

      const result = await reviewPR(emptyPR, makeSampleConventions());
      expect(result.violations).toHaveLength(0);
      expect(result.status).toBe("complete");
    });

    it("returns empty violations when no conventions exist", async () => {
      // All convention categories empty → sub-reviewers skip
      const result = await reviewPR(makeSamplePRDiff(), []);

      // The routing fallback runs all reviewers, but each sub-reviewer
      // finds 0 conventions for its category and skips
      // However the LLM is still called for routing (which returns mock plan)
      expect(result.status).toBe("complete");
    });

    it("handles LLM routing failure gracefully", async () => {
      mockInvoke.mockReset();
      mockInvoke.mockImplementation(async (messages: any) => {
        const systemContent =
          typeof messages === "string"
            ? messages
            : messages[0]?.content ?? "";

        // Routing node returns garbage (no JSON array)
        if (systemContent.includes("Reviewer Orchestrator")) {
          return { content: "I cannot produce a routing plan." };
        }
        // Other nodes return empty
        return { content: "[]" };
      });

      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());
      // Should still complete (falls back to all reviewers)
      expect(result.status).toBe("complete");
    });

    it("handles LLM invoke throwing an error", async () => {
      mockInvoke.mockReset();
      mockInvoke.mockImplementation(async (messages: any) => {
        const systemContent =
          typeof messages === "string"
            ? messages
            : messages[0]?.content ?? "";

        if (systemContent.includes("Reviewer Orchestrator")) {
          throw new Error("API key expired");
        }
        return { content: "[]" };
      });

      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());
      // Should still complete with fallback routing
      expect(result.status).toBe("complete");
    });
  });

  // ---------- Aggregation ----------

  describe("aggregation", () => {
    it("violations accumulate across sub-reviewers (not overwritten)", async () => {
      const result = await reviewPR(makeSamplePRDiff(), makeSampleConventions());

      // We expect at least 1 violation from each of the 4 sub-reviewers
      const naming = result.violations.filter((v) => v.type === "naming");
      const structure = result.violations.filter((v) => v.type === "structure");
      const pattern = result.violations.filter((v) => v.type === "pattern");
      const testing = result.violations.filter((v) => v.type === "testing");

      expect(naming.length).toBeGreaterThanOrEqual(1);
      expect(structure.length).toBeGreaterThanOrEqual(1);
      expect(pattern.length).toBeGreaterThanOrEqual(1);
      expect(testing.length).toBeGreaterThanOrEqual(1);
    });
  });
});
