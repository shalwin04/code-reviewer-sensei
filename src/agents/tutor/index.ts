// ============================================================================
// Tutor Agent — RAG-Based Senior Developer Mentor
//
// Architecture: Retrieval-Augmented Generation
// - NEVER preloads entire repository
// - NEVER summarizes full repository
// - Retrieves only relevant files and conventions per question
// - Answers strictly from evidence
// - If evidence missing → responds "I cannot find that in the repository"
// ============================================================================

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModelForTask, createLLM } from "../../utils/llm.js";
import { config } from "../../config/index.js";
import { getSupabaseKnowledgeStore } from "../../knowledge/supabase-store.js";
import {
  retrieveContextForQuestion,
  retrieveConventionsForQuestion,
  getRepositoryOverview,
  type RetrievedFile,
  type RetrievedConvention,
} from "../../knowledge/retriever.js";
import type {
  RawViolation,
  ExplainedFeedback,
  TutorState,
  Convention,
} from "../../types/index.js";

// ============================================
// Tutor Agent State
// ============================================

const TutorAgentAnnotation = Annotation.Root({
  violations: Annotation<RawViolation[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  conventions: Annotation<Convention[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  explainedFeedback: Annotation<ExplainedFeedback[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  status: Annotation<TutorState["status"]>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),
});

type TutorAgentState = typeof TutorAgentAnnotation.State;

// ============================================
// Session Management (Lightweight)
// ============================================

interface TutorSession {
  repositoryName: string;
  conversationHistory: Array<{ role: string; content: string }>;
  stats: { totalConventions: number; byCategory: Record<string, number> };
  startedAt: Date;
}

const activeSessions = new Map<string, TutorSession>();

// ============================================
// Load Conventions Node (for explainFeedback)
// ============================================

async function loadConventionsNode(
  state: TutorAgentState
): Promise<Partial<TutorAgentState>> {
  if (state.conventions.length > 0) {
    console.log(`🎓 Tutor: Using ${state.conventions.length} pre-loaded conventions`);
    return {};
  }

  console.log("🎓 Tutor: Loading conventions...");

  if (!config.repository.fullName) {
    console.log("   No repository configured");
    return { conventions: [] };
  }

  try {
    const store = await getSupabaseKnowledgeStore(config.repository.fullName);
    const conventions = await store.getAllConventions();
    console.log(`   Loaded ${conventions.length} conventions`);
    return { conventions };
  } catch (error) {
    console.error(`   Failed to load: ${error}`);
    return { conventions: [] };
  }
}

// ============================================
// Explain Violations Node
// ============================================

async function explainViolationsNode(
  state: TutorAgentState
): Promise<Partial<TutorAgentState>> {
  console.log("🎓 Tutor: Explaining violations...");

  if (state.violations.length === 0) {
    return { explainedFeedback: [], status: "complete" };
  }

  const llm = getModelForTask("tutor", "google");
  const explained: ExplainedFeedback[] = [];

  for (const violation of state.violations) {
    const convention = state.conventions.find(
      (c) => c.id === violation.conventionId
    );

    const goodExample = convention?.examples?.find((e) => e.good)?.good;
    const badExample = convention?.examples?.find((e) => e.bad)?.bad;

    const systemPrompt = `You are a senior developer explaining a code review finding to a junior developer.

Your Role:
- Be a helpful teacher, not a critic
- Explain clearly so they truly understand
- Connect this to real-world consequences
- Help them grow as a developer

Guidelines:
- Write 6-10 sentences for a thorough but focused explanation
- Start with what's wrong and why it matters to THIS team
- Explain the underlying principle (why do we have this rule?)
- Describe what could go wrong if ignored (concrete examples)
- End with encouragement - they're learning!
- Reference the team's specific convention when applicable
- Stay practical, not theoretical`;

    const userPrompt = `File: ${violation.file}:${violation.line}
Issue: ${violation.issue}
${violation.reasoning ? `Why it matters: ${violation.reasoning}` : ""}
${violation.recommendation ? `Suggested fix: ${violation.recommendation}` : ""}
${convention ? `Team convention: "${convention.rule}" - ${convention.description}` : ""}

Please explain this finding in a clear, educational way that helps the junior developer understand not just WHAT to fix, but WHY it matters to our team and codebase.`;

    try {
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      explained.push({
        id: `explain-${violation.id}`,
        violation,
        explanation: response.content?.toString().trim() || violation.issue,
        teamExpectation: goodExample || violation.recommendation || convention?.description || "",
        codeExample: goodExample && badExample ? { before: badExample, after: goodExample } : undefined,
        conventionReference: convention ? { id: convention.id, rule: convention.rule } : undefined,
      });
    } catch (error) {
      console.error(`   Failed: ${violation.id}`, error);
      explained.push({
        id: `explain-${violation.id}`,
        violation,
        explanation: `${violation.issue}. ${violation.reasoning || ""}`,
        teamExpectation: violation.recommendation || "",
      });
    }
  }

  console.log(`   Explained ${explained.length} violations`);
  return { explainedFeedback: explained, status: "complete" };
}

// ============================================
// Build Tutor Graph
// ============================================

export function createTutorGraph() {
  return new StateGraph(TutorAgentAnnotation)
    .addNode("load_conventions", loadConventionsNode)
    .addNode("explain_violations", explainViolationsNode)
    .addEdge(START, "load_conventions")
    .addEdge("load_conventions", "explain_violations")
    .addEdge("explain_violations", END)
    .compile();
}

// ============================================
// Public API: Explain PR Violations
// ============================================

export async function explainFeedback(
  violations: RawViolation[],
  preloadedConventions?: Convention[]
): Promise<TutorState> {
  console.log(`\n🎓 Starting Tutor for ${violations.length} violations`);

  const graph = createTutorGraph();

  const result = await graph.invoke({
    violations,
    conventions: preloadedConventions ?? [],
    explainedFeedback: [],
    status: "pending",
  });

  return {
    violations: result.violations,
    explainedFeedback: result.explainedFeedback,
    status: result.status,
  };
}

// ============================================
// Helper: Format Retrieved Context
// ============================================

function formatRetrievedFiles(files: RetrievedFile[]): string {
  if (files.length === 0) return "No relevant files found.";

  return files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
}

function formatRetrievedConventions(conventions: RetrievedConvention[]): string {
  if (conventions.length === 0) return "No relevant conventions found.";

  return conventions
    .map((c) => {
      const conv = c.convention;
      const example = conv.examples?.[0];
      return `**${conv.rule}** [${conv.category}]
${conv.description}
${example?.good ? `✅ Good: \`${example.good}\`` : ""}
${example?.bad ? `❌ Bad: \`${example.bad}\`` : ""}`;
    })
    .join("\n\n");
}

// ============================================
// Public API: Initialize Tutoring Session
// ============================================

export async function startTutoringSession(repositoryName: string): Promise<{
  success: boolean;
  message: string;
  stats?: { totalConventions: number; byCategory: Record<string, number> };
}> {
  console.log(`\n🎓 Starting tutoring session for: ${repositoryName}`);

  try {
    const store = await getSupabaseKnowledgeStore(repositoryName);
    const conventions = await store.getAllConventions();
    const stats = await store.getStats();

    if (conventions.length === 0) {
      return {
        success: false,
        message: `No conventions found for ${repositoryName}. Please run 'ai-tutor learn --repo ${repositoryName} --from-github' first to analyze the codebase.`,
      };
    }

    // Create lightweight session (NO full repo loading)
    const session: TutorSession = {
      repositoryName,
      conversationHistory: [],
      stats: {
        totalConventions: stats.conventions,
        byCategory: stats.byCategory,
      },
      startedAt: new Date(),
    };

    activeSessions.set(repositoryName, session);

    const welcomeMessage = `
Welcome! I'm ready to help you learn about ${repositoryName}.

📚 **Repository Knowledge:**
- Total conventions: ${stats.conventions}
- Categories: ${Object.entries(stats.byCategory)
      .map(([cat, count]) => `${cat} (${count})`)
      .join(", ")}

I can help you with:
• Understanding team coding standards
• Explaining why certain patterns are used
• Answering questions about conventions
• Clarifying code review feedback

Ask me anything about the codebase!
    `.trim();

    return {
      success: true,
      message: welcomeMessage,
      stats: session.stats,
    };
  } catch (error) {
    console.error("Error starting session:", error);
    return {
      success: false,
      message: `Failed to start session: ${error}`,
    };
  }
}

// ============================================
// Public API: RAG-Based Chat
// ============================================

export async function chat(
  repositoryName: string,
  question: string,
  accessToken?: string
): Promise<string> {
  console.log(`\n💬 Chat: "${question.substring(0, 50)}..."`);

  // Get or create session
  let session = activeSessions.get(repositoryName);

  if (!session) {
    const initResult = await startTutoringSession(repositoryName);
    if (!initResult.success) {
      return initResult.message;
    }
    session = activeSessions.get(repositoryName)!;
  }

  // STEP 1: Retrieve relevant context (RAG) - pass user's token for private repos
  console.log("🔍 Retrieving relevant context...");
  const context = await retrieveContextForQuestion(question, repositoryName, accessToken);

  const hasFiles = context.files.length > 0;
  const hasConventions = context.conventions.length > 0;
  const hasFileTree = !!context.fileTree;

  // Check if we have any useful context
  if (!hasFiles && !hasConventions && !hasFileTree) {
    // For structure questions, try to get the overview
    if (context.questionType === "structure") {
      const overview = await getRepositoryOverview(repositoryName, accessToken);
      if (overview.totalFiles > 0) {
        context.fileTree = overview.fileTree;
        context.files = overview.entryPoints;
      }
    } else {
      console.log("   No repository configured - answering without conventions");
    }

    // Try to get any conventions at all
    if (!context.fileTree && context.conventions.length === 0) {
      const fallbackConventions = await retrieveConventionsForQuestion(
        question,
        repositoryName,
        5
      );

      if (fallbackConventions.length === 0 && !context.fileTree) {
        return `I cannot find information about that in the repository. The question "${question}" doesn't match any files or conventions I have access to.

Try asking about:
- Folder structure or architecture
- Naming conventions
- Code patterns and practices
- Specific files or functions`;
      }

      context.conventions = fallbackConventions;
    }
  }

  // STEP 2: Build grounded prompt with ONLY retrieved context
  const llm = createLLM(config.agents.tutor);

  const filesContext = formatRetrievedFiles(context.files);
  const conventionsContext = formatRetrievedConventions(context.conventions);

  // Build conversation history (last 4 exchanges)
  const conversationContext = session.conversationHistory
    .slice(-8)
    .map((msg) => `${msg.role === "user" ? "Developer" : "Mentor"}: ${msg.content}`)
    .join("\n\n");

  // Build context sections based on question type
  let contextSections = "";

  // For structure questions, include file tree
  if (context.fileTree) {
    contextSections += `## REPOSITORY FOLDER STRUCTURE
\`\`\`
${context.fileTree}
\`\`\`

`;
  }

  if (context.files.length > 0) {
    contextSections += `## KEY FILES (${context.files.length} files)
${filesContext}

`;
  }

  if (context.conventions.length > 0) {
    contextSections += `## TEAM CONVENTIONS (${context.conventions.length} rules)
${conventionsContext}
`;
  }

  const systemPrompt = `You are a senior developer mentoring a teammate about this repository.

## YOUR ROLE
- Answer questions about the codebase, folder structure, conventions, and how things work
- Use ONLY the evidence provided below
- If something is not in the evidence, say "I don't have information about that"
- Be thorough and educational (8-12 sentences for complex questions)

${contextSections}

## GUIDELINES
- For structure questions: Describe the actual folder layout shown above
- For code questions: Reference the specific files provided
- For convention questions: Quote the specific team rules
- Be helpful, encouraging, and supportive`;

  const userPrompt = conversationContext
    ? `## Recent Conversation
${conversationContext}

## Current Question
${question}`
    : question;

  try {
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    let answer = response.content?.toString().trim() || "";

    // Update conversation history
    session.conversationHistory.push(
      { role: "user", content: question },
      { role: "assistant", content: answer }
    );

    // Add context metadata
    const sources: string[] = [];
    if (context.fileTree) {
      sources.push("folder structure");
    }
    if (context.files.length > 0) {
      sources.push(`${context.files.length} files`);
    }
    if (context.conventions.length > 0) {
      sources.push(`${context.conventions.length} conventions`);
    }
    if (sources.length > 0) {
      answer += `\n\n---\n*Based on: ${sources.join(", ")}*`;
    }

    return answer;
  } catch (error) {
    console.error("Error in chat:", error);
    return "I encountered an error processing your question. Please try rephrasing it.";
  }
}

// ============================================
// Public API: Answer Question (uses RAG chat)
// ============================================

export async function answerQuestion(question: string): Promise<string> {
  console.log(`\n❓ Tutor: Answering question: "${question.substring(0, 50)}..."`);

  if (!config.repository.fullName) {
    return "No repository configured. Please specify a repository first.";
  }

  return chat(config.repository.fullName, question);
}

// ============================================
// Session Management
// ============================================

export function endTutoringSession(repositoryName: string): string {
  const session = activeSessions.get(repositoryName);

  if (!session) {
    return "No active session found.";
  }

  const duration = Date.now() - session.startedAt.getTime();
  const minutes = Math.floor(duration / 60000);
  const messageCount = session.conversationHistory.length / 2;

  activeSessions.delete(repositoryName);

  return `
Session ended for ${repositoryName}
- Duration: ${minutes} minutes
- Questions answered: ${messageCount}

Keep learning!
  `.trim();
}

export function getSessionInfo(repositoryName: string): {
  active: boolean;
  stats?: TutorSession["stats"];
  messageCount?: number;
  duration?: number;
} {
  const session = activeSessions.get(repositoryName);

  if (!session) {
    return { active: false };
  }

  return {
    active: true,
    stats: session.stats,
    messageCount: session.conversationHistory.length / 2,
    duration: Date.now() - session.startedAt.getTime(),
  };
}

// ============================================
// Public API: Get All Conventions
// ============================================

export async function getRepoKnowledge(): Promise<{
  conventions: Convention[];
  categories: string[];
  stats: Record<string, number>;
}> {
  if (!config.repository.fullName) {
    return { conventions: [], categories: [], stats: {} };
  }

  try {
    const store = await getSupabaseKnowledgeStore(config.repository.fullName);
    const conventions = await store.getAllConventions();

    const categories = [...new Set(conventions.map((c) => c.category))];
    const stats: Record<string, number> = {};
    for (const c of conventions) {
      stats[c.category] = (stats[c.category] || 0) + 1;
    }

    return { conventions, categories, stats };
  } catch {
    return { conventions: [], categories: [], stats: {} };
  }
}
