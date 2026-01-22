import {
  getSupabaseClient,
  DbRepository,
  DbConventionWithExamples,
} from "../integrations/supabase.js";
import type { Convention } from "../types/index.js";

// ============================================
// Supabase Knowledge Store
// ============================================

export class SupabaseKnowledgeStore {
  private repositoryId: string | null = null;
  private repositoryFullName: string;

  constructor(repositoryFullName: string) {
    this.repositoryFullName = repositoryFullName;
  }

  // ============================================
  // Initialization
  // ============================================

  async initialize(): Promise<void> {
    const repo = await this.getOrCreateRepository();
    this.repositoryId = repo.id;
    console.log(`📚 Knowledge Store initialized for: ${this.repositoryFullName}`);
  }

  private async getOrCreateRepository(): Promise<DbRepository> {
    const supabase = getSupabaseClient();

    // Try to find existing repository
    const { data: existing, error: findError } = await supabase
      .from("repositories")
      .select("*")
      .eq("full_name", this.repositoryFullName)
      .single();

    if (existing && !findError) {
      return existing;
    }

    // Create new repository
    const [, name] = this.repositoryFullName.split("/");
    const { data: created, error: createError } = await supabase
      .from("repositories")
      .insert({
        name: name || this.repositoryFullName,
        full_name: this.repositoryFullName,
        platform: "github",
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create repository: ${createError.message}`);
    }

    return created;
  }

  getRepositoryId(): string {
    if (!this.repositoryId) {
      throw new Error("Store not initialized. Call initialize() first.");
    }
    return this.repositoryId;
  }

  // ============================================
  // Learning Runs
  // ============================================

  async startLearningRun(): Promise<string> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("learning_runs")
      .insert({
        repository_id: this.repositoryId,
        status: "running",
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to start learning run: ${error.message}`);
    }

    console.log(`🏃 Started learning run: ${data.id}`);
    return data.id;
  }

  async completeLearningRun(
    runId: string,
    summary: {
      sources: Record<string, number>;
      found: number;
      added: number;
    }
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const { error: runError } = await supabase
      .from("learning_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        sources_summary: summary.sources,
        conventions_found: summary.found,
        conventions_added: summary.added,
      })
      .eq("id", runId);

    if (runError) {
      console.error(`Failed to complete learning run: ${runError.message}`);
    }

    // Update repository last_learned_at
    const { error: repoError } = await supabase
      .from("repositories")
      .update({ last_learned_at: new Date().toISOString() })
      .eq("id", this.repositoryId);

    if (repoError) {
      console.error(`Failed to update repository: ${repoError.message}`);
    }

    console.log(`✅ Completed learning run: ${runId}`);
  }

  async failLearningRun(runId: string, errorMessage: string): Promise<void> {
    const supabase = getSupabaseClient();

    await supabase
      .from("learning_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq("id", runId);

    console.error(`❌ Learning run failed: ${runId}`);
  }

  // ============================================
  // Convention Operations
  // ============================================

  async addConvention(convention: Convention, runId?: string): Promise<string> {
    const supabase = getSupabaseClient();

    // Insert the convention
    const { data, error } = await supabase
      .from("conventions")
      .insert({
        repository_id: this.repositoryId,
        learning_run_id: runId || null,
        category: convention.category,
        rule: convention.rule,
        description: convention.description,
        severity: "warning",
        confidence: convention.confidence,
        source_type: convention.source.type,
        source_reference: convention.source.reference,
        tags: convention.tags,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add convention: ${error.message}`);
    }

    // Add examples if provided
    if (convention.examples && convention.examples.length > 0) {
      await this.addExamples(data.id, convention.examples);
    }

    return data.id;
  }

  async addConventions(
    conventions: Convention[],
    runId?: string
  ): Promise<number> {
    let added = 0;

    for (const convention of conventions) {
      try {
        await this.addConvention(convention, runId);
        added++;
      } catch (error) {
        console.error(`Failed to add convention "${convention.rule}":`, error);
      }
    }

    return added;
  }

  private async addExamples(
    conventionId: string,
    examples: Convention["examples"]
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const records: Array<{
      convention_id: string;
      example_type: "good" | "bad";
      code: string;
      explanation: string;
    }> = [];

    for (const ex of examples) {
      if (ex.good) {
        records.push({
          convention_id: conventionId,
          example_type: "good",
          code: ex.good,
          explanation: ex.explanation,
        });
      }
      if (ex.bad) {
        records.push({
          convention_id: conventionId,
          example_type: "bad",
          code: ex.bad,
          explanation: ex.explanation,
        });
      }
    }

    if (records.length > 0) {
      const { error } = await supabase
        .from("convention_examples")
        .insert(records);

      if (error) {
        console.error(`Failed to add examples: ${error.message}`);
      }
    }
  }

  async getConvention(id: string): Promise<Convention | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("conventions")
      .select(`*, convention_examples(*)`)
      .eq("id", id)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDbToConvention(data as DbConventionWithExamples);
  }

  async getAllConventions(): Promise<Convention[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("conventions")
      .select(`*, convention_examples(*)`)
      .eq("repository_id", this.repositoryId)
      .eq("is_active", true)
      .order("confidence", { ascending: false });

    if (error) {
      throw new Error(`Failed to get conventions: ${error.message}`);
    }

    return (data || []).map((d) =>
      this.mapDbToConvention(d as DbConventionWithExamples)
    );
  }

  async getConventionsByCategory(
    category: Convention["category"]
  ): Promise<Convention[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("conventions")
      .select(`*, convention_examples(*)`)
      .eq("repository_id", this.repositoryId)
      .eq("category", category)
      .eq("is_active", true)
      .order("confidence", { ascending: false });

    if (error) {
      throw new Error(`Failed to get conventions by category: ${error.message}`);
    }

    return (data || []).map((d) =>
      this.mapDbToConvention(d as DbConventionWithExamples)
    );
  }

  async searchConventions(query: string): Promise<Convention[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("conventions")
      .select(`*, convention_examples(*)`)
      .eq("repository_id", this.repositoryId)
      .eq("is_active", true)
      .or(`rule.ilike.%${query}%,description.ilike.%${query}%`)
      .order("confidence", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Failed to search conventions: ${error.message}`);
    }

    return (data || []).map((d) =>
      this.mapDbToConvention(d as DbConventionWithExamples)
    );
  }

  async deactivateConvention(id: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("conventions")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to deactivate convention: ${error.message}`);
    }
  }

  async clearAllConventions(): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("conventions")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("repository_id", this.repositoryId);

    if (error) {
      throw new Error(`Failed to clear conventions: ${error.message}`);
    }

    console.log(`🗑️ Cleared all conventions for ${this.repositoryFullName}`);
  }

  // ============================================
  // Stats
  // ============================================

  async getStats(): Promise<{
    conventions: number;
    byCategory: Record<string, number>;
    lastLearned: string | null;
  }> {
    const supabase = getSupabaseClient();

    // Get convention counts
    const { data: conventions, error: convError } = await supabase
      .from("conventions")
      .select("category")
      .eq("repository_id", this.repositoryId)
      .eq("is_active", true);

    if (convError) {
      throw new Error(`Failed to get stats: ${convError.message}`);
    }

    // Get repository info
    const { data: repo, error: repoError } = await supabase
      .from("repositories")
      .select("last_learned_at")
      .eq("id", this.repositoryId)
      .single();

    if (repoError) {
      console.error(`Failed to get repository info: ${repoError.message}`);
    }

    // Count by category
    const byCategory: Record<string, number> = {};
    for (const c of conventions || []) {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    }

    return {
      conventions: conventions?.length || 0,
      byCategory,
      lastLearned: repo?.last_learned_at || null,
    };
  }

  // ============================================
  // Repository Info
  // ============================================

  async getRepositoryInfo(): Promise<DbRepository | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("repositories")
      .select("*")
      .eq("id", this.repositoryId)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  // ============================================
  // Helpers
  // ============================================

  private mapDbToConvention(db: DbConventionWithExamples): Convention {
    const examples: Convention["examples"] = [];

    // Group examples
    const goodExamples =
      db.convention_examples?.filter((e) => e.example_type === "good") || [];
    const badExamples =
      db.convention_examples?.filter((e) => e.example_type === "bad") || [];

    // Pair them up or add individually
    const maxLen = Math.max(goodExamples.length, badExamples.length);
    for (let i = 0; i < maxLen; i++) {
      examples.push({
        good: goodExamples[i]?.code,
        bad: badExamples[i]?.code,
        explanation:
          goodExamples[i]?.explanation || badExamples[i]?.explanation || "",
      });
    }

    return {
      id: db.id,
      category: db.category as Convention["category"],
      rule: db.rule,
      description: db.description || "",
      examples,
      source: {
        type: db.source_type as Convention["source"]["type"],
        reference: db.source_reference || "",
        timestamp: db.created_at,
      },
      confidence: db.confidence,
      tags: db.tags || [],
    };
  }
}

// ============================================
// Factory Function (Singleton per repository)
// ============================================

const storeInstances: Map<string, SupabaseKnowledgeStore> = new Map();

export async function getSupabaseKnowledgeStore(
  repositoryFullName: string
): Promise<SupabaseKnowledgeStore> {
  if (!storeInstances.has(repositoryFullName)) {
    const store = new SupabaseKnowledgeStore(repositoryFullName);
    await store.initialize();
    storeInstances.set(repositoryFullName, store);
  }
  return storeInstances.get(repositoryFullName)!;
}

// Clear cached instances (useful for testing)
export function clearStoreCache(): void {
  storeInstances.clear();
}
