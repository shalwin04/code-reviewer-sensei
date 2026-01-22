# Knowledge Store Database Design (Supabase)

## Overview

The Knowledge Store uses Supabase (PostgreSQL) to persistently store team conventions extracted by the Learner Agent. This allows:

- **Multi-repo support** - One user can have conventions for multiple projects
- **Persistence** - Data survives across sessions, machines, deployments
- **Versioning** - Track how conventions evolve over time
- **Source tracking** - Know where each convention came from
- **Querying** - Efficiently search and filter conventions

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────────┐
│   repositories  │       │    learning_runs    │
├─────────────────┤       ├─────────────────────┤
│ id (uuid) PK    │──┐    │ id (uuid) PK        │
│ name            │  │    │ repository_id FK    │──┐
│ full_name       │  │    │ started_at          │  │
│ platform        │  │    │ completed_at        │  │
│ external_id     │  │    │ status              │  │
│ default_branch  │  │    │ sources_summary     │  │
│ created_at      │  │    │ conventions_found   │  │
│ updated_at      │  │    │ error_message       │  │
└─────────────────┘  │    └─────────────────────┘  │
                     │                              │
                     │    ┌─────────────────────┐   │
                     │    │    conventions      │   │
                     │    ├─────────────────────┤   │
                     └───►│ id (uuid) PK        │   │
                          │ repository_id FK    │◄──┘
                          │ learning_run_id FK  │
                          │ category            │
                          │ rule                │
                          │ description         │
                          │ severity            │
                          │ confidence          │
                          │ source_type         │
                          │ source_reference    │
                          │ tags                │
                          │ is_active           │
                          │ created_at          │
                          │ updated_at          │
                          └──────────┬──────────┘
                                     │
                                     │
                     ┌───────────────┴───────────────┐
                     │                               │
                     ▼                               ▼
        ┌─────────────────────┐        ┌─────────────────────┐
        │ convention_examples │        │  convention_rules   │
        ├─────────────────────┤        ├─────────────────────┤
        │ id (uuid) PK        │        │ id (uuid) PK        │
        │ convention_id FK    │        │ convention_id FK    │
        │ example_type        │        │ rule_type           │
        │ code                │        │ pattern             │
        │ explanation         │        │ scope               │
        │ file_reference      │        │ check_config        │
        │ created_at          │        │ created_at          │
        └─────────────────────┘        └─────────────────────┘
```

---

## Table Definitions

### 1. `repositories`

Tracks repositories that have been onboarded.

```sql
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Repository identification
  name VARCHAR(255) NOT NULL,              -- e.g., "ai-code-reviewer"
  full_name VARCHAR(500) NOT NULL,         -- e.g., "shalwinsanju/ai-code-reviewer"
  platform VARCHAR(50) DEFAULT 'github',   -- github, gitlab, bitbucket
  external_id VARCHAR(255),                -- GitHub repo ID for API calls

  -- Repository metadata
  default_branch VARCHAR(100) DEFAULT 'main',
  description TEXT,
  primary_language VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_learned_at TIMESTAMPTZ,             -- When learning was last run

  -- Constraints
  UNIQUE(platform, full_name)
);

-- Index for quick lookups
CREATE INDEX idx_repositories_full_name ON repositories(full_name);
CREATE INDEX idx_repositories_platform ON repositories(platform);
```

### 2. `learning_runs`

Tracks each time the Learner Agent runs on a repository.

```sql
CREATE TABLE learning_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,

  -- Run metadata
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'running',    -- running, completed, failed

  -- What was analyzed
  sources_summary JSONB DEFAULT '{}',      -- { "codebase": 45, "adrs": 3, "pr_reviews": 12 }

  -- Results
  conventions_found INTEGER DEFAULT 0,
  conventions_added INTEGER DEFAULT 0,
  conventions_updated INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,

  -- Constraints
  CHECK (status IN ('running', 'completed', 'failed'))
);

-- Index for finding latest run per repo
CREATE INDEX idx_learning_runs_repo_date ON learning_runs(repository_id, started_at DESC);
```

### 3. `conventions`

The core table storing extracted conventions/rules.

```sql
CREATE TABLE conventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  learning_run_id UUID REFERENCES learning_runs(id) ON DELETE SET NULL,

  -- Convention identification
  category VARCHAR(50) NOT NULL,           -- naming, structure, pattern, testing, error-handling, security, performance, documentation
  rule VARCHAR(500) NOT NULL,              -- Short rule statement
  description TEXT,                        -- Detailed explanation

  -- Severity and confidence
  severity VARCHAR(20) DEFAULT 'warning',  -- error, warning, suggestion
  confidence DECIMAL(3,2) DEFAULT 0.80,    -- 0.00 to 1.00

  -- Source tracking
  source_type VARCHAR(50) NOT NULL,        -- codebase, adr, pr_review, incident, manual
  source_reference TEXT,                   -- File path, ADR number, PR URL, etc.

  -- Categorization
  tags TEXT[] DEFAULT '{}',                -- ['typescript', 'react', 'api']
  applies_to TEXT[] DEFAULT '{}',          -- File patterns: ['*.ts', '*.tsx', 'src/services/*']

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_auto_detected BOOLEAN DEFAULT true,   -- false if manually added

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (category IN ('naming', 'structure', 'pattern', 'testing', 'error-handling', 'security', 'performance', 'documentation')),
  CHECK (severity IN ('error', 'warning', 'suggestion')),
  CHECK (source_type IN ('codebase', 'adr', 'pr_review', 'incident', 'manual')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for common queries
CREATE INDEX idx_conventions_repo ON conventions(repository_id);
CREATE INDEX idx_conventions_category ON conventions(repository_id, category);
CREATE INDEX idx_conventions_active ON conventions(repository_id, is_active);
CREATE INDEX idx_conventions_tags ON conventions USING GIN(tags);
```

### 4. `convention_examples`

Good and bad code examples for each convention.

```sql
CREATE TABLE convention_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convention_id UUID NOT NULL REFERENCES conventions(id) ON DELETE CASCADE,

  -- Example content
  example_type VARCHAR(10) NOT NULL,       -- good, bad
  code TEXT NOT NULL,                      -- The code example
  explanation TEXT,                        -- Why this is good/bad

  -- Optional source reference
  file_reference TEXT,                     -- Where this example came from
  line_number INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (example_type IN ('good', 'bad'))
);

-- Index for fetching examples by convention
CREATE INDEX idx_convention_examples_conv ON convention_examples(convention_id);
```

### 5. `convention_rules` (Optional - for mechanical checking)

Structured rules that can be checked programmatically.

```sql
CREATE TABLE convention_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convention_id UUID NOT NULL REFERENCES conventions(id) ON DELETE CASCADE,

  -- Rule definition
  rule_type VARCHAR(100) NOT NULL,         -- file_case, variable_case, require_try_catch, etc.
  pattern VARCHAR(255),                    -- PascalCase, camelCase, regex pattern
  scope VARCHAR(100),                      -- files, variables, functions, classes

  -- Additional configuration (flexible JSON)
  check_config JSONB DEFAULT '{}',         -- { "extensions": [".ts"], "exclude": ["*.test.ts"] }

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (rule_type IN (
    'file_case', 'variable_case', 'function_case', 'class_case', 'constant_case',
    'require_error_handling', 'forbid_pattern', 'require_pattern',
    'max_file_length', 'max_function_length',
    'folder_structure', 'import_order'
  ))
);

-- Index for fetching rules by convention
CREATE INDEX idx_convention_rules_conv ON convention_rules(convention_id);
```

---

## Sample Data

### Repository

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "ai-code-reviewer",
  "full_name": "shalwinsanju/ai-code-reviewer",
  "platform": "github",
  "external_id": "123456789",
  "default_branch": "main",
  "primary_language": "TypeScript"
}
```

### Convention

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "repository_id": "550e8400-e29b-41d4-a716-446655440000",
  "category": "naming",
  "rule": "Use PascalCase for TypeScript files containing classes or components",
  "description": "All .ts and .tsx files that export a class or React component should use PascalCase naming. This helps quickly identify module types and maintains consistency across the codebase.",
  "severity": "warning",
  "confidence": 0.92,
  "source_type": "codebase",
  "source_reference": "Detected from 45 files in src/",
  "tags": ["typescript", "react", "files"],
  "applies_to": ["*.ts", "*.tsx"],
  "is_active": true
}
```

### Convention Example

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "convention_id": "660e8400-e29b-41d4-a716-446655440001",
  "example_type": "good",
  "code": "UserService.ts\nAuthController.tsx\nPaymentGateway.ts",
  "explanation": "These follow PascalCase naming for class/component files",
  "file_reference": "src/services/"
}
```

---

## Supabase Setup

### 1. Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Note down: `Project URL` and `anon/service_role key`

### 2. Run Migrations

Create a migration file or run in SQL Editor:

```sql
-- Run all CREATE TABLE statements from above
-- Then create RLS policies (see below)
```

### 3. Row Level Security (RLS)

For multi-tenant security (if needed later):

```sql
-- Enable RLS
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE conventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE convention_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_runs ENABLE ROW LEVEL SECURITY;

-- For now, allow all access (single user mode)
CREATE POLICY "Allow all access" ON repositories FOR ALL USING (true);
CREATE POLICY "Allow all access" ON conventions FOR ALL USING (true);
CREATE POLICY "Allow all access" ON convention_examples FOR ALL USING (true);
CREATE POLICY "Allow all access" ON learning_runs FOR ALL USING (true);
```

### 4. Environment Variables

Add to `.env`:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key  # For server-side operations
```

---

## Query Examples

### Get all conventions for a repo

```sql
SELECT c.*,
       array_agg(DISTINCT ce.code) FILTER (WHERE ce.example_type = 'good') as good_examples,
       array_agg(DISTINCT ce.code) FILTER (WHERE ce.example_type = 'bad') as bad_examples
FROM conventions c
LEFT JOIN convention_examples ce ON c.id = ce.convention_id
WHERE c.repository_id = $1
  AND c.is_active = true
GROUP BY c.id
ORDER BY c.confidence DESC;
```

### Get conventions by category

```sql
SELECT * FROM conventions
WHERE repository_id = $1
  AND category = $2
  AND is_active = true
ORDER BY confidence DESC;
```

### Search conventions

```sql
SELECT * FROM conventions
WHERE repository_id = $1
  AND is_active = true
  AND (
    rule ILIKE '%' || $2 || '%'
    OR description ILIKE '%' || $2 || '%'
    OR $2 = ANY(tags)
  )
ORDER BY confidence DESC
LIMIT 10;
```

### Get repository with stats

```sql
SELECT r.*,
       COUNT(c.id) as total_conventions,
       COUNT(c.id) FILTER (WHERE c.category = 'naming') as naming_count,
       COUNT(c.id) FILTER (WHERE c.category = 'pattern') as pattern_count,
       MAX(lr.completed_at) as last_learning_run
FROM repositories r
LEFT JOIN conventions c ON r.id = c.repository_id AND c.is_active = true
LEFT JOIN learning_runs lr ON r.id = lr.repository_id AND lr.status = 'completed'
WHERE r.id = $1
GROUP BY r.id;
```

---

## API Functions (Supabase Edge Functions or App)

### `upsertRepository(repo)`

```typescript
async function upsertRepository(repo: {
  name: string;
  fullName: string;
  platform?: string;
  externalId?: string;
}) {
  const { data, error } = await supabase
    .from('repositories')
    .upsert({
      name: repo.name,
      full_name: repo.fullName,
      platform: repo.platform || 'github',
      external_id: repo.externalId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'platform,full_name'
    })
    .select()
    .single();

  return data;
}
```

### `saveConventions(repoId, conventions, runId)`

```typescript
async function saveConventions(
  repoId: string,
  conventions: Convention[],
  runId: string
) {
  const records = conventions.map(c => ({
    repository_id: repoId,
    learning_run_id: runId,
    category: c.category,
    rule: c.rule,
    description: c.description,
    severity: c.severity || 'warning',
    confidence: c.confidence,
    source_type: c.source.type,
    source_reference: c.source.reference,
    tags: c.tags,
    is_active: true
  }));

  const { data, error } = await supabase
    .from('conventions')
    .insert(records)
    .select();

  return data;
}
```

### `getConventionsForReview(repoId, category?)`

```typescript
async function getConventionsForReview(
  repoId: string,
  category?: string
) {
  let query = supabase
    .from('conventions')
    .select(`
      *,
      convention_examples(*)
    `)
    .eq('repository_id', repoId)
    .eq('is_active', true)
    .order('confidence', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  return data;
}
```

---

## Migration Path

### From File-Based to Supabase

1. **Add Supabase client** to the project
2. **Create new KnowledgeStore** that uses Supabase
3. **Migration script** to move existing JSON data to Supabase
4. **Update agents** to use new store interface

The interface remains the same - only the implementation changes.
