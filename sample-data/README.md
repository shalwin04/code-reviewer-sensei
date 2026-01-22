# Sample Data for Testing

This directory contains sample data for testing the AI Code Reviewer.

## Files

### `sample-conventions.json`

Contains 10 sample conventions that mimic what the Learner agent would extract:

| ID | Category | Rule |
|----|----------|------|
| `conv-naming-001` | naming | PascalCase for TypeScript files |
| `conv-naming-002` | naming | camelCase for variables/functions |
| `conv-pattern-001` | pattern | Wrap async in try-catch |
| `conv-pattern-002` | pattern | Use dependency injection |
| `conv-structure-001` | structure | Services in src/services/ |
| `conv-structure-002` | structure | Files under 300 lines |
| `conv-testing-001` | testing | Test file naming (.test.ts) |
| `conv-testing-002` | testing | Use describe blocks |
| `conv-error-001` | error-handling | Custom error classes |
| `conv-security-001` | security | Never log sensitive data |

## Usage

### For Reviewer Testing

Your colleague can load these conventions into the Knowledge Store:

```typescript
import { getSupabaseKnowledgeStore } from "../knowledge/supabase-store.js";
import sampleConventions from "../../sample-data/sample-conventions.json";

async function loadSampleData() {
  const store = await getSupabaseKnowledgeStore("test/sample-repo");
  const runId = await store.startLearningRun();

  for (const conv of sampleConventions) {
    await store.addConvention(conv, runId);
  }

  await store.completeLearningRun(runId, {
    sources: { manual: 1 },
    found: sampleConventions.length,
    added: sampleConventions.length,
  });

  console.log("Sample conventions loaded!");
}
```

### Direct SQL Insert (Supabase)

Or insert directly into Supabase:

```sql
-- First create a test repository
INSERT INTO repositories (name, full_name, platform)
VALUES ('sample-repo', 'test/sample-repo', 'github')
RETURNING id;

-- Then use that ID to insert conventions
-- (See sample-conventions.json for the data)
```

## Sample Code for Testing Reviewer

Here's some code that violates the sample conventions:

```typescript
// BAD: violates multiple conventions

// conv-naming-001: Should be PascalCase
// File: user_service.ts ❌

// conv-naming-002: Should be camelCase
const user_name = "John"; // ❌

// conv-pattern-001: Missing try-catch
async function fetch_user(id) { // ❌ naming too
  const user = await db.users.find(id); // ❌ no error handling
  return user;
}

// conv-security-001: Logging sensitive data
console.log("User logged in:", { password: user.password }); // ❌
```

```typescript
// GOOD: follows conventions

// File: UserService.ts ✅

const userName = "John"; // ✅

async function fetchUser(id: string) {
  try { // ✅ error handling
    const user = await db.users.find(id);
    return user;
  } catch (error) {
    logger.error("Failed to fetch user", { id }); // ✅ no sensitive data
    throw new UserNotFoundError(id); // ✅ custom error
  }
}
```
