import { z } from "zod";

// ============================================
// Core Domain Types
// ============================================
export type TutorContext = "REVIEW" | "QUESTION";

export const ConventionSchema = z.object({
  id: z.string(),
  category: z.enum([
    "naming",
    "structure",
    "pattern",
    "testing",
    "error-handling",
    "security",
    "performance",
    "documentation",
  ]),
  rule: z.string(),
  description: z.string(),
  examples: z.array(
    z.object({
      good: z.string().optional(),
      bad: z.string().optional(),
      explanation: z.string(),
    })
  ),
  source: z.object({
    type: z.enum(["adr", "pr-review", "codebase", "incident", "manual"]),
    reference: z.string(),
    timestamp: z.string().datetime(),
  }),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
});

export type Convention = z.infer<typeof ConventionSchema>;

export const ViolationSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number(),
  column: z.number().optional(),
  code: z.string(),
  category: z.enum([
    "naming",
    "structure",
    "pattern",
    "testing",
    "error-handling",
    "security",
    "performance",
    "documentation",
  ]),
  severity: z.enum(["error", "warning", "suggestion"]),
  message: z.string(),
  relatedConventions: z.array(z.string()),
});

export type Violation = z.infer<typeof ViolationSchema>;

export const ExplainedViolationSchema = ViolationSchema.extend({
  explanation: z.string(),
  whyItMatters: z.string(),
  teamExpectation: z.string(),
  codeExample: z
    .object({
      file: z.string(),
      line: z.number(),
      snippet: z.string(),
      description: z.string(),
    })
    .optional(),
  suggestedFix: z.string().optional(),
});

export type ExplainedViolation = z.infer<typeof ExplainedViolationSchema>;

export const PRDiffSchema = z.object({
  filename: z.string(),
  status: z.enum(["added", "removed", "modified", "renamed"]),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
  previousFilename: z.string().optional(),
});

export type PRDiff = z.infer<typeof PRDiffSchema>;

export const PRContextSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  prNumber: z.number(),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  baseBranch: z.string(),
  headBranch: z.string(),
  files: z.array(PRDiffSchema),
  commits: z.array(
    z.object({
      sha: z.string(),
      message: z.string(),
      author: z.string(),
    })
  ),
});

export type PRContext = z.infer<typeof PRContextSchema>;

export const FeedbackCommentSchema = z.object({
  file: z.string(),
  line: z.number(),
  body: z.string(),
  severity: z.enum(["error", "warning", "suggestion"]),
});

export type FeedbackComment = z.infer<typeof FeedbackCommentSchema>;

export const ReviewResultSchema = z.object({
  prContext: PRContextSchema,
  violations: z.array(ExplainedViolationSchema),
  summary: z.string(),
  overallSeverity: z.enum(["pass", "warn", "block"]),
  comments: z.array(FeedbackCommentSchema),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// ============================================
// Knowledge Store Types
// ============================================

export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["convention", "pattern", "lesson", "decision"]),
  content: z.string(),
  metadata: z.record(z.unknown()),
  embedding: z.array(z.number()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

// ============================================
// Agent State Types
// ============================================

export interface LearnerState {
  sources: {
    codebase: string[];
    adrs: string[];
    prReviews: string[];
    incidents: string[];
  };
  extractedConventions: Convention[];
  processingStatus: "idle" | "scanning" | "extracting" | "storing" | "complete";
  errors: string[];
}

export interface ReviewerState {
  prNumber: number;
  violations: RawViolation[];
  status: "pending" | "reviewing" | "complete";
  reviewedFiles: string[];
}

export interface TutorState {
  violations: RawViolation[];
  explainedFeedback: ExplainedFeedback[];
  status: "pending" | "explaining" | "complete";
}

export interface FeedbackControllerState {
  prNumber: number;
  explainedFeedback: ExplainedFeedback[];
  formattedComments: FormattedComment[];
  summary: string;
  status: "pending" | "formatting" | "ready" | "complete";
  deliveryTarget: "github" | "console" | "ide";
}

// ============================================
// Orchestrator State (Main Graph State)
// ============================================

export interface OrchestratorState {
  // Input
  trigger: {
    type: "pr_review" | "question" | "pre_commit";
    payload: unknown;
  };

  // Sub-agent states
  learner: LearnerState;
  reviewer: ReviewerState;
  tutor: TutorState;
  feedbackController: FeedbackControllerState;

  // Shared knowledge
  teamKnowledge: Convention[];

  // Output
  result: ReviewResult | string | null;
  status: "pending" | "in_progress" | "complete" | "error";
  errors: string[];
}

// ============================================
// Configuration Types
// ============================================

export interface AgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface AppConfig {
  agents: {
    learner: AgentConfig;
    reviewer: AgentConfig;
    tutor: AgentConfig;
    feedbackController: AgentConfig;
  };
  github: {
    token: string;
    webhookSecret: string;
  };
  knowledgeStore: {
    path: string;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceKey: string;
  };
  repository: {
    fullName: string;
  };
  server: {
    port: number;
    host: string;
  };
}

// ============================================
// Additional Agent Types
// ============================================

export type ViolationSeverity = "error" | "warning" | "suggestion";

export type RawViolation = {
  id: string;
  type: string;
  issue: string;
  conventionId: string;
  file: string;
  line: number;
  code?: string;
  severity: ViolationSeverity;
  // 🧠 Agent-owned reasoning (OPTIONAL for backward compatibility)
  reasoning?: string;        // WHY the team does this
  impact?: string;           // What breaks if ignored
  recommendation?: string;   // What to do instead
};


export type PRDiffInput = {
  prNumber: number;
  title: string;
  files: PRFileDiff[];
  baseBranch: string;
  headBranch: string;
};


export interface ExplainedFeedback {
  id: string;
  violation: RawViolation;
  explanation: string;
  teamExpectation: string;
  codeExample?: {
    before: string;
    after: string;
    file?: string;
    line?: number;
  };
  relatedIncident?: string;
  learningResources?: string[];
  conventionReference?: {
    id: string;
    rule: string;
  };
}

export interface FormattedComment {
  id: string;
  file: string;
  line: number;
  body: string;
  severity: "error" | "warning" | "suggestion";
  type: string;
}

export interface CodeExample {
  id: string;
  category: string;
  code: string;
  file: string;
  line: number;
  description: string;
  isGood: boolean;
}

// ============================================
// PR Diff Types for Reviewer
// ============================================

export interface PRFileDiff {
  path: string;
  diff: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}



// ============================================
// Reviewer Routing Types
// ============================================

export type ReviewerCategory = "naming" | "structure" | "pattern" | "testing";

export type FileRouting = {
  filePath: string;
  assignedReviewers: ReviewerCategory[];
  reasoning: string;
};

// ============================================
// Type Aliases (for backwards compatibility)
// ============================================

export type ReviewerStateUpdated = ReviewerState;
export type TutorStateUpdated = TutorState;
export type FeedbackControllerStateUpdated = FeedbackControllerState;

// ============================================
// Knowledge Store Interface
// ============================================

export interface KnowledgeStoreInterface {
  addConvention(convention: Convention): void;
  getConvention(id: string): Convention | undefined;
  getAllConventions(): Convention[];
  getConventionsByCategory(category: Convention["category"]): Convention[];
  searchConventions(query: string): Convention[];
  addExample(category: string, example: CodeExample): void;
  getExamplesForCategory(category: string): CodeExample[];
  saveToDisk(): Promise<void>;
  clear(): Promise<void>;
}
