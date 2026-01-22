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
