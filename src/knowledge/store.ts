import { promises as fs } from "fs";
import path from "path";
import type { Convention, KnowledgeEntry, CodeExample } from "../types/index.js";

export class KnowledgeStore {
  private storePath: string;
  private conventions: Map<string, Convention> = new Map();
  private entries: Map<string, KnowledgeEntry> = new Map();
  private examples: Map<string, CodeExample[]> = new Map();

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.storePath, { recursive: true });
    await this.loadFromDisk();
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const conventionsPath = path.join(this.storePath, "conventions.json");
      const data = await fs.readFile(conventionsPath, "utf-8");
      const conventions: Convention[] = JSON.parse(data);
      conventions.forEach((c) => this.conventions.set(c.id, c));
    } catch {
      // File doesn't exist yet, start fresh
    }

    try {
      const entriesPath = path.join(this.storePath, "entries.json");
      const data = await fs.readFile(entriesPath, "utf-8");
      const entries: KnowledgeEntry[] = JSON.parse(data);
      entries.forEach((e) => this.entries.set(e.id, e));
    } catch {
      // File doesn't exist yet, start fresh
    }
  }

  async saveToDisk(): Promise<void> {
    const conventionsPath = path.join(this.storePath, "conventions.json");
    const entriesPath = path.join(this.storePath, "entries.json");

    await fs.writeFile(
      conventionsPath,
      JSON.stringify(Array.from(this.conventions.values()), null, 2)
    );
    await fs.writeFile(
      entriesPath,
      JSON.stringify(Array.from(this.entries.values()), null, 2)
    );
  }

  // Convention operations
  addConvention(convention: Convention): void {
    this.conventions.set(convention.id, convention);
  }

  getConvention(id: string): Convention | undefined {
    return this.conventions.get(id);
  }

  getAllConventions(): Convention[] {
    return Array.from(this.conventions.values());
  }

  getConventionsByCategory(category: Convention["category"]): Convention[] {
    return this.getAllConventions().filter((c) => c.category === category);
  }

  searchConventions(query: string): Convention[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllConventions().filter(
      (c) =>
        c.rule.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery) ||
        c.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    );
  }

  // Knowledge entry operations
  addEntry(entry: KnowledgeEntry): void {
    this.entries.set(entry.id, entry);
  }

  getEntry(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  getAllEntries(): KnowledgeEntry[] {
    return Array.from(this.entries.values());
  }

  getEntriesByType(type: KnowledgeEntry["type"]): KnowledgeEntry[] {
    return this.getAllEntries().filter((e) => e.type === type);
  }

  // Semantic search (placeholder for embedding-based search)
  async semanticSearch(
    query: string,
    limit: number = 5
  ): Promise<Convention[]> {
    // For now, fall back to keyword search
    // In production, this would use embeddings
    const results = this.searchConventions(query);
    return results.slice(0, limit);
  }

  // Get relevant conventions for a code snippet
  async getRelevantConventions(
    _code: string,
    category?: Convention["category"]
  ): Promise<Convention[]> {
    let conventions = this.getAllConventions();

    if (category) {
      conventions = conventions.filter((c) => c.category === category);
    }

    // Sort by confidence
    return conventions.sort((a, b) => b.confidence - a.confidence);
  }

  // Code example operations
  addExample(category: string, example: CodeExample): void {
    const existing = this.examples.get(category) || [];
    existing.push(example);
    this.examples.set(category, existing);
  }

  getExamplesForCategory(category: string): CodeExample[] {
    return this.examples.get(category) || [];
  }

  getAllExamples(): Map<string, CodeExample[]> {
    return this.examples;
  }

  // Clear all data
  async clear(): Promise<void> {
    this.conventions.clear();
    this.entries.clear();
    this.examples.clear();
    await this.saveToDisk();
  }

  // Get stats
  getStats(): { conventions: number; entries: number; examples: number } {
    let exampleCount = 0;
    this.examples.forEach((exs) => (exampleCount += exs.length));
    return {
      conventions: this.conventions.size,
      entries: this.entries.size,
      examples: exampleCount,
    };
  }
}

// Singleton instance
let storeInstance: KnowledgeStore | null = null;

export async function getKnowledgeStore(
  storePath: string
): Promise<KnowledgeStore> {
  if (!storeInstance) {
    storeInstance = new KnowledgeStore(storePath);
    await storeInstance.initialize();
  }
  return storeInstance;
}
