# Implementation Plan: Learner + Knowledge Store with Supabase

## Scope

Focus **only** on:
- Knowledge Store using Supabase
- Learner Agent integration
- Repository management

---

## Phase 1: Setup Supabase

### 1.1 Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 1.2 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Save credentials to `.env`:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...  # Optional, for admin ops
```

### 1.3 Run Database Migrations

In Supabase SQL Editor, run:

```sql
-- See DATABASE_DESIGN.md for full schema
-- Quick version below:

CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(500) NOT NULL,
  platform VARCHAR(50) DEFAULT 'github',
  external_id VARCHAR(255),
  default_branch VARCHAR(100) DEFAULT 'main',
  description TEXT,
  primary_language VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_learned_at TIMESTAMPTZ,
  UNIQUE(platform, full_name)
);

CREATE TABLE learning_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'running',
  sources_summary JSONB DEFAULT '{}',
  conventions_found INTEGER DEFAULT 0,
  conventions_added INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE TABLE conventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  learning_run_id UUID REFERENCES learning_runs(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  rule VARCHAR(500) NOT NULL,
  description TEXT,
  severity VARCHAR(20) DEFAULT 'warning',
  confidence DECIMAL(3,2) DEFAULT 0.80,
  source_type VARCHAR(50) NOT NULL,
  source_reference TEXT,
  tags TEXT[] DEFAULT '{}',
  applies_to TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE convention_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convention_id UUID NOT NULL REFERENCES conventions(id) ON DELETE CASCADE,
  example_type VARCHAR(10) NOT NULL,
  code TEXT NOT NULL,
  explanation TEXT,
  file_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conventions_repo ON conventions(repository_id);
CREATE INDEX idx_conventions_category ON conventions(repository_id, category);
CREATE INDEX idx_conventions_active ON conventions(repository_id, is_active);
```

---

## Phase 2: Create Supabase Client

### 2.1 New File: `src/integrations/supabase.ts`

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/index.js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = config.supabase.url;
    const key = config.supabase.serviceKey || config.supabase.anonKey;

    if (!url || !key) {
      throw new Error("Supabase URL and Key are required");
    }

    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// Database types (generate from Supabase CLI later)
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
```

---

## Phase 3: Create New Knowledge Store

### 3.1 New File: `src/knowledge/supabase-store.ts`

```typescript
import { getSupabaseClient, DbConvention, DbConventionExample, DbRepository, DbLearningRun } from "../integrations/supabase.js";
import type { Convention, CodeExample } from "../types/index.js";

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
  }

  private async getOrCreateRepository(): Promise<DbRepository> {
    const supabase = getSupabaseClient();

    // Try to find existing
    const { data: existing } = await supabase
      .from("repositories")
      .select("*")
      .eq("full_name", this.repositoryFullName)
      .single();

    if (existing) {
      return existing;
    }

    // Create new
    const [owner, name] = this.repositoryFullName.split("/");
    const { data: created, error } = await supabase
      .from("repositories")
      .insert({
        name: name || this.repositoryFullName,
        full_name: this.repositoryFullName,
        platform: "github",
      })
      .select()
      .single();

    if (error) throw error;
    return created;
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

    if (error) throw error;
    return data.id;
  }

  async completeLearningRun(
    runId: string,
    summary: { sources: Record<string, number>; found: number; added: number }
  ): Promise<void> {
    const supabase = getSupabaseClient();

    await supabase
      .from("learning_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        sources_summary: summary.sources,
        conventions_found: summary.found,
        conventions_added: summary.added,
      })
      .eq("id", runId);

    // Update repository last_learned_at
    await supabase
      .from("repositories")
      .update({ last_learned_at: new Date().toISOString() })
      .eq("id", this.repositoryId);
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
  }

  // ============================================
  // Convention Operations
  // ============================================

  async addConvention(convention: Convention, runId?: string): Promise<string> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("conventions")
      .insert({
        repository_id: this.repositoryId,
        learning_run_id: runId,
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

    if (error) throw error;

    // Add examples
    if (convention.examples && convention.examples.length > 0) {
      await this.addExamples(data.id, convention.examples);
    }

    return data.id;
  }

  async addConventions(conventions: Convention[], runId?: string): Promise<number> {
    let added = 0;
    for (const convention of conventions) {
      try {
        await this.addConvention(convention, runId);
        added++;
      } catch (error) {
        console.error(`Failed to add convention: ${convention.rule}`, error);
      }
    }
    return added;
  }

  private async addExamples(
    conventionId: string,
    examples: Convention["examples"]
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const records = examples.flatMap((ex) => {
      const result = [];
      if (ex.good) {
        result.push({
          convention_id: conventionId,
          example_type: "good",
          code: ex.good,
          explanation: ex.explanation,
        });
      }
      if (ex.bad) {
        result.push({
          convention_id: conventionId,
          example_type: "bad",
          code: ex.bad,
          explanation: ex.explanation,
        });
      }
      return result;
    });

    if (records.length > 0) {
      await supabase.from("convention_examples").insert(records);
    }
  }

  async getConvention(id: string): Promise<Convention | null> {
    const supabase = getSupabaseClient();

    const { data } = await supabase
      .from("conventions")
      .select(`*, convention_examples(*)`)
      .eq("id", id)
      .single();

    if (!data) return null;
    return this.mapDbToConvention(data);
  }

  async getAllConventions(): Promise<Convention[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("conventions")
      .select(`*, convention_examples(*)`)
      .eq("repository_id", this.repositoryId)
      .eq("is_active", true)
      .order("confidence", { ascending: false });

    if (error) throw error;
    return (data || []).map(this.mapDbToConvention);
  }

  async getConventionsByCategory(category: string): Promise<Convention[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("conventions")
      .select(`*, convention_examples(*)`)
      .eq("repository_id", this.repositoryId)
      .eq("category", category)
      .eq("is_active", true)
      .order("confidence", { ascending: false });

    if (error) throw error;
    return (data || []).map(this.mapDbToConvention);
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

    if (error) throw error;
    return (data || []).map(this.mapDbToConvention);
  }

  async deactivateConvention(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase
      .from("conventions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
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

    const { data: conventions } = await supabase
      .from("conventions")
      .select("category")
      .eq("repository_id", this.repositoryId)
      .eq("is_active", true);

    const { data: repo } = await supabase
      .from("repositories")
      .select("last_learned_at")
      .eq("id", this.repositoryId)
      .single();

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
  // Helpers
  // ============================================

  private mapDbToConvention(db: DbConvention & { convention_examples?: DbConventionExample[] }): Convention {
    const examples: Convention["examples"] = [];

    // Group examples by explanation
    const goodExamples = db.convention_examples?.filter(e => e.example_type === "good") || [];
    const badExamples = db.convention_examples?.filter(e => e.example_type === "bad") || [];

    // Pair them up or add individually
    const maxLen = Math.max(goodExamples.length, badExamples.length);
    for (let i = 0; i < maxLen; i++) {
      examples.push({
        good: goodExamples[i]?.code,
        bad: badExamples[i]?.code,
        explanation: goodExamples[i]?.explanation || badExamples[i]?.explanation || "",
      });
    }

    return {
      id: db.id,
      category: db.category as Convention["category"],
      rule: db.rule,
      description: db.description || "",
      examples,
      source: {
        type: db.source_type,
        reference: db.source_reference || "",
        timestamp: db.created_at,
      },
      confidence: db.confidence,
      tags: db.tags || [],
    };
  }
}

// Factory function
let storeInstances: Map<string, SupabaseKnowledgeStore> = new Map();

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
```

---

## Phase 4: Update Config

### 4.1 Update `src/config/index.ts`

Add Supabase configuration:

```typescript
export const config = {
  // ... existing config

  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceKey: process.env.SUPABASE_SERVICE_KEY || "",
  },

  // Current repository (set at runtime)
  repository: {
    fullName: process.env.REPOSITORY_FULL_NAME || "",
  },
};
```

---

## Phase 5: Update Learner Agent

### 5.1 Update `src/agents/learner/index.ts`

Change to use Supabase store:

```typescript
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";

// In storeConventions function:
async function storeConventions(
  state: LearnerAgentState
): Promise<Partial<LearnerAgentState>> {
  console.log("💾 Learner Agent: Storing conventions in database...");

  const store = await getSupabaseKnowledgeStore(config.repository.fullName);

  // Start a learning run
  const runId = await store.startLearningRun();

  try {
    const conventions = state.extractedConventions;
    const added = await store.addConventions(conventions, runId);

    // Complete the run
    await store.completeLearningRun(runId, {
      sources: {
        codebase: state.sources.codebase.length,
        adrs: state.sources.adrs.length,
        prReviews: state.sources.prReviews.length,
        incidents: state.sources.incidents.length,
      },
      found: conventions.length,
      added,
    });

    console.log(`   Stored ${added} conventions in database`);

    return {
      processingStatus: "complete",
    };
  } catch (error) {
    await store.failLearningRun(runId, String(error));
    throw error;
  }
}
```

---

## Phase 6: Update CLI

### 6.1 Add Repository Flag

Update CLI to accept repository name:

```typescript
program
  .command("learn")
  .description("Learn conventions from your codebase")
  .requiredOption("-r, --repo <owner/repo>", "Repository full name (e.g., owner/repo)")
  .option("-c, --codebase <path>", "Path to codebase directory")
  // ... other options
  .action(async (options) => {
    // Set repository in config
    config.repository.fullName = options.repo;

    // ... rest of learn command
  });
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `@supabase/supabase-js` |
| `.env.example` | Modify | Add Supabase config vars |
| `src/config/index.ts` | Modify | Add Supabase config |
| `src/integrations/supabase.ts` | **Create** | Supabase client + types |
| `src/knowledge/supabase-store.ts` | **Create** | New Knowledge Store |
| `src/agents/learner/index.ts` | Modify | Use Supabase store |
| `src/cli/index.ts` | Modify | Add --repo flag |

---

## Testing Plan

1. **Create Supabase project** and run migrations
2. **Test store in isolation**:
   ```bash
   npx tsx src/knowledge/supabase-store.ts  # Add a test script
   ```
3. **Test learning flow**:
   ```bash
   npm run dev:cli learn --repo myuser/myrepo --codebase ./src
   ```
4. **Verify in Supabase dashboard** that data is stored

---

## Next Steps After This

1. Update Reviewer to load conventions from Supabase
2. Update Tutor to use Supabase for context
3. Add GitHub App integration for automatic repo detection
4. Add user authentication for multi-tenant support
