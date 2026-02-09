import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentConfig } from "../types/index.js";

export type ModelProvider = "google" | "anthropic";

export function createLLM(
  config: AgentConfig,
  provider: ModelProvider = "google"
): BaseChatModel {
  if (provider === "anthropic") {
    return new ChatAnthropic({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }

  // Default to Google Gemini
  return new ChatGoogleGenerativeAI({
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxTokens,
  });
}

export function getModelForTask(
  task: "learner" | "reviewer" | "tutor" | "feedbackController",
  provider: ModelProvider = "google"
): BaseChatModel {
  const configs: Record<string, AgentConfig> = {
    learner: { model: "gemini-2.0-flash", temperature: 0.3, maxTokens: 4096 },
    reviewer: { model: "gemini-2.0-flash", temperature: 0.2, maxTokens: 4096 },
    tutor: { model: "gemini-2.0-flash", temperature: 0.5, maxTokens: 4096 },
    feedbackController: {
      model: "gemini-2.0-flash",
      temperature: 0.3,
      maxTokens: 2048,
    },
  };

  return createLLM(configs[task], provider);
}
