# Architecture Deep Dive

This document provides technical details about the AI Code Reviewer's architecture, state management, and data flow.

## Table of Contents

- [Technology Stack](#technology-stack)
- [LangGraph Fundamentals](#langgraph-fundamentals)
- [State Management](#state-management)
- [Agent Deep Dives](#agent-deep-dives)
- [Data Flow](#data-flow)
- [Knowledge Store](#knowledge-store)
- [LLM Integration](#llm-integration)
- [Error Handling](#error-handling)
- [Extension Points](#extension-points)

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js >= 20 | JavaScript runtime |
| Language | TypeScript 5.6 | Type safety |
| Agent Framework | LangGraph | Multi-agent orchestration |
| LLM Provider | Google Gemini | AI model inference |
| Schema Validation | Zod | Runtime type validation |
| GitHub API | Octokit | PR fetching and commenting |
| Web Framework | Express | REST API and webhooks |
| CLI Framework | Commander | Command-line interface |

---

## LangGraph Fundamentals

### What is LangGraph?

LangGraph is a framework for building stateful, multi-agent applications. It models workflows as **graphs** where:

- **Nodes** are functions that transform state
- **Edges** define the flow between nodes
- **State** is passed through the graph and accumulated

### Core Concepts

```typescript
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";

// 1. Define state shape with Annotations
const MyAnnotation = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (current, new) => [...current, ...new],  // How to merge updates
    default: () => [],                                  // Initial value
  }),
  status: Annotation<string>({
    reducer: (_, new) => new,  // Replace old with new
    default: () => "idle",
  }),
});

// 2. Define node functions
async function myNode(state: typeof MyAnnotation.State) {
  // Transform state
  return { messages: ["new message"], status: "complete" };
}

// 3. Build and compile the graph
const graph = new StateGraph(MyAnnotation)
  .addNode("my_node", myNode)
  .addEdge(START, "my_node")
  .addEdge("my_node", END)
  .compile();

// 4. Invoke the graph
const result = await graph.invoke({ messages: [], status: "idle" });
```

### Reducers

Reducers define how state updates are merged:

```typescript
// Replace reducer - new value overwrites old
reducer: (_, newValue) => newValue

// Append reducer - accumulate values
reducer: (current, newValue) => [...current, ...newValue]

// Merge reducer - combine objects
reducer: (current, newValue) => ({ ...current, ...newValue })
```

---

## State Management

### State Hierarchy

The system uses a hierarchical state structure:

```
OrchestratorState (top-level)
├── trigger: { type, payload }
├── prDiff: PRDiffInput | null
├── violations: RawViolation[]
├── explainedFeedback: ExplainedFeedback[]
├── finalOutput: FeedbackControllerState | string | null
├── status: "pending" | "in_progress" | "complete" | "error"
└── errors: string[]
```

Each agent also has its own internal state for its subgraph:

```
ReviewerOrchestratorState
├── prDiff: PRDiffInput
├── conventions: Convention[]
├── violations: RawViolation[]
├── status: "pending" | "reviewing" | "complete"
├── currentFile: string
└── reviewedFiles: string[]
```

### State Types

Defined in `src/types/index.ts`:

```typescript
// Core domain types
interface Convention {
  id: string;
  category: "naming" | "structure" | "pattern" | "testing" | ...;
  rule: string;
  description: string;
  examples: Array<{ good?: string; bad?: string; explanation: string }>;
  source: { type: string; reference: string; timestamp: string };
  confidence: number;
  tags: string[];
}

interface RawViolation {
  id: string;
  type: "naming" | "structure" | "pattern" | "testing";
  file: string;
  line: number;
  code: string;
  issue: string;
  severity: "error" | "warning" | "suggestion";
  conventionId?: string;
}

interface ExplainedFeedback {
  id: string;
  violation: RawViolation;
  explanation: string;
  teamExpectation: string;
  codeExample?: { before: string; after: string; file?: string; line?: number };
  relatedIncident?: string;
  learningResources?: string[];
  conventionReference?: { id: string; rule: string };
}
```

### State Annotations

Defined in `src/agents/graph.ts`:

```typescript
// Each annotation defines:
// 1. The TypeScript type
// 2. How updates are merged (reducer)
// 3. The initial value (default)

const ReviewerAnnotation = Annotation.Root({
  prNumber: Annotation<number>({
    reducer: (_, b) => b,      // Replace
    default: () => 0,
  }),
  violations: Annotation<RawViolation[]>({
    reducer: (a, b) => [...a, ...b],  // Accumulate
    default: () => [],
  }),
  status: Annotation<"pending" | "reviewing" | "complete">({
    reducer: (_, b) => b,      // Replace
    default: () => "pending",
  }),
  reviewedFiles: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],  // Accumulate
    default: () => [],
  }),
});
```

---

## Agent Deep Dives

### Orchestrator (`src/orchestrator/index.ts`)

The top-level coordinator that routes requests to appropriate agents.

```
                    ┌─────────────┐
                    │   START     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Router    │ ◄── Conditional edge based on trigger.type
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │  review_pr  │ │answer_quest.│ │learn_conven.│
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
    ┌──────▼──────┐        │               │
    │explain_viol.│        │               │
    └──────┬──────┘        │               │
           │               │               │
    ┌──────▼──────┐        │               │
    │prepare_feed.│        │               │
    └──────┬──────┘        │               │
           │               │               │
           └───────────────┼───────────────┘
                           │
                    ┌──────▼──────┐
                    │     END     │
                    └─────────────┘
```

**Routing Logic:**

```typescript
function routeTrigger(state: OrchestratorState): string {
  switch (state.trigger.type) {
    case "pr_review":   return "review_pr";
    case "question":    return "answer_question";
    case "learn":       return "learn_conventions";
    default:            return "review_pr";
  }
}
```

### Learner Agent (`src/agents/learner/index.ts`)

Extracts conventions from various sources using LLM analysis.

```
┌─────────────┐
│   START     │
└──────┬──────┘
       │
┌──────▼──────┐
│scan_sources │  ← Set status to "scanning"
└──────┬──────┘
       │
┌──────▼──────────┐
│extract_codebase │  ← Analyze code files with LLM
└──────┬──────────┘
       │
┌──────▼──────────┐
│extract_adrs     │  ← Analyze ADR documents
└──────┬──────────┘
       │
┌──────▼──────────┐
│extract_pr_reviews│ ← Analyze PR review history
└──────┬──────────┘
       │
┌──────▼──────────┐
│extract_incidents│  ← Analyze incident reports
└──────┬──────────┘
       │
┌──────▼──────────┐
│store_conventions│  ← Deduplicate and persist
└──────┬──────────┘
       │
┌──────▼──────┐
│     END     │
└─────────────┘
```

**LLM Prompt Structure:**

```typescript
const CODEBASE_ANALYSIS_PROMPT = PromptTemplate.fromTemplate(`
You are analyzing a team's codebase to extract coding conventions...

Code to analyze:
{code}

{format_instructions}  ← Zod schema for structured output
`);
```

### Reviewer Agent (`src/agents/reviewer/index.ts`)

Orchestrates specialized sub-reviewers to analyze code.

```
┌─────────────┐
│   START     │
└──────┬──────┘
       │
┌──────▼──────────┐
│load_conventions │  ← Load from Knowledge Store
└──────┬──────────┘
       │
┌──────▼──────────┐
│run_sub_reviewers│  ← Parallel execution per file
└──────┬──────────┘
       │         ┌─────────────────────────────────────┐
       │         │  For each file, run in parallel:    │
       │         │  ┌─────────┐ ┌─────────┐            │
       │         │  │ Naming  │ │Structure│            │
       │         │  └─────────┘ └─────────┘            │
       │         │  ┌─────────┐ ┌─────────┐            │
       │         │  │ Pattern │ │ Testing │            │
       │         │  └─────────┘ └─────────┘            │
       │         └─────────────────────────────────────┘
       │
┌──────▼──────────┐
│aggregate_results│  ← Sort by severity, dedupe
└──────┬──────────┘
       │
┌──────▼──────┐
│     END     │
└─────────────┘
```

**Parallel Sub-Reviewer Execution:**

```typescript
for (const file of state.prDiff.files) {
  const [naming, structure, pattern, testing] = await Promise.all([
    reviewNaming(file.diff, file.path, state.conventions),
    reviewStructure(file.diff, file.path, state.conventions),
    reviewPatterns(file.diff, file.path, state.conventions),
    reviewTesting(file.diff, file.path, state.conventions),
  ]);

  allViolations.push(...naming, ...structure, ...pattern, ...testing);
}
```

### Sub-Reviewers (`src/agents/reviewer/sub-reviewers/`)

Each sub-reviewer focuses on a specific category:

| Sub-Reviewer | File | Focus Areas |
|--------------|------|-------------|
| Naming | `naming-reviewer.ts` | Variable names, function names, file names, class names |
| Structure | `structure-reviewer.ts` | File organization, module boundaries, import patterns |
| Pattern | `pattern-reviewer.ts` | Design patterns, idioms, anti-patterns |
| Testing | `testing-reviewer.ts` | Test coverage, test naming, assertion patterns |

**Sub-Reviewer Interface:**

```typescript
export async function reviewNaming(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  // 1. Filter relevant conventions
  const namingConventions = conventions.filter(c => c.category === "naming");

  // 2. Build prompt with conventions context
  const prompt = await NAMING_REVIEW_PROMPT.format({
    diff,
    filePath,
    conventions: formatConventions(namingConventions),
    format_instructions: violationParser.getFormatInstructions(),
  });

  // 3. Get LLM response
  const response = await llm.invoke(prompt);

  // 4. Parse structured output
  return violationParser.parse(response.content);
}
```

### Tutor Agent (`src/agents/tutor/index.ts`)

Transforms raw violations into educational feedback.

```
┌─────────────┐
│   START     │
└──────┬──────┘
       │
┌──────▼──────┐
│load_context │  ← Load conventions for context
└──────┬──────┘
       │
┌──────▼───────────┐
│explain_violations│  ← Generate educational explanations
└──────┬───────────┘
       │
       │  For each violation:
       │  ┌─────────────────────────────────────────┐
       │  │ 1. Find related convention              │
       │  │ 2. Get team context (examples, history) │
       │  │ 3. Generate explanation with LLM        │
       │  │ 4. Include code fix example             │
       │  └─────────────────────────────────────────┘
       │
┌──────▼──────┐
│  finalize   │
└──────┬──────┘
       │
┌──────▼──────┐
│     END     │
└─────────────┘
```

**Explanation Schema:**

```typescript
const ExplanationSchema = z.object({
  explanation: z.object({
    whyItMatters: z.string(),      // Team-specific impact
    whatTeamExpects: z.string(),   // Concrete guidance
    codeExample: z.object({
      before: z.string(),
      after: z.string(),
      file: z.string().optional(),
      line: z.number().optional(),
    }).optional(),
    relatedIncident: z.string().optional(),
    learningResources: z.array(z.string()).optional(),
  }),
});
```

### Feedback Controller (`src/agents/feedback-controller/index.ts`)

Formats and delivers the final review output.

```
┌─────────────┐
│   START     │
└──────┬──────┘
       │
┌──────▼──────┐
│ deduplicate │  ← Remove duplicate feedback
└──────┬──────┘
       │
┌──────▼───────────┐
│ format_comments  │  ← Format each comment with LLM
└──────┬───────────┘
       │
┌──────▼───────────┐
│generate_summary  │  ← Create review summary
└──────┬───────────┘
       │
┌──────▼──────┐
│  finalize   │  ← Set status to complete
└──────┬──────┘
       │
┌──────▼──────┐
│     END     │
└─────────────┘
```

**Output Formatters:**

```typescript
// GitHub format
function formatForGitHub(state: FeedbackControllerState) {
  return {
    summary: state.summary,
    comments: state.formattedComments.map(c => ({
      path: c.file,
      line: c.line,
      body: c.body,
    })),
  };
}

// Console format
function formatForConsole(state: FeedbackControllerState): string {
  let output = "═".repeat(60) + "\n";
  output += `📋 PR #${state.prNumber} Review Summary\n`;
  // ... format for terminal display
  return output;
}
```

---

## Data Flow

### PR Review Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         INPUT                                     │
│  PRDiffInput { prNumber, title, files[], baseBranch, headBranch }│
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                                 │
│  1. Route to review_pr node                                       │
│  2. Call Reviewer agent                                           │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                       REVIEWER                                    │
│  1. Load conventions from Knowledge Store                         │
│  2. For each file:                                                │
│     - Run 4 sub-reviewers in parallel                             │
│     - Collect RawViolation[]                                      │
│  3. Aggregate and sort violations                                 │
│                                                                   │
│  Output: { prNumber, violations[], status, reviewedFiles[] }     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                        TUTOR                                      │
│  1. Load conventions for context                                  │
│  2. For each violation:                                           │
│     - Find related convention                                     │
│     - Get team examples                                           │
│     - Generate educational explanation                            │
│                                                                   │
│  Output: { violations[], explainedFeedback[], status }           │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                   FEEDBACK CONTROLLER                             │
│  1. Deduplicate feedback                                          │
│  2. Format each comment                                           │
│  3. Generate summary                                              │
│                                                                   │
│  Output: { prNumber, formattedComments[], summary, status, ... } │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                         OUTPUT                                    │
│  - GitHub: Post review comments via Octokit                       │
│  - Console: Pretty-print to terminal                              │
│  - IDE: Return structured JSON                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Learning Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         INPUT                                     │
│  sources: { codebase[], adrs[], prReviews[], incidents[] }       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                        LEARNER                                    │
│                                                                   │
│  ┌─────────────┐  LLM   ┌─────────────────────┐                  │
│  │  Codebase   │ ────►  │ Extract conventions │                  │
│  │  (code)     │        │ - naming patterns   │                  │
│  └─────────────┘        │ - structure rules   │                  │
│                         └──────────┬──────────┘                  │
│  ┌─────────────┐  LLM              │                             │
│  │    ADRs     │ ────►  ┌──────────▼──────────┐                  │
│  │  (markdown) │        │ Merge & Deduplicate │                  │
│  └─────────────┘        └──────────┬──────────┘                  │
│                                    │                             │
│  ┌─────────────┐  LLM              │                             │
│  │ PR Reviews  │ ────►             │                             │
│  │  (comments) │                   │                             │
│  └─────────────┘                   │                             │
│                                    │                             │
│  ┌─────────────┐  LLM              │                             │
│  │  Incidents  │ ────►             │                             │
│  │  (reports)  │                   │                             │
│  └─────────────┘                   ▼                             │
│                         ┌─────────────────────┐                  │
│                         │  Convention[]       │                  │
│                         │  with confidence    │                  │
│                         └──────────┬──────────┘                  │
└────────────────────────────────────┼─────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE STORE                               │
│  - Persist to ./data/knowledge/conventions.json                   │
│  - Index for search                                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Knowledge Store

### Design (`src/knowledge/store.ts`)

The Knowledge Store is a simple in-memory store with file persistence:

```typescript
class KnowledgeStore {
  private conventions: Map<string, Convention>;
  private entries: Map<string, KnowledgeEntry>;
  private examples: Map<string, CodeExample[]>;

  // CRUD operations
  addConvention(convention: Convention): void;
  getConvention(id: string): Convention | undefined;
  getAllConventions(): Convention[];
  getConventionsByCategory(category: string): Convention[];

  // Search
  searchConventions(query: string): Convention[];

  // Persistence
  async saveToDisk(): Promise<void>;
  async loadFromDisk(): Promise<void>;
}
```

### Storage Format

```
data/knowledge/
├── conventions.json    # Array of Convention objects
└── entries.json        # Array of KnowledgeEntry objects
```

**conventions.json example:**

```json
[
  {
    "id": "conv-1234567890-abc123def",
    "category": "naming",
    "rule": "Use camelCase for variable names",
    "description": "All variable names should use camelCase to maintain consistency...",
    "examples": [
      {
        "good": "const userName = 'John';",
        "bad": "const user_name = 'John';",
        "explanation": "camelCase is the team standard for variables"
      }
    ],
    "source": {
      "type": "codebase",
      "reference": "codebase-scan",
      "timestamp": "2024-01-15T10:30:00.000Z"
    },
    "confidence": 0.85,
    "tags": ["javascript", "variables", "style"]
  }
]
```

### Singleton Pattern

```typescript
let storeInstance: KnowledgeStore | null = null;

export async function getKnowledgeStore(path: string): Promise<KnowledgeStore> {
  if (!storeInstance) {
    storeInstance = new KnowledgeStore(path);
    await storeInstance.initialize();
  }
  return storeInstance;
}
```

---

## LLM Integration

### Client Factory (`src/utils/llm.ts`)

```typescript
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export function createLLM(config: AgentConfig) {
  return new ChatGoogleGenerativeAI({
    model: config.model,           // e.g., "gemini-2.0-flash"
    temperature: config.temperature,
    maxOutputTokens: config.maxTokens,
  });
}
```

### Structured Output with Zod

```typescript
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";

// Define schema
const ViolationSchema = z.object({
  violations: z.array(z.object({
    type: z.enum(["naming", "structure", "pattern", "testing"]),
    file: z.string(),
    line: z.number(),
    code: z.string(),
    issue: z.string(),
    severity: z.enum(["error", "warning", "suggestion"]),
  })),
});

// Create parser
const parser = StructuredOutputParser.fromZodSchema(ViolationSchema);

// Use in prompt
const prompt = PromptTemplate.fromTemplate(`
Analyze this code...

{format_instructions}
`);

// Get format instructions for prompt
const formattedPrompt = await prompt.format({
  format_instructions: parser.getFormatInstructions(),
});

// Parse response
const result = await parser.parse(llmResponse.content);
```

---

## Error Handling

### Agent-Level Errors

Each agent catches errors and continues processing:

```typescript
for (const violation of state.violations) {
  try {
    // Process violation
    const explained = await explainViolation(violation);
    explainedFeedback.push(explained);
  } catch (error) {
    console.error(`Error explaining violation ${violation.id}:`, error);
    // Fallback to basic explanation
    explainedFeedback.push({
      id: `explained-${violation.id}`,
      violation,
      explanation: violation.issue,
      teamExpectation: "Please review and fix this issue.",
    });
  }
}
```

### Orchestrator-Level Errors

The orchestrator tracks errors in state:

```typescript
async function reviewPRNode(state: OrchestratorState) {
  try {
    const result = await reviewPR(state.prDiff);
    return { violations: result.violations, status: "in_progress" };
  } catch (error) {
    return {
      status: "error",
      errors: [`Review failed: ${error}`],
    };
  }
}
```

---

## Extension Points

### Adding a New Sub-Reviewer

1. **Create the reviewer file:**

```typescript
// src/agents/reviewer/sub-reviewers/security-reviewer.ts

import { PromptTemplate } from "@langchain/core/prompts";
import { createLLM } from "../../../utils/llm.js";
import type { RawViolation, Convention } from "../../../types/index.js";

const SECURITY_REVIEW_PROMPT = PromptTemplate.fromTemplate(`
You are a security-focused code reviewer...

Code to review:
{diff}

File: {filePath}

Security conventions:
{conventions}

{format_instructions}
`);

export async function reviewSecurity(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  const securityConventions = conventions.filter(
    c => c.category === "security"
  );

  // ... implementation
}
```

2. **Export from index:**

```typescript
// src/agents/reviewer/sub-reviewers/index.ts
export { reviewSecurity } from "./security-reviewer.js";
```

3. **Add to parallel execution:**

```typescript
// src/agents/reviewer/index.ts
const [naming, structure, pattern, testing, security] = await Promise.all([
  reviewNaming(file.diff, file.path, state.conventions),
  reviewStructure(file.diff, file.path, state.conventions),
  reviewPatterns(file.diff, file.path, state.conventions),
  reviewTesting(file.diff, file.path, state.conventions),
  reviewSecurity(file.diff, file.path, state.conventions),  // Add this
]);
```

### Adding a New LLM Provider

1. **Update the LLM factory:**

```typescript
// src/utils/llm.ts
import { ChatAnthropic } from "@langchain/anthropic";

export function createLLM(config: AgentConfig) {
  if (config.model.startsWith("claude")) {
    return new ChatAnthropic({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }

  // Default to Gemini
  return new ChatGoogleGenerativeAI({
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxTokens,
  });
}
```

### Adding a New Delivery Target

1. **Update the type:**

```typescript
// src/types/index.ts
interface FeedbackControllerState {
  // ...
  deliveryTarget: "github" | "console" | "ide" | "slack";  // Add "slack"
}
```

2. **Add formatter:**

```typescript
// src/agents/feedback-controller/index.ts
export function formatForSlack(state: FeedbackControllerState) {
  return {
    text: state.summary,
    attachments: state.formattedComments.map(c => ({
      color: c.severity === "error" ? "danger" : "warning",
      title: `${c.file}:${c.line}`,
      text: c.body,
    })),
  };
}
```

---

## Performance Considerations

### Parallel Processing

- Sub-reviewers run in parallel per file
- Multiple files could be processed in parallel (future enhancement)

### LLM Call Optimization

- Batch similar operations when possible
- Use streaming for long responses (future enhancement)
- Cache convention lookups

### Memory Management

- Knowledge Store uses Maps for O(1) lookups
- Large codebases should limit file scanning (currently 50 files, 10KB each)

---

## Testing Strategy

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage
```

### Test Structure

```
tests/
├── agents/
│   ├── learner.test.ts
│   ├── reviewer.test.ts
│   ├── tutor.test.ts
│   └── feedback-controller.test.ts
├── knowledge/
│   └── store.test.ts
├── orchestrator/
│   └── index.test.ts
└── utils/
    └── llm.test.ts
```

### Mocking LLM Calls

```typescript
import { vi } from "vitest";

vi.mock("../utils/llm", () => ({
  createLLM: () => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({ violations: [] }),
    }),
  }),
}));
```
