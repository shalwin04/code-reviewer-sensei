# System Reference Guide

A quick reference for understanding how the AI Code Reviewer works.

---

## Core Principle

> **"The Learner builds the team's rulebook, the Reviewer enforces it on pull requests, and the Teaching Agent explains the reasoning using real team history."**

---

## Agent Responsibilities (One-Line Each)

| Agent | Responsibility |
|-------|----------------|
| **Learner** | Builds & updates team knowledge (rules, patterns, decisions) |
| **Reviewer** | Applies rules mechanically & finds violations |
| **Tutor** | Explains violations using team knowledge |
| **Feedback Controller** | Formats & delivers output |

---

## The Key Question Answered

### "How does the Reviewer know the team's naming & patterns?"

**Answer: It doesn't know anything on its own.**

```
Learner Agent    →  creates rules  →  Knowledge Store
Reviewer Agent   →  loads rules    →  checks PR against them
Teaching Agent   →  reads rules    →  explains violations
```

The Reviewer is like a lint tool that says:
> "Give me the team's rulebook, and I'll check the PR against it."

---

## System Flow

### Phase 1: Learning (Offline / One-Time Setup)

```
┌─────────────────────────────────────────────────────┐
│                    INPUT SOURCES                     │
├─────────────────────────────────────────────────────┤
│  📁 Codebase        - existing code patterns        │
│  📄 ADRs            - architectural decisions       │
│  💬 Past PR Reviews - "this is our standard" comments│
│  🚨 Incident Reports- lessons learned               │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│               🧠 LEARNER AGENT                       │
│                                                      │
│  Extracts & structures team knowledge:               │
│  • Naming conventions                                │
│  • Folder structure rules                            │
│  • Pattern preferences                               │
│  • Testing expectations                              │
│  • Error handling requirements                       │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│            📚 TEAM KNOWLEDGE STORE                   │
│                                                      │
│  {                                                   │
│    "naming": {                                       │
│      "file_case": "PascalCase",                     │
│      "function_case": "camelCase",                  │
│      "no_abbreviations": true                       │
│    },                                                │
│    "patterns": {                                     │
│      "require_error_handling": true,                │
│      "forbid_raw_sql": true                         │
│    },                                                │
│    "structure": {                                    │
│      "services_in": "/domain/services"              │
│    }                                                 │
│  }                                                   │
└─────────────────────────────────────────────────────┘
```

**When does this run?**
- ✅ Once during initial setup
- ✅ Incrementally when new docs/decisions appear
- ❌ NOT during PR review (already done)

---

### Phase 2: PR Review (Online / Runtime)

```
┌─────────────────────────────────────────────────────┐
│              Developer Opens PR                      │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│           🔍 REVIEWER ORCHESTRATOR                   │
│                                                      │
│  1. Load Team Rules from Knowledge Store             │
│  2. Pass rules to each sub-reviewer                  │
└───────────────────────┬─────────────────────────────┘
                        │
        ┌───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Naming     │ │  Structure   │ │   Pattern    │ │   Testing    │
│   Reviewer   │ │   Reviewer   │ │   Reviewer   │ │   Reviewer   │
│              │ │              │ │              │ │              │
│ run(pr,rules)│ │ run(pr,rules)│ │ run(pr,rules)│ │ run(pr,rules)│
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │                │
       └────────────────┴────────────────┴────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              📦 RAW VIOLATIONS                       │
│                                                      │
│  [                                                   │
│    {                                                 │
│      "category": "NAMING",                          │
│      "file": "user_service.ts",                     │
│      "line": 1,                                      │
│      "issue": "File name should be PascalCase"      │
│    },                                                │
│    {                                                 │
│      "category": "PATTERN",                         │
│      "file": "api.ts",                              │
│      "line": 42,                                     │
│      "issue": "Missing error handling"              │
│    }                                                 │
│  ]                                                   │
│                                                      │
│  ⚠️  NO explanations yet                            │
│  ⚠️  NO history yet                                 │
│  ⚠️  Just: what rule was broken                     │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│             🎓 TEACHING / TUTOR AGENT                │
│                                                      │
│  For each violation:                                 │
│  1. Look up related convention in Knowledge Store   │
│  2. Find team examples and history                  │
│  3. Generate educational explanation                │
│  4. Include "why it matters" context                │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│         💬 SMART PR COMMENTS ON GITHUB               │
│                                                      │
│  "File name should be PascalCase.                   │
│                                                      │
│   Why: Our team decided in ADR-0042 to use          │
│   PascalCase for all service files after the        │
│   user-service vs UserService confusion incident.   │
│                                                      │
│   Example: Rename to `UserService.ts`"              │
└─────────────────────────────────────────────────────┘
```

---

### Phase 3: Developer Questions

```
┌─────────────────────────────────────────────────────┐
│    Developer asks: "Why is this rule needed?"        │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│             🎓 TEACHING AGENT                        │
│                                                      │
│  Reads from Knowledge Store:                         │
│  • Original decision/ADR                            │
│  • Related incidents                                │
│  • Team examples                                    │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│           💡 Contextual Explanation                  │
│                                                      │
│  "This rule exists because in March 2024,           │
│   we had an incident where mixed casing caused      │
│   import failures on case-sensitive file systems.   │
│   See: ADR-0042, Incident #127"                     │
└─────────────────────────────────────────────────────┘
```

**Note:**
- ❌ Learner does NOT talk to users
- ❌ Reviewer does NOT explain
- ✅ Teaching Agent does both reading + explaining

---

## Sub-Reviewer Logic Examples

### Naming Reviewer

**Rule from Knowledge Store:**
```json
{ "file_case": "PascalCase" }
```

**PR contains:**
```
user_service.ts  ❌
```

**Logic:**
```typescript
if (!isPascalCase(filename) && rules.naming.file_case === "PascalCase") {
  report({
    category: "NAMING",
    file: filename,
    issue: "File name should be PascalCase"
  });
}
```

### Pattern Reviewer

**Rule from Knowledge Store:**
```json
{ "require_error_handling": true }
```

**PR contains:**
```typescript
fetchUser() {
  return db.query("SELECT * FROM users")  // No try-catch!
}
```

**Logic:**
```typescript
if (noTryCatch(code) && rules.patterns.require_error_handling) {
  report({
    category: "PATTERN",
    file: filename,
    line: lineNumber,
    issue: "Missing error handling"
  });
}
```

---

## Complete Flow Diagram

```
                    ┌─────────────────────┐
                    │   LEARNER AGENT     │
                    │   (builds rules)    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  KNOWLEDGE STORE    │◄────────────────┐
                    │  (holds rules)      │                 │
                    └──────────┬──────────┘                 │
                               │                            │
          ┌────────────────────┴────────────────────┐       │
          │                                         │       │
          ▼                                         ▼       │
┌─────────────────────┐                  ┌─────────────────────┐
│   REVIEWER AGENT    │                  │   TEACHING AGENT    │
│   (applies rules)   │                  │   (explains using   │
│                     │                  │    knowledge)       │
└──────────┬──────────┘                  └──────────┬──────────┘
           │                                        │
           │         ┌──────────────┐               │
           └────────►│  Violations  │───────────────┘
                     │  (raw JSON)  │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  PR Comments │
                     │  (explained) │
                     └──────────────┘
```

---

## What Each Agent Does NOT Do

| Agent | Does NOT |
|-------|----------|
| **Learner** | Talk to users, explain things, review PRs |
| **Reviewer** | Think, explain, know rules without Knowledge Store |
| **Tutor** | Create rules, modify knowledge, review code |

---

## Summary

| Step | Agent | Input | Output |
|------|-------|-------|--------|
| 1 | Learner | Codebase, ADRs, PRs, Incidents | Structured rules in Knowledge Store |
| 2 | Reviewer | PR + Rules from Knowledge Store | Raw violations (JSON) |
| 3 | Tutor | Violations + Knowledge Store | Explained feedback |
| 4 | Feedback Controller | Explained feedback | GitHub comments / Console output |

---

## Quick Mental Model

Think of it like a company:

| Role | Real World | Our System |
|------|------------|------------|
| **Policy Writer** | Writes the employee handbook | Learner Agent |
| **Compliance Officer** | Checks if rules are followed | Reviewer Agent |
| **HR Trainer** | Explains why rules exist | Teaching Agent |
| **Company Handbook** | Stores all policies | Knowledge Store |

The Compliance Officer doesn't write the rules.
They just check: "Is this following the handbook?"

---

## File Locations

| Component | Path |
|-----------|------|
| Learner Agent | `src/agents/learner/index.ts` |
| Reviewer Agent | `src/agents/reviewer/index.ts` |
| Sub-Reviewers | `src/agents/reviewer/sub-reviewers/` |
| Tutor Agent | `src/agents/tutor/index.ts` |
| Feedback Controller | `src/agents/feedback-controller/index.ts` |
| Knowledge Store | `src/knowledge/store.ts` |
| Orchestrator | `src/orchestrator/index.ts` |
| Types | `src/types/index.ts` |
