// ============================================================================
// Retrieval Layer — RAG-based context retrieval for Tutor and Reviewer
//
// Provides small, relevant context chunks instead of full repository dumps.
// Grounded retrieval: only returns what's actually in the knowledge store.
// ============================================================================

import { getSupabaseKnowledgeStore } from "./supabase-store.js";
import { fetchRepoCodeFiles } from "../integrations/github.js";
import type { Convention, PRDiffInput } from "../types/index.js";

// ============================================================================
// Types
// ============================================================================

export interface RetrievedFile {
  path: string;
  content: string;
  relevanceScore: number;
}

export interface RetrievedConvention {
  convention: Convention;
  relevanceScore: number;
}

export interface RetrievalResult {
  files: RetrievedFile[];
  conventions: RetrievedConvention[];
  fileTree?: string;
  questionType: QuestionType;
  totalFilesSearched: number;
  totalConventionsSearched: number;
}

export type QuestionType =
  | "structure"      // folder structure, architecture, layout
  | "howto"          // how does X work, how to do Y
  | "specific"       // specific file, function, class
  | "convention"     // naming, patterns, rules
  | "general";       // other questions

// ============================================================================
// Question Type Detection
// ============================================================================

function detectQuestionType(question: string): QuestionType {
  const q = question.toLowerCase();

  // Structure/architecture questions
  if (
    /folder|directory|structure|layout|architect|organiz|overview|codebase|repo\b|project\b/i.test(q) ||
    /how is .*(structured|organized|laid out)/i.test(q) ||
    /what .*(folders|directories|modules)/i.test(q)
  ) {
    return "structure";
  }

  // How-to questions
  if (
    /how (do|does|to|can|should|would)/i.test(q) ||
    /what happens when/i.test(q) ||
    /explain how/i.test(q)
  ) {
    return "howto";
  }

  // Specific file/function questions
  if (
    /\.(ts|js|py|go|java|tsx|jsx)\b/i.test(q) ||
    /function|class|method|file|module|component/i.test(q) ||
    /where is|find|locate/i.test(q)
  ) {
    return "specific";
  }

  // Convention questions
  if (
    /convention|naming|pattern|rule|standard|style|best practice/i.test(q) ||
    /should i|should we|is it ok|is it okay/i.test(q)
  ) {
    return "convention";
  }

  return "general";
}

// ============================================================================
// Keyword Extraction
// ============================================================================

function extractKeywords(text: string): string[] {
  // Remove code syntax, normalize
  const cleaned = text
    .toLowerCase()
    .replace(/[`'"{}()\[\]<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Split into words, filter noise
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
    "from", "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "and", "but", "if", "or",
    "because", "until", "while", "this", "that", "these", "those", "what",
    "which", "who", "whom", "i", "you", "he", "she", "it", "we", "they",
    "me", "him", "her", "us", "them", "my", "your", "his", "its", "our",
    "their", "myself", "yourself", "himself", "herself", "itself",
    "explain", "tell", "show", "describe", "about", "please", "thanks",
  ]);

  const words = cleaned.split(/\s+/).filter(
    (word) => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word)
  );

  // Extract likely code identifiers (camelCase, snake_case, PascalCase)
  const identifiers = text.match(/[a-zA-Z_][a-zA-Z0-9_]*(?:[A-Z][a-z]+)+|[a-z]+_[a-z_]+/g) || [];

  return [...new Set([...words, ...identifiers.map((i) => i.toLowerCase())])];
}

// ============================================================================
// File Tree Builder
// ============================================================================

function buildFileTree(files: Array<{ path: string }>): string {
  // Group files by directory
  const tree: Map<string, string[]> = new Map();

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop() || "";
    const dir = parts.join("/") || ".";

    if (!tree.has(dir)) {
      tree.set(dir, []);
    }
    tree.get(dir)!.push(fileName);
  }

  // Build tree string
  const lines: string[] = [];
  const sortedDirs = [...tree.keys()].sort();

  for (const dir of sortedDirs) {
    lines.push(`📁 ${dir}/`);
    const filesList = tree.get(dir)!.sort();
    for (const file of filesList) {
      lines.push(`   └── ${file}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Scoring Functions
// ============================================================================

function scoreConventionRelevance(
  convention: Convention,
  keywords: string[]
): number {
  let score = 0;
  const ruleLower = convention.rule.toLowerCase();
  const descLower = convention.description.toLowerCase();
  const tagsLower = convention.tags.map((t) => t.toLowerCase());

  for (const keyword of keywords) {
    // Direct match in rule (highest weight)
    if (ruleLower.includes(keyword)) score += 10;

    // Match in description
    if (descLower.includes(keyword)) score += 5;

    // Match in tags
    if (tagsLower.some((tag) => tag.includes(keyword))) score += 8;

    // Match in category
    if (convention.category.toLowerCase().includes(keyword)) score += 6;
  }

  // Boost by confidence
  score *= convention.confidence;

  return score;
}

function scoreFileRelevance(
  filePath: string,
  fileContent: string,
  keywords: string[]
): number {
  let score = 0;
  const pathLower = filePath.toLowerCase();
  const contentLower = fileContent.toLowerCase();

  for (const keyword of keywords) {
    // Match in file path (high weight - user asking about specific area)
    if (pathLower.includes(keyword)) score += 15;

    // Match in content
    const matches = (contentLower.match(new RegExp(keyword, "g")) || []).length;
    score += Math.min(matches * 2, 20); // Cap content matches
  }

  // Boost important files
  if (/index|main|app|server|router|service|controller|api/i.test(filePath)) {
    score *= 1.3;
  }

  return score;
}

// ============================================================================
// Convention Retrieval
// ============================================================================

export async function retrieveConventionsForQuestion(
  question: string,
  repo: string,
  limit: number = 8
): Promise<RetrievedConvention[]> {
  console.log(`🔍 Retrieving conventions for question...`);

  try {
    const store = await getSupabaseKnowledgeStore(repo);
    const allConventions = await store.getAllConventions();

    if (allConventions.length === 0) {
      console.log("   No conventions found in store");
      return [];
    }

    const keywords = extractKeywords(question);
    console.log(`   Keywords: ${keywords.slice(0, 10).join(", ")}`);

    const scored = allConventions
      .map((convention) => ({
        convention,
        relevanceScore: scoreConventionRelevance(convention, keywords),
      }))
      .filter((item) => item.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    console.log(`   Retrieved ${scored.length}/${allConventions.length} conventions`);
    return scored;
  } catch (error) {
    console.error("   Error retrieving conventions:", error);
    return [];
  }
}

export async function retrieveConventionsForDiff(
  diff: PRDiffInput,
  repo: string,
  category?: string
): Promise<RetrievedConvention[]> {
  console.log(`🔍 Retrieving conventions for diff (${diff.files.length} files)...`);

  try {
    const store = await getSupabaseKnowledgeStore(repo);
    let conventions = await store.getAllConventions();

    // Filter by category if specified
    if (category) {
      conventions = conventions.filter((c) => c.category === category);
    }

    if (conventions.length === 0) {
      console.log(`   No ${category || ""} conventions found`);
      return [];
    }

    // Extract keywords from all diffs
    const allDiffText = diff.files.map((f) => `${f.path}\n${f.diff}`).join("\n");
    const keywords = extractKeywords(allDiffText);

    // Also add file-type specific keywords
    const fileExtensions = diff.files
      .map((f) => f.path.split(".").pop()?.toLowerCase())
      .filter(Boolean);
    keywords.push(...fileExtensions as string[]);

    const scored = conventions
      .map((convention) => ({
        convention,
        relevanceScore: scoreConventionRelevance(convention, keywords),
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Return all if category specified (reviewers need all category rules)
    // Otherwise return top matches
    const result = category ? scored : scored.slice(0, 12);

    console.log(`   Retrieved ${result.length}/${conventions.length} conventions`);
    return result;
  } catch (error) {
    console.error("   Error retrieving conventions:", error);
    return [];
  }
}

// ============================================================================
// File Retrieval
// ============================================================================

export async function retrieveFilesForQuestion(
  question: string,
  repo: string,
  limit: number = 5
): Promise<RetrievedFile[]> {
  console.log(`🔍 Retrieving files for question...`);

  try {
    const files = await fetchRepoCodeFiles(repo);

    if (files.length === 0) {
      console.log("   No files fetched from repository");
      return [];
    }

    const keywords = extractKeywords(question);
    console.log(`   Keywords: ${keywords.slice(0, 10).join(", ")}`);

    const scored = files
      .map((file) => ({
        path: file.path,
        content: file.content,
        relevanceScore: scoreFileRelevance(file.path, file.content, keywords),
      }))
      .filter((item) => item.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    // Truncate content to avoid context overflow
    const truncated = scored.map((f) => ({
      ...f,
      content: f.content.substring(0, 2000),
    }));

    console.log(`   Retrieved ${truncated.length}/${files.length} files`);
    return truncated;
  } catch (error) {
    console.error("   Error retrieving files:", error);
    return [];
  }
}

export async function retrieveFilesForDiff(
  diff: PRDiffInput,
  repo: string
): Promise<RetrievedFile[]> {
  console.log(`🔍 Retrieving related files for diff...`);

  try {
    const files = await fetchRepoCodeFiles(repo);

    if (files.length === 0) {
      return [];
    }

    // Get directories and imports from diff files
    const diffPaths = diff.files.map((f) => f.path);
    const diffDirs = diffPaths.map((p) => p.split("/").slice(0, -1).join("/"));

    // Extract import statements from diffs
    const importPattern = /(?:import|require|from)\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    for (const file of diff.files) {
      let match;
      while ((match = importPattern.exec(file.diff)) !== null) {
        imports.push(match[1]);
      }
    }

    const scored = files
      .filter((f) => !diffPaths.includes(f.path)) // Exclude files already in diff
      .map((file) => {
        let score = 0;
        const filePath = file.path;
        const fileDir = filePath.split("/").slice(0, -1).join("/");

        // Same directory as changed files
        if (diffDirs.includes(fileDir)) score += 10;

        // Imported by changed files
        if (imports.some((imp) => filePath.includes(imp))) score += 15;

        // Similar file type
        const ext = filePath.split(".").pop();
        if (diffPaths.some((p) => p.endsWith(`.${ext}`))) score += 3;

        return {
          path: filePath,
          content: file.content.substring(0, 1500),
          relevanceScore: score,
        };
      })
      .filter((item) => item.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    console.log(`   Retrieved ${scored.length} related files`);
    return scored;
  } catch (error) {
    console.error("   Error retrieving files:", error);
    return [];
  }
}

// ============================================================================
// Repository Overview (for structure questions)
// ============================================================================

export async function getRepositoryOverview(repo: string): Promise<{
  fileTree: string;
  entryPoints: RetrievedFile[];
  totalFiles: number;
}> {
  console.log(`🔍 Building repository overview...`);

  try {
    const files = await fetchRepoCodeFiles(repo);

    if (files.length === 0) {
      return { fileTree: "No files found", entryPoints: [], totalFiles: 0 };
    }

    // Build file tree
    const fileTree = buildFileTree(files);

    // Find entry points (index, main, app, server files)
    const entryPoints = files
      .filter((f) => /index|main|app|server|client/i.test(f.path))
      .slice(0, 5)
      .map((f) => ({
        path: f.path,
        content: f.content.substring(0, 1500),
        relevanceScore: 100,
      }));

    console.log(`   Built tree with ${files.length} files, ${entryPoints.length} entry points`);

    return {
      fileTree,
      entryPoints,
      totalFiles: files.length,
    };
  } catch (error) {
    console.error("   Error building overview:", error);
    return { fileTree: "Error building overview", entryPoints: [], totalFiles: 0 };
  }
}

// ============================================================================
// Combined Retrieval (Smart - based on question type)
// ============================================================================

export async function retrieveContextForQuestion(
  question: string,
  repo: string
): Promise<RetrievalResult> {
  const questionType = detectQuestionType(question);
  console.log(`   Question type: ${questionType}`);

  // For structure questions, include file tree
  if (questionType === "structure") {
    const [overview, conventionResults] = await Promise.all([
      getRepositoryOverview(repo),
      retrieveConventionsForQuestion(question, repo, 10),
    ]);

    return {
      files: overview.entryPoints,
      conventions: conventionResults,
      fileTree: overview.fileTree,
      questionType,
      totalFilesSearched: overview.totalFiles,
      totalConventionsSearched: conventionResults.length,
    };
  }

  // For convention questions, prioritize conventions
  if (questionType === "convention") {
    const [files, conventionResults] = await Promise.all([
      retrieveFilesForQuestion(question, repo, 3),
      retrieveConventionsForQuestion(question, repo, 12),
    ]);

    return {
      files,
      conventions: conventionResults,
      questionType,
      totalFilesSearched: files.length,
      totalConventionsSearched: conventionResults.length,
    };
  }

  // For specific/howto questions, prioritize files
  if (questionType === "specific" || questionType === "howto") {
    const [files, conventionResults] = await Promise.all([
      retrieveFilesForQuestion(question, repo, 8),
      retrieveConventionsForQuestion(question, repo, 5),
    ]);

    return {
      files,
      conventions: conventionResults,
      questionType,
      totalFilesSearched: files.length,
      totalConventionsSearched: conventionResults.length,
    };
  }

  // General questions - balanced retrieval
  const [files, conventionResults] = await Promise.all([
    retrieveFilesForQuestion(question, repo, 5),
    retrieveConventionsForQuestion(question, repo, 8),
  ]);

  return {
    files,
    conventions: conventionResults,
    questionType,
    totalFilesSearched: files.length,
    totalConventionsSearched: conventionResults.length,
  };
}

export async function retrieveContextForReview(
  diff: PRDiffInput,
  repo: string,
  category: string
): Promise<Convention[]> {
  const results = await retrieveConventionsForDiff(diff, repo, category);
  return results.map((r) => r.convention);
}
