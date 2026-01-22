#!/usr/bin/env node

/**
 * AI Code Reviewer - Main Entry Point
 *
 * This is the programmatic entry point for the AI Code Reviewer.
 * For CLI usage, see src/cli/index.ts
 */

export {
  orchestrateReview,
  orchestrateQuestion,
  orchestrateLearning,
  formatForConsole,
  formatForGitHub,
} from "./orchestrator/index.js";

export { getSupabaseKnowledgeStore } from "./knowledge/supabase-store.js";

export { config } from "./config/index.js";

export type {
  Convention,
  RawViolation,
  ExplainedFeedback,
  PRDiffInput,
  PRFileDiff,
  FormattedComment,
} from "./types/index.js";
