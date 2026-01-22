import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { createLLM } from "../../utils/llm.js";
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";
import { config } from "../../config/index.js";
import type { Convention, LearnerState } from "../../types/index.js";

// ============================================
// Learner Agent State
// ============================================

const LearnerAgentAnnotation = Annotation.Root({
  sources: Annotation<LearnerState["sources"]>({
    reducer: (_, b) => b,
    default: () => ({ codebase: [], adrs: [], prReviews: [], incidents: [] }),
  }),
  extractedConventions: Annotation<Convention[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  processingStatus: Annotation<LearnerState["processingStatus"]>({
    reducer: (_, b) => b,
    default: () => "idle",
  }),
  currentSource: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

type LearnerAgentState = typeof LearnerAgentAnnotation.State;

// ============================================
// Convention Extraction Schema
// ============================================

const ExtractedConventionSchema = z.object({
  conventions: z.array(
    z.object({
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
      rule: z.string().describe("The convention rule in imperative form"),
      description: z
        .string()
        .describe("Detailed explanation of why this convention exists"),
      examples: z.array(
        z.object({
          good: z.string().optional(),
          bad: z.string().optional(),
          explanation: z.string(),
        })
      ),
      tags: z.array(z.string()),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("How confident are you this is a real convention"),
    })
  ),
});

const conventionParser = StructuredOutputParser.fromZodSchema(
  ExtractedConventionSchema
);

// ============================================
// Prompts
// ============================================

const CODEBASE_ANALYSIS_PROMPT = PromptTemplate.fromTemplate(`
You are analyzing a team's codebase to extract coding conventions and patterns.

Analyze the following code files and extract any conventions you can identify:
- Naming conventions (variables, functions, files, classes)
- Code structure patterns
- Error handling approaches
- Testing patterns
- Common patterns and idioms

Code to analyze:
{code}

{format_instructions}
`);

const ADR_ANALYSIS_PROMPT = PromptTemplate.fromTemplate(`
You are analyzing Architecture Decision Records (ADRs) to extract team conventions.

ADRs often document important decisions that become team standards.
Extract any coding conventions, patterns, or rules that the team has decided to follow.

ADR Content:
{content}

{format_instructions}
`);

const PR_REVIEW_ANALYSIS_PROMPT = PromptTemplate.fromTemplate(`
You are analyzing past PR reviews to learn what the team considers important.

Look for:
- Repeated feedback patterns
- Common corrections
- Style preferences
- Quality expectations

PR Reviews:
{reviews}

{format_instructions}
`);

const INCIDENT_ANALYSIS_PROMPT = PromptTemplate.fromTemplate(`
You are analyzing incident reports to extract lessons learned that became conventions.

Look for:
- Root causes that led to new conventions
- Practices adopted to prevent recurrence
- Patterns that should be avoided

Incident Reports:
{incidents}

{format_instructions}
`);

// ============================================
// Node Functions
// ============================================

async function scanSources(
  state: LearnerAgentState
): Promise<Partial<LearnerAgentState>> {
  console.log("📚 Learner Agent: Scanning sources...");

  const sourceCounts = {
    codebase: state.sources.codebase.length,
    adrs: state.sources.adrs.length,
    prReviews: state.sources.prReviews.length,
    incidents: state.sources.incidents.length,
  };

  console.log(`   Codebase files: ${sourceCounts.codebase}`);
  console.log(`   ADR files: ${sourceCounts.adrs}`);
  console.log(`   PR Reviews: ${sourceCounts.prReviews}`);
  console.log(`   Incident reports: ${sourceCounts.incidents}`);

  return {
    processingStatus: "extracting",
    currentSource: "codebase",
  };
}

async function extractFromCodebase(
  state: LearnerAgentState
): Promise<Partial<LearnerAgentState>> {
  const llm = createLLM(config.agents.learner);
  const conventions: Convention[] = [];

  if (state.sources.codebase.length > 0) {
    console.log("🔍 Learner Agent: Analyzing codebase...");

    // Process in batches to avoid token limits
    const batchSize = 5;
    for (let i = 0; i < state.sources.codebase.length; i += batchSize) {
      const batch = state.sources.codebase.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}...`);

      try {
        const prompt = await CODEBASE_ANALYSIS_PROMPT.format({
          code: batch.join("\n\n---\n\n"),
          format_instructions: conventionParser.getFormatInstructions(),
        });

        const response = await llm.invoke(prompt);
        const parsed = await conventionParser.parse(
          response.content as string
        );

        for (const conv of parsed.conventions) {
          conventions.push({
            id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...conv,
            source: {
              type: "codebase",
              reference: "codebase-analysis",
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        console.error(`   Error processing batch: ${error}`);
      }
    }

    console.log(`   Extracted ${conventions.length} conventions from codebase`);
  }

  return {
    extractedConventions: conventions,
    currentSource: "adrs",
  };
}

async function extractFromADRs(
  state: LearnerAgentState
): Promise<Partial<LearnerAgentState>> {
  const llm = createLLM(config.agents.learner);
  const conventions: Convention[] = [];

  if (state.sources.adrs.length > 0) {
    console.log("📖 Learner Agent: Analyzing ADRs...");

    try {
      const prompt = await ADR_ANALYSIS_PROMPT.format({
        content: state.sources.adrs.join("\n\n---\n\n"),
        format_instructions: conventionParser.getFormatInstructions(),
      });

      const response = await llm.invoke(prompt);
      const parsed = await conventionParser.parse(
        response.content as string
      );

      for (const conv of parsed.conventions) {
        conventions.push({
          id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...conv,
          source: {
            type: "adr",
            reference: "adr-analysis",
            timestamp: new Date().toISOString(),
          },
        });
      }

      console.log(`   Extracted ${conventions.length} conventions from ADRs`);
    } catch (error) {
      console.error(`   Error extracting from ADRs: ${error}`);
    }
  }

  return {
    extractedConventions: conventions,
    currentSource: "pr-reviews",
  };
}

async function extractFromPRReviews(
  state: LearnerAgentState
): Promise<Partial<LearnerAgentState>> {
  const llm = createLLM(config.agents.learner);
  const conventions: Convention[] = [];

  if (state.sources.prReviews.length > 0) {
    console.log("💬 Learner Agent: Analyzing PR reviews...");

    try {
      const prompt = await PR_REVIEW_ANALYSIS_PROMPT.format({
        reviews: state.sources.prReviews.join("\n\n---\n\n"),
        format_instructions: conventionParser.getFormatInstructions(),
      });

      const response = await llm.invoke(prompt);
      const parsed = await conventionParser.parse(
        response.content as string
      );

      for (const conv of parsed.conventions) {
        conventions.push({
          id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...conv,
          source: {
            type: "pr-review",
            reference: "pr-review-analysis",
            timestamp: new Date().toISOString(),
          },
        });
      }

      console.log(`   Extracted ${conventions.length} conventions from PR reviews`);
    } catch (error) {
      console.error("Error extracting from PR reviews:", error);
    }
  }

  return {
    extractedConventions: conventions,
    currentSource: "incidents",
  };
}

async function extractFromIncidents(
  state: LearnerAgentState
): Promise<Partial<LearnerAgentState>> {
  const llm = createLLM(config.agents.learner);
  const conventions: Convention[] = [];

  if (state.sources.incidents.length > 0) {
    console.log("🚨 Learner Agent: Analyzing incident reports...");

    try {
      const prompt = await INCIDENT_ANALYSIS_PROMPT.format({
        incidents: state.sources.incidents.join("\n\n---\n\n"),
        format_instructions: conventionParser.getFormatInstructions(),
      });

      const response = await llm.invoke(prompt);
      const parsed = await conventionParser.parse(
        response.content as string
      );

      for (const conv of parsed.conventions) {
        conventions.push({
          id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...conv,
          source: {
            type: "incident",
            reference: "incident-analysis",
            timestamp: new Date().toISOString(),
          },
        });
      }

      console.log(`   Extracted ${conventions.length} conventions from incidents`);
    } catch (error) {
      console.error("Error extracting from incidents:", error);
    }
  }

  return {
    extractedConventions: conventions,
    currentSource: "storing",
  };
}

async function storeConventions(
  state: LearnerAgentState
): Promise<Partial<LearnerAgentState>> {
  console.log(
    `💾 Learner Agent: Storing ${state.extractedConventions.length} conventions...`
  );

  // Get repository name from config
  const repoFullName = config.repository.fullName;
  if (!repoFullName) {
    throw new Error("Repository full name not configured. Set REPOSITORY_FULL_NAME in .env or pass --repo flag.");
  }

  const store = await getSupabaseKnowledgeStore(repoFullName);

  // Start a learning run to track this session
  const runId = await store.startLearningRun();

  try {
    // Deduplicate and merge similar conventions
    const uniqueConventions = deduplicateConventions(state.extractedConventions);

    // Store conventions in Supabase
    const added = await store.addConventions(uniqueConventions, runId);

    // Complete the learning run with summary
    await store.completeLearningRun(runId, {
      sources: {
        codebase: state.sources.codebase.length,
        adrs: state.sources.adrs.length,
        prReviews: state.sources.prReviews.length,
        incidents: state.sources.incidents.length,
      },
      found: state.extractedConventions.length,
      added,
    });

    console.log(`✅ Stored ${added} conventions in database`);

    return {
      processingStatus: "complete",
      extractedConventions: uniqueConventions,
    };
  } catch (error) {
    // Mark the learning run as failed
    await store.failLearningRun(runId, String(error));
    throw error;
  }
}

function deduplicateConventions(conventions: Convention[]): Convention[] {
  const seen = new Map<string, Convention>();

  for (const conv of conventions) {
    const key = `${conv.category}:${conv.rule.toLowerCase().trim()}`;

    if (seen.has(key)) {
      const existing = seen.get(key)!;
      // Keep the one with higher confidence
      if (conv.confidence > existing.confidence) {
        seen.set(key, conv);
      }
    } else {
      seen.set(key, conv);
    }
  }

  return Array.from(seen.values());
}

// ============================================
// Build Learner Graph
// ============================================

export function createLearnerGraph() {
  const graph = new StateGraph(LearnerAgentAnnotation)
    .addNode("scan_sources", scanSources)
    .addNode("extract_codebase", extractFromCodebase)
    .addNode("extract_adrs", extractFromADRs)
    .addNode("extract_pr_reviews", extractFromPRReviews)
    .addNode("extract_incidents", extractFromIncidents)
    .addNode("store_conventions", storeConventions)
    .addEdge(START, "scan_sources")
    .addEdge("scan_sources", "extract_codebase")
    .addEdge("extract_codebase", "extract_adrs")
    .addEdge("extract_adrs", "extract_pr_reviews")
    .addEdge("extract_pr_reviews", "extract_incidents")
    .addEdge("extract_incidents", "store_conventions")
    .addEdge("store_conventions", END);

  return graph.compile();
}

// ============================================
// Learner Agent Entry Point
// ============================================

export async function runLearner(
  sources: LearnerState["sources"],
  repositoryFullName?: string
) {
  // Set repository name in config if provided
  if (repositoryFullName) {
    config.repository.fullName = repositoryFullName;
  }

  // Validate repository name is set
  if (!config.repository.fullName) {
    throw new Error(
      "Repository full name is required. Pass it as parameter or set REPOSITORY_FULL_NAME in .env"
    );
  }

  console.log(`\n🧠 Starting Learner for repository: ${config.repository.fullName}`);

  const graph = createLearnerGraph();

  const result = await graph.invoke({
    sources,
    extractedConventions: [],
    processingStatus: "idle",
    currentSource: "",
    errors: [],
  });

  return result;
}
