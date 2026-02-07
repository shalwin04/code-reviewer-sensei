import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import session from "express-session";
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
import { getSupabaseKnowledgeStore } from "../knowledge/supabase-store.js";
import {
  createReviewHistory,
  updateReviewHistory,
  getReviewHistory,
  getReviewById,
  getOrCreateWebhookRegistration,
  recordWebhookReceived,
  getLeaderboard,
  getBadgeInfo,
  getAllBadges,
} from "../integrations/supabase.js";
import {
  isGitHubAppConfigured,
  getAppInstallUrl,
  handleInstallationCreated,
  handleInstallationDeleted,
  handleInstallationSuspend,
  handleInstallationUnsuspend,
  handleInstallationReposAdded,
  handleInstallationReposRemoved,
  getInstalledRepositories,
  isRepoInstalled,
  type InstallationPayload,
  type InstallationReposPayload,
} from "../integrations/github-app.js";
import { passport, initializePassport } from "../auth/index.js";
import { authRouter, requireAuth, optionalAuth } from "../auth/routes.js";

const app = express();

// ============================================
// Middleware Setup
// ============================================

// CORS configuration - allow frontend origin with credentials
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
app.use(
  cors({
    origin: [frontendUrl, "http://localhost:3000", "http://localhost:3001"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing
app.use(express.json());

// Trust proxy for production (Render, Heroku, etc.)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Session configuration
const sessionSecret = process.env.SESSION_SECRET || "ai-code-reviewer-secret-key-change-in-production";
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
    name: "ai-reviewer.sid",
  })
);

// Initialize Passport
const oauthEnabled = initializePassport();
app.use(passport.initialize());
app.use(passport.session());

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
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    oauth: oauthEnabled ? "enabled" : "disabled",
    githubApp: isGitHubAppConfigured() ? "enabled" : "disabled",
  });
});

// Mount auth routes
app.use("/auth", authRouter);

// ============================================
// API Routes
// ============================================

// Knowledge store stats
app.get("/api/stats", optionalAuth, async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string;
    if (!repo) {
      res.status(400).json({ error: "repo query parameter is required" });
      return;
    }

    const store = await getSupabaseKnowledgeStore(repo);
    const stats = await store.getStats();
    res.json(stats);
  } catch (error) {
    console.error("Failed to get stats:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Get all conventions
app.get("/api/conventions", optionalAuth, async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string;
    if (!repo) {
      res.status(400).json({ error: "repo query parameter is required" });
      return;
    }

    const store = await getSupabaseKnowledgeStore(repo);
    const conventions = await store.getAllConventions();
    res.json(conventions);
  } catch (error) {
    console.error("Failed to get conventions:", error);
    res.status(500).json({ error: "Failed to get conventions" });
  }
});

// Search conventions
app.get("/api/conventions/search", optionalAuth, async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string;
    const query = req.query.q as string;

    if (!repo) {
      res.status(400).json({ error: "repo query parameter is required" });
      return;
    }
    if (!query) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const store = await getSupabaseKnowledgeStore(repo);
    const results = await store.searchConventions(query);
    res.json(results);
  } catch (error) {
    console.error("Failed to search conventions:", error);
    res.status(500).json({ error: "Failed to search conventions" });
  }
});

// Ask a question (requires auth)
app.post("/api/ask", requireAuth, async (req: Request, res: Response) => {
  try {
    const { question, repo } = req.body;
    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }

    // Set repository context if provided
    if (repo) {
      config.repository.fullName = repo;
    }

    const result = await orchestrateQuestion(question);
    res.json({ answer: result.finalOutput });
  } catch (error) {
    console.error("Failed to answer question:", error);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

// Review code (requires auth)
app.post("/api/review", requireAuth, async (req: Request, res: Response) => {
  try {
    const { repo, prNumber } = req.body;

    if (!repo || !prNumber) {
      res.status(400).json({ error: "repo and prNumber are required" });
      return;
    }

    // Set repository context
    config.repository.fullName = repo;

    const prDiff = await fetchPRDiff(repo, prNumber);

    // Create review history entry
    const reviewEntry = await createReviewHistory(
      repo,
      prNumber,
      prDiff.title,
      null, // author not available in diff
      "manual"
    );

    if (reviewEntry) {
      await updateReviewHistory(reviewEntry.id, { status: "in_progress" });
    }

    const result = await orchestrateReview(prDiff);

    if (result.status === "error") {
      if (reviewEntry) {
        await updateReviewHistory(reviewEntry.id, {
          status: "failed",
          summary: result.errors.join(", "),
          completed_at: new Date().toISOString(),
        });
      }
      res.status(500).json({ error: result.errors.join(", ") });
      return;
    }

    const formatted = formatForGitHub(result.finalOutput as any);

    // Calculate stats from violations
    const violations = result.violations || [];
    const errorsCount = violations.filter((v: any) => v.severity === "error").length;
    const warningsCount = violations.filter((v: any) => v.severity === "warning").length;
    const suggestionsCount = violations.filter((v: any) => v.severity === "suggestion").length;
    const score = Math.max(0, 100 - errorsCount * 10 - warningsCount * 5 - suggestionsCount * 2);

    // Update review history with results
    if (reviewEntry) {
      await updateReviewHistory(reviewEntry.id, {
        status: "completed",
        violations_count: violations.length,
        errors_count: errorsCount,
        warnings_count: warningsCount,
        suggestions_count: suggestionsCount,
        score,
        summary: formatted.summary,
        review_data: { violations, comments: formatted.comments },
        completed_at: new Date().toISOString(),
      });
    }

    res.json({
      ...formatted,
      reviewId: reviewEntry?.id,
      score,
      violations: violations.map((v: any) => ({
        id: v.id,
        file: v.file,
        line: v.line,
        rule: v.type || v.issue,
        message: v.issue,
        severity: v.severity,
        conventionId: v.conventionId,
      })),
    });
  } catch (error) {
    console.error("Failed to review PR:", error);
    res.status(500).json({ error: "Failed to review PR" });
  }
});

// Get review history for a repo
app.get("/api/reviews", optionalAuth, async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = parseInt(limitStr as string) || 20;

    if (!repo) {
      res.status(400).json({ error: "repo query parameter is required" });
      return;
    }

    const reviews = await getReviewHistory(repo, limit);
    res.json(reviews);
  } catch (error) {
    console.error("Failed to get review history:", error);
    res.status(500).json({ error: "Failed to get review history" });
  }
});

// Get single review by ID
app.get("/api/reviews/:id", optionalAuth, async (req: Request, res: Response) => {
  try {
    const reviewId = req.params.id as string;
    const review = await getReviewById(reviewId);

    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    res.json(review);
  } catch (error) {
    console.error("Failed to get review:", error);
    res.status(500).json({ error: "Failed to get review" });
  }
});

// Generate AI fix for a violation
app.post("/api/fix", requireAuth, async (req: Request, res: Response) => {
  try {
    const { repo, file, line, originalCode, violation, suggestion } = req.body;

    if (!file || !violation) {
      res.status(400).json({ error: "file and violation are required" });
      return;
    }

    // Use the LLM to generate a fix
    const { getModelForTask } = await import("../utils/llm.js");
    const llm = getModelForTask("tutor");

    const prompt = `You are an expert code reviewer helping fix a code violation.

**Repository:** ${repo || "unknown"}
**File:** ${file}
**Line:** ${line || "unknown"}
**Violation:** ${violation}
${suggestion ? `**Suggested Approach:** ${suggestion}` : ""}

**Original Code:**
\`\`\`
${originalCode || "// Code not provided"}
\`\`\`

Please provide the fixed code. Only output the corrected code without any explanation.
If the original code is not provided, generate a reasonable fix based on the violation description.

**Fixed Code:**`;

    const response = await llm.invoke(prompt);
    const fixedCode = typeof response.content === "string"
      ? response.content.trim()
      : response.content.toString().trim();

    // Clean up the response (remove markdown code blocks if present)
    let cleanedCode = fixedCode;
    const codeBlockMatch = fixedCode.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleanedCode = codeBlockMatch[1].trim();
    }

    res.json({
      success: true,
      originalCode: originalCode || "",
      fixedCode: cleanedCode,
      file,
      line,
      violation,
    });
  } catch (error) {
    console.error("Failed to generate fix:", error);
    res.status(500).json({ error: "Failed to generate fix" });
  }
});

// Get PR diff for viewing
app.get("/api/pr/:owner/:repo/:prNumber/diff", optionalAuth, async (req: Request, res: Response) => {
  try {
    const owner = req.params.owner as string;
    const repo = req.params.repo as string;
    const prNumber = req.params.prNumber as string;
    const repoFullName = `${owner}/${repo}`;
    const prNum = parseInt(prNumber, 10);

    if (isNaN(prNum)) {
      res.status(400).json({ error: "Invalid PR number" });
      return;
    }

    const prDiff = await fetchPRDiff(repoFullName, prNum);

    res.json({
      prNumber: prDiff.prNumber,
      title: prDiff.title,
      baseBranch: prDiff.baseBranch,
      headBranch: prDiff.headBranch,
      files: prDiff.files.map((f) => ({
        path: f.path,
        diff: f.diff,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch PR diff:", error);
    res.status(500).json({ error: "Failed to fetch PR diff" });
  }
});

// ============================================
// Security Scanner Endpoints
// ============================================

// Security patterns to check for
const SECURITY_PATTERNS = [
  {
    id: "hardcoded-secret",
    name: "Hardcoded Secret",
    severity: "critical",
    category: "secrets",
    pattern: /(api[_-]?key|password|secret|token|auth|credential)\s*[:=]\s*["'][^"']{8,}["']/gi,
    description: "Potential hardcoded secret or API key detected",
  },
  {
    id: "sql-injection",
    name: "SQL Injection",
    severity: "critical",
    category: "injection",
    pattern: /(\$\{.*\}|' \+ |" \+ |\+ ['"]|query\s*\(.*\+)/gi,
    description: "Potential SQL injection vulnerability - use parameterized queries",
  },
  {
    id: "xss-vulnerability",
    name: "XSS Vulnerability",
    severity: "high",
    category: "xss",
    pattern: /(innerHTML\s*=|dangerouslySetInnerHTML|document\.write\(|\.html\()/gi,
    description: "Potential XSS vulnerability - sanitize user input before rendering",
  },
  {
    id: "eval-usage",
    name: "Eval Usage",
    severity: "high",
    category: "injection",
    pattern: /\beval\s*\(|\bnew Function\s*\(/gi,
    description: "Use of eval() or Function() constructor can lead to code injection",
  },
  {
    id: "insecure-random",
    name: "Insecure Random",
    severity: "medium",
    category: "crypto",
    pattern: /Math\.random\s*\(/gi,
    description: "Math.random() is not cryptographically secure - use crypto.randomBytes() for security-sensitive operations",
  },
  {
    id: "http-url",
    name: "Insecure HTTP",
    severity: "medium",
    category: "transport",
    pattern: /["']http:\/\/(?!localhost|127\.0\.0\.1)/gi,
    description: "Use HTTPS instead of HTTP for external URLs",
  },
  {
    id: "cors-wildcard",
    name: "CORS Wildcard",
    severity: "medium",
    category: "access-control",
    pattern: /Access-Control-Allow-Origin['":\s]+\*/gi,
    description: "CORS wildcard (*) allows any origin - restrict to specific domains",
  },
  {
    id: "command-injection",
    name: "Command Injection",
    severity: "critical",
    category: "injection",
    pattern: /(exec|spawn|execSync|spawnSync)\s*\([^)]*\$\{|child_process/gi,
    description: "Potential command injection - sanitize input before shell execution",
  },
  {
    id: "path-traversal",
    name: "Path Traversal",
    severity: "high",
    category: "injection",
    pattern: /\.\.\//g,
    description: "Potential path traversal vulnerability - validate file paths",
  },
  {
    id: "weak-crypto",
    name: "Weak Cryptography",
    severity: "medium",
    category: "crypto",
    pattern: /(md5|sha1)[\s('"]/gi,
    description: "MD5 and SHA1 are considered weak - use SHA256 or stronger",
  },
];

interface SecurityFinding {
  id: string;
  name: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  description: string;
  file: string;
  line: number;
  code: string;
}

// Scan code for security issues
app.post("/api/security/scan", requireAuth, async (req: Request, res: Response) => {
  try {
    const { repo, prNumber, files } = req.body;

    if (!repo) {
      res.status(400).json({ error: "repo is required" });
      return;
    }

    let filesToScan = files;

    // If prNumber provided, fetch files from PR
    if (prNumber && !files) {
      const prDiff = await fetchPRDiff(repo, prNumber);
      filesToScan = prDiff.files.map((f) => ({
        path: f.path,
        content: f.diff,
      }));
    }

    if (!filesToScan || !Array.isArray(filesToScan)) {
      res.status(400).json({ error: "files array or prNumber is required" });
      return;
    }

    const findings: SecurityFinding[] = [];

    for (const file of filesToScan) {
      const content = file.content || "";
      const lines = content.split("\n");

      for (const pattern of SECURITY_PATTERNS) {
        // Reset regex state
        pattern.pattern.lastIndex = 0;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          pattern.pattern.lastIndex = 0;

          if (pattern.pattern.test(line)) {
            findings.push({
              id: `${pattern.id}-${file.path}-${lineNum}`,
              name: pattern.name,
              severity: pattern.severity as SecurityFinding["severity"],
              category: pattern.category,
              description: pattern.description,
              file: file.path,
              line: lineNum + 1,
              code: line.trim().slice(0, 100),
            });
          }
        }
      }
    }

    // Also use AI to analyze for more complex security issues
    if (findings.length === 0 && filesToScan.length > 0) {
      try {
        const { getModelForTask } = await import("../utils/llm.js");
        const llm = getModelForTask("reviewer");

        const codeContext = filesToScan
          .slice(0, 3) // Limit to first 3 files
          .map((f: { path: string; content: string }) => `File: ${f.path}\n${f.content.slice(0, 2000)}`)
          .join("\n\n---\n\n");

        const prompt = `Analyze the following code for security vulnerabilities. Look for:
- Hardcoded secrets, API keys, passwords
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Insecure data handling
- OWASP Top 10 issues

Only report actual security issues, not style or best practice suggestions.

Code:
${codeContext}

Respond in JSON format with an array of findings:
[{"name": "Issue Name", "severity": "critical|high|medium|low", "category": "category", "description": "description", "file": "filename", "line": 0, "code": "relevant code"}]

If no security issues found, return an empty array: []`;

        const response = await llm.invoke(prompt);
        const responseText = typeof response.content === "string"
          ? response.content
          : response.content.toString();

        // Try to parse JSON from response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const aiFindings = JSON.parse(jsonMatch[0]);
          for (const f of aiFindings) {
            findings.push({
              id: `ai-${f.category || "security"}-${findings.length}`,
              name: f.name || "Security Issue",
              severity: f.severity || "medium",
              category: f.category || "security",
              description: f.description || "",
              file: f.file || "unknown",
              line: f.line || 0,
              code: f.code || "",
            });
          }
        }
      } catch (aiError) {
        console.error("AI security analysis failed:", aiError);
        // Continue with pattern-based findings only
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Calculate summary
    const summary = {
      total: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      categories: [...new Set(findings.map((f) => f.category))],
    };

    res.json({
      repo,
      prNumber: prNumber || null,
      scannedAt: new Date().toISOString(),
      summary,
      findings,
    });
  } catch (error) {
    console.error("Security scan failed:", error);
    res.status(500).json({ error: "Security scan failed" });
  }
});

// ============================================
// Leaderboard & Gamification Endpoints
// ============================================

// Get leaderboard for a repo
app.get("/api/leaderboard", optionalAuth, async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string;
    const timeframe = (req.query.timeframe as "all" | "week" | "month") || "all";

    if (!repo) {
      res.status(400).json({ error: "repo query parameter is required" });
      return;
    }

    const leaderboard = await getLeaderboard(repo, timeframe);
    res.json(leaderboard);
  } catch (error) {
    console.error("Failed to get leaderboard:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Get all available badges
app.get("/api/badges", (_req: Request, res: Response) => {
  const badges = getAllBadges();
  res.json(badges);
});

// Get badge info
app.get("/api/badges/:badgeId", (req: Request, res: Response) => {
  const badgeId = req.params.badgeId as string;
  const badge = getBadgeInfo(badgeId);

  if (!badge) {
    res.status(404).json({ error: "Badge not found" });
    return;
  }

  res.json(badge);
});

// Get webhook setup info for a repo
app.get("/api/webhook/setup", requireAuth, async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string;

    if (!repo) {
      res.status(400).json({ error: "repo query parameter is required" });
      return;
    }

    const registration = await getOrCreateWebhookRegistration(repo);

    if (!registration) {
      res.status(500).json({ error: "Failed to get webhook setup" });
      return;
    }

    const baseUrl = process.env.WEBHOOK_BASE_URL || `http://localhost:${config.server.port}`;
    const webhookUrl = `${baseUrl}/webhook/github/${registration.webhook_secret}`;

    res.json({
      webhookUrl,
      isActive: registration.is_active,
      eventsReceived: registration.events_received,
      lastReceivedAt: registration.last_received_at,
      instructions: {
        step1: `Go to https://github.com/${repo}/settings/hooks`,
        step2: "Click 'Add webhook'",
        step3: `Paste this URL: ${webhookUrl}`,
        step4: "Content type: application/json",
        step5: "Select 'Pull requests' events",
        step6: "Click 'Add webhook'",
      },
    });
  } catch (error) {
    console.error("Failed to get webhook setup:", error);
    res.status(500).json({ error: "Failed to get webhook setup" });
  }
});

// ============================================
// GitHub App Endpoints
// ============================================

// Get GitHub App info and install URL
app.get("/api/github-app/info", (_req: Request, res: Response) => {
  const isConfigured = isGitHubAppConfigured();
  const installUrl = getAppInstallUrl();

  res.json({
    configured: isConfigured,
    installUrl: installUrl,
    appSlug: process.env.GITHUB_APP_SLUG || "ai-code-reviewer",
  });
});

// Get installed repositories
app.get("/api/github-app/repositories", requireAuth, async (_req: Request, res: Response) => {
  try {
    const repos = await getInstalledRepositories();
    res.json(repos);
  } catch (error) {
    console.error("Failed to get installed repositories:", error);
    res.status(500).json({ error: "Failed to get installed repositories" });
  }
});

// Check if a repo has the app installed
app.get("/api/github-app/check", optionalAuth, async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string;
    if (!repo) {
      res.status(400).json({ error: "repo query parameter is required" });
      return;
    }

    const installed = await isRepoInstalled(repo);
    res.json({ installed, repo });
  } catch (error) {
    console.error("Failed to check repo installation:", error);
    res.status(500).json({ error: "Failed to check repo installation" });
  }
});

// ============================================
// GitHub App Webhook Handler
// ============================================

app.post("/webhook/app", async (req: Request, res: Response) => {
  const event = req.headers["x-github-event"] as string;
  const payload = req.body;

  console.log(`📦 GitHub App webhook: ${event}`);

  try {
    switch (event) {
      case "installation":
        await handleInstallationEvent(payload as InstallationPayload);
        break;

      case "installation_repositories":
        await handleInstallationReposEvent(payload as InstallationReposPayload);
        break;

      case "pull_request":
        // Handle PR events from GitHub App
        await handleAppPRWebhook(req, res);
        return; // handleAppPRWebhook sends response

      default:
        console.log(`   Ignoring event: ${event}`);
    }

    res.json({ message: "Webhook processed" });
  } catch (error) {
    console.error(`Failed to process ${event} webhook:`, error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

async function handleInstallationEvent(payload: InstallationPayload): Promise<void> {
  switch (payload.action) {
    case "created":
      await handleInstallationCreated(payload);
      break;
    case "deleted":
      await handleInstallationDeleted(payload);
      break;
    case "suspend":
      await handleInstallationSuspend(payload);
      break;
    case "unsuspend":
      await handleInstallationUnsuspend(payload);
      break;
  }
}

async function handleInstallationReposEvent(payload: InstallationReposPayload): Promise<void> {
  switch (payload.action) {
    case "added":
      await handleInstallationReposAdded(payload);
      break;
    case "removed":
      await handleInstallationReposRemoved(payload);
      break;
  }
}

// Handle PR webhooks from GitHub App
async function handleAppPRWebhook(req: Request, res: Response): Promise<void> {
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

  const repoFullName = payload.repository.full_name;

  // Verify repo has the app installed
  const installed = await isRepoInstalled(repoFullName);
  if (!installed) {
    console.log(`⚠️ Received PR webhook for non-installed repo: ${repoFullName}`);
    res.json({ message: "Repo not installed" });
    return;
  }

  console.log(`🔍 [App] Processing PR #${payload.number}: ${payload.pull_request.title}`);

  // Respond immediately
  res.json({ message: "Review started" });

  // Process the PR review (same as regular webhook)
  await processPRReview(
    repoFullName,
    payload.number,
    payload.pull_request.title,
    payload.pull_request.user?.login || null,
    "webhook"
  );
}

// ============================================
// Legacy Webhook Handlers
// ============================================

// GitHub Webhook Handler (legacy - global secret)
app.post("/webhook/github", verifyGitHubWebhook, async (req: Request, res: Response) => {
  await handleWebhook(req, res, "global");
});

// GitHub Webhook Handler (per-repo secret in URL)
app.post("/webhook/github/:secret", async (req: Request, res: Response) => {
  await handleWebhook(req, res, req.params.secret as string);
});

// ============================================
// Shared PR Review Processing
// ============================================

async function processPRReview(
  repoFullName: string,
  prNumber: number,
  prTitle: string,
  prAuthor: string | null,
  triggerType: "webhook" | "manual"
): Promise<void> {
  // Create review history entry
  const reviewEntry = await createReviewHistory(
    repoFullName,
    prNumber,
    prTitle,
    prAuthor,
    triggerType
  );

  if (reviewEntry) {
    await updateReviewHistory(reviewEntry.id, { status: "in_progress" });
  }

  try {
    // Set repository context
    config.repository.fullName = repoFullName;

    const prDiff = await fetchPRDiff(repoFullName, prNumber);

    const result = await orchestrateReview(prDiff);

    if (result.status === "complete" && result.finalOutput) {
      const formatted = formatForGitHub(result.finalOutput as any);

      // Calculate stats
      const violations = result.violations || [];
      const errorsCount = violations.filter((v: any) => v.severity === "error").length;
      const warningsCount = violations.filter((v: any) => v.severity === "warning").length;
      const suggestionsCount = violations.filter((v: any) => v.severity === "suggestion").length;
      const score = Math.max(0, 100 - errorsCount * 10 - warningsCount * 5 - suggestionsCount * 2);

      // Update review history
      if (reviewEntry) {
        await updateReviewHistory(reviewEntry.id, {
          status: "completed",
          violations_count: violations.length,
          errors_count: errorsCount,
          warnings_count: warningsCount,
          suggestions_count: suggestionsCount,
          score,
          summary: formatted.summary,
          review_data: { violations, comments: formatted.comments },
          completed_at: new Date().toISOString(),
        });
      }

      await postPRReview(
        repoFullName,
        prNumber,
        formatted.summary,
        formatted.comments.map((c: any) => ({
          id: `gh-${Date.now()}`,
          file: c.path,
          line: c.line,
          body: c.body,
          severity: "suggestion" as const,
          type: "review",
        }))
      );

      console.log(`✅ Review posted for PR #${prNumber}`);
    } else if (result.status === "error") {
      if (reviewEntry) {
        await updateReviewHistory(reviewEntry.id, {
          status: "failed",
          summary: result.errors?.join(", ") || "Unknown error",
          completed_at: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error(`❌ Failed to process PR #${prNumber}:`, error);
    if (reviewEntry) {
      await updateReviewHistory(reviewEntry.id, {
        status: "failed",
        summary: String(error),
        completed_at: new Date().toISOString(),
      });
    }
  }
}

// Shared webhook handler (legacy)
async function handleWebhook(req: Request, res: Response, _secretOrType: string) {
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

  const repoFullName = payload.repository.full_name;

  // Record webhook received
  await recordWebhookReceived(repoFullName);

  console.log(`🔍 Processing PR #${payload.number}: ${payload.pull_request.title}`);

  // Respond immediately to avoid timeout
  res.json({ message: "Review started" });

  // Process the PR review
  await processPRReview(
    repoFullName,
    payload.number,
    payload.pull_request.title,
    payload.pull_request.user?.login || null,
    "webhook"
  );
}

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
    console.log(`\n🚀 AI Code Reviewer Server running at http://${host}:${port}`);
    console.log(`\n📋 OAuth Status: ${oauthEnabled ? "✅ Enabled" : "⚠️  Disabled (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)"}`);
    console.log(`📦 GitHub App: ${isGitHubAppConfigured() ? "✅ Enabled" : "⚠️  Disabled (set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY)"}`);
    console.log(`\n🔗 Endpoints:`);
    console.log(`  GET  /health                        - Health check`);
    console.log(`  GET  /auth/me                       - Get current user`);
    console.log(`  GET  /auth/github                   - Start GitHub OAuth`);
    console.log(`  POST /auth/logout                   - Logout`);
    console.log(`  GET  /auth/repositories             - Get user repositories`);
    console.log(`  GET  /api/stats?repo=owner/repo     - Knowledge store stats`);
    console.log(`  GET  /api/conventions?repo=...      - List all conventions`);
    console.log(`  POST /api/ask                       - Ask a question (auth required)`);
    console.log(`  POST /api/review                    - Trigger manual review (auth required)`);
    console.log(`  GET  /api/reviews?repo=...          - Get review history`);
    console.log(`  GET  /api/github-app/info           - Get GitHub App install URL`);
    console.log(`  GET  /api/github-app/repositories   - Get installed repos`);
    console.log(`  GET  /api/github-app/check?repo=... - Check if repo has app`);
    console.log(`  POST /webhook/app                   - GitHub App webhook (recommended)`);
    console.log(`  POST /webhook/github                - Legacy webhook (global secret)\n`);
  });

  return app;
}

export { app };
