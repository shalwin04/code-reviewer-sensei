import { config as dotenvConfig } from "dotenv";
import type { AppConfig } from "../types/index.js";

dotenvConfig();

export function loadConfig(): AppConfig {
  return {
    agents: {
      learner: {
        model: process.env.LEARNER_MODEL || "gemini-2.0-flash",
        temperature: 0.3,
        maxTokens: 4096,
      },
      reviewer: {
        model: process.env.REVIEWER_MODEL || "gemini-2.0-flash",
        temperature: 0.2,
        maxTokens: 4096,
      },
      tutor: {
        model: process.env.TUTOR_MODEL || "gemini-2.0-flash",
        temperature: 0.5,
        maxTokens: 4096,
      },
      feedbackController: {
        model: process.env.FEEDBACK_MODEL || "gemini-2.0-flash",
        temperature: 0.3,
        maxTokens: 2048,
      },
    },
    github: {
      token: process.env.GITHUB_TOKEN || "",
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    },
    knowledgeStore: {
      path: process.env.KNOWLEDGE_STORE_PATH || "./data/knowledge",
    },
    supabase: {
      url: process.env.SUPABASE_URL || "",
      anonKey: process.env.SUPABASE_ANON_KEY || "",
      serviceKey: process.env.SUPABASE_SERVICE_KEY || "",
    },
    repository: {
      fullName: process.env.REPOSITORY_FULL_NAME || "",
    },
    server: {
      port: parseInt(process.env.PORT || "3000", 10),
      host: process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost"),
    },
  };
}

export const config = loadConfig();
