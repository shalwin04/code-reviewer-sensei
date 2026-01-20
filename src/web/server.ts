import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import { config } from "../config/index.js";
import {
  orchestrateReview,
  orchestrateQuestion,
  formatForGitHub,
} from "../orchestrator/index.js";
import {
  fetchPRDiff,
  postPRReview,
  isPRWebhookPayload,
} from "../integrations/github.js";
import { getKnowledgeStore } from "../knowledge/store.js";
import type { FeedbackControllerStateUpdated } from "../types/index.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// Webhook Verification Middleware
// ============================================

function verifyGitHubWebhook(req: Request, res: Response, next: NextFunction) {
  if (!config.github.webhookSecret) {
    console.warn("GitHub webhook secret not configured, skipping verification");
    next();
    return;
  }

  const signature = req.headers["x-hub-signature-256"] as string;
  if (!signature) {
    res.status(401).json({ error: "Missing signature" });
    return;
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", config.github.webhookSecret)
      .update(payload)
      .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  next();
}

// ============================================
// Routes
// ============================================

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Knowledge store stats
app.get("/api/stats", async (_req: Request, res: Response) => {
  try {
    const store = await getKnowledgeStore(config.knowledgeStore.path);
    const stats = store.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Get all conventions
app.get("/api/conventions", async (_req: Request, res: Response) => {
  try {
    const store = await getKnowledgeStore(config.knowledgeStore.path);
    const conventions = store.getAllConventions();
    res.json(conventions);
  } catch (error) {
    res.status(500).json({ error: "Failed to get conventions" });
  }
});

// Search conventions
app.get("/api/conventions/search", async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const store = await getKnowledgeStore(config.knowledgeStore.path);
    const results = store.searchConventions(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Failed to search conventions" });
  }
});

// Ask a question
app.post("/api/ask", async (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }

    const result = await orchestrateQuestion(question);
    res.json({ answer: result.finalOutput });
  } catch (error) {
    res.status(500).json({ error: "Failed to answer question" });
  }
});

// Review code (manual trigger)
app.post("/api/review", async (req: Request, res: Response) => {
  try {
    const { repo, prNumber } = req.body;

    if (!repo || !prNumber) {
      res.status(400).json({ error: "repo and prNumber are required" });
      return;
    }

    const prDiff = await fetchPRDiff(repo, prNumber);
    const result = await orchestrateReview(prDiff);

    if (result.status === "error") {
      res.status(500).json({ errors: result.errors });
      return;
    }

    const formatted = formatForGitHub(
      result.finalOutput as FeedbackControllerStateUpdated
    );
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: "Failed to review PR" });
  }
});

// GitHub Webhook Handler
app.post("/webhook/github", verifyGitHubWebhook, async (req: Request, res: Response) => {
  const event = req.headers["x-github-event"];

  console.log(`📥 Received GitHub webhook: ${event}`);

  if (event !== "pull_request") {
    res.json({ message: "Event ignored" });
    return;
  }

  const payload = req.body;

  if (!isPRWebhookPayload(payload)) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  // Only process opened and synchronize events
  if (!["opened", "synchronize", "reopened"].includes(payload.action)) {
    res.json({ message: "Action ignored" });
    return;
  }

  console.log(
    `🔍 Processing PR #${payload.number}: ${payload.pull_request.title}`
  );

  // Respond immediately to avoid timeout
  res.json({ message: "Review started" });

  // Process asynchronously
  try {
    const prDiff = await fetchPRDiff(
      payload.repository.full_name,
      payload.number
    );

    const result = await orchestrateReview(prDiff);

    if (result.status === "complete" && result.finalOutput) {
      const formatted = formatForGitHub(
        result.finalOutput as FeedbackControllerStateUpdated
      );

      await postPRReview(
        payload.repository.full_name,
        payload.number,
        formatted.summary,
        formatted.comments.map((c) => ({
          id: `gh-${Date.now()}`,
          file: c.path,
          line: c.line,
          body: c.body,
          severity: "suggestion" as const,
          type: "review",
        }))
      );

      console.log(`✅ Review posted for PR #${payload.number}`);
    }
  } catch (error) {
    console.error(`❌ Failed to process PR #${payload.number}:`, error);
  }
});

// ============================================
// Error Handler
// ============================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ============================================
// Start Server
// ============================================

export function startServer() {
  const { port, host } = config.server;

  app.listen(port, host, () => {
    console.log(`\n🚀 AI Tutor Server running at http://${host}:${port}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /health              - Health check`);
    console.log(`  GET  /api/stats           - Knowledge store stats`);
    console.log(`  GET  /api/conventions     - List all conventions`);
    console.log(`  GET  /api/conventions/search?q=... - Search conventions`);
    console.log(`  POST /api/ask             - Ask a question`);
    console.log(`  POST /api/review          - Trigger manual review`);
    console.log(`  POST /webhook/github      - GitHub webhook endpoint\n`);
  });

  return app;
}

export { app };
