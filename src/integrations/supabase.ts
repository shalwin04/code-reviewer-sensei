import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/index.js";

// ============================================
// Supabase Client Singleton
// ============================================

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = config.supabase.url;
    const key = config.supabase.serviceKey || config.supabase.anonKey;

    if (!url || !key) {
      throw new Error(
        "Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env"
      );
    }

    supabaseClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

// ============================================
// Database Types
// ============================================

export interface DbRepository {
  id: string;
  name: string;
  full_name: string;
  platform: string;
  external_id: string | null;
  default_branch: string;
  description: string | null;
  primary_language: string | null;
  created_at: string;
  updated_at: string;
  last_learned_at: string | null;
}

export interface DbConvention {
  id: string;
  repository_id: string;
  learning_run_id: string | null;
  category: string;
  rule: string;
  description: string | null;
  severity: string;
  confidence: number;
  source_type: string;
  source_reference: string | null;
  tags: string[];
  applies_to: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbConventionExample {
  id: string;
  convention_id: string;
  example_type: "good" | "bad";
  code: string;
  explanation: string | null;
  file_reference: string | null;
  created_at: string;
}

export interface DbLearningRun {
  id: string;
  repository_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  sources_summary: Record<string, number>;
  conventions_found: number;
  conventions_added: number;
  error_message: string | null;
}

// ============================================
// Type for convention with examples joined
// ============================================

export interface DbConventionWithExamples extends DbConvention {
  convention_examples?: DbConventionExample[];
}

// ============================================
// Review History Types
// ============================================

export interface DbReviewHistory {
  id: string;
  repository_id: string;
  pr_number: number;
  pr_title: string;
  pr_url: string;
  pr_author: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  trigger_type: "webhook" | "manual";
  violations_count: number;
  errors_count: number;
  warnings_count: number;
  suggestions_count: number;
  score: number;
  summary: string | null;
  review_data: Record<string, unknown> | null;
  github_review_id: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface DbWebhookRegistration {
  id: string;
  repository_id: string;
  webhook_secret: string;
  is_active: boolean;
  github_webhook_id: string | null;
  last_received_at: string | null;
  events_received: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Review History Functions
// ============================================

export async function createReviewHistory(
  repositoryFullName: string,
  prNumber: number,
  prTitle: string,
  prAuthor: string | null,
  triggerType: "webhook" | "manual"
): Promise<DbReviewHistory | null> {
  const supabase = getSupabaseClient();

  // First get or create repository
  let { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) {
    // Create repository if it doesn't exist
    const name = repositoryFullName.split("/")[1] || repositoryFullName;
    const { data: newRepo } = await supabase
      .from("repositories")
      .insert({
        name,
        full_name: repositoryFullName,
        platform: "github",
        default_branch: "main",
      })
      .select("id")
      .single();
    repo = newRepo;
  }

  if (!repo) return null;

  const prUrl = `https://github.com/${repositoryFullName}/pull/${prNumber}`;

  const { data, error } = await supabase
    .from("review_history")
    .insert({
      repository_id: repo.id,
      pr_number: prNumber,
      pr_title: prTitle,
      pr_url: prUrl,
      pr_author: prAuthor,
      status: "pending",
      trigger_type: triggerType,
      violations_count: 0,
      errors_count: 0,
      warnings_count: 0,
      suggestions_count: 0,
      score: 100,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create review history:", error);
    return null;
  }

  return data;
}

export async function updateReviewHistory(
  reviewId: string,
  updates: {
    status?: DbReviewHistory["status"];
    violations_count?: number;
    errors_count?: number;
    warnings_count?: number;
    suggestions_count?: number;
    score?: number;
    summary?: string;
    review_data?: Record<string, unknown>;
    github_review_id?: string;
    completed_at?: string;
  }
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("review_history")
    .update(updates)
    .eq("id", reviewId);

  if (error) {
    console.error("Failed to update review history:", error);
  }
}

export async function getReviewHistory(
  repositoryFullName: string,
  limit: number = 20
): Promise<DbReviewHistory[]> {
  const supabase = getSupabaseClient();

  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return [];

  const { data, error } = await supabase
    .from("review_history")
    .select("*")
    .eq("repository_id", repo.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to get review history:", error);
    return [];
  }

  return data || [];
}

export async function getReviewById(reviewId: string): Promise<DbReviewHistory | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("review_history")
    .select("*")
    .eq("id", reviewId)
    .single();

  if (error) {
    console.error("Failed to get review:", error);
    return null;
  }

  return data;
}

// ============================================
// Webhook Registration Functions
// ============================================

export async function getOrCreateWebhookRegistration(
  repositoryFullName: string
): Promise<DbWebhookRegistration | null> {
  const supabase = getSupabaseClient();

  // Get repository
  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return null;

  // Check for existing registration
  const { data: existing } = await supabase
    .from("webhook_registrations")
    .select("*")
    .eq("repository_id", repo.id)
    .single();

  if (existing) return existing;

  // Create new registration with unique secret
  const webhookSecret = crypto.randomUUID() + "-" + Date.now().toString(36);

  const { data, error } = await supabase
    .from("webhook_registrations")
    .insert({
      repository_id: repo.id,
      webhook_secret: webhookSecret,
      is_active: true,
      events_received: 0,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create webhook registration:", error);
    return null;
  }

  return data;
}

export async function validateWebhookSecret(
  repositoryFullName: string,
  secret: string
): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return false;

  const { data } = await supabase
    .from("webhook_registrations")
    .select("webhook_secret, is_active")
    .eq("repository_id", repo.id)
    .single();

  return data?.is_active && data?.webhook_secret === secret;
}

export async function recordWebhookReceived(repositoryFullName: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return;

  await supabase.rpc("increment_webhook_events", { repo_id: repo.id });
}
