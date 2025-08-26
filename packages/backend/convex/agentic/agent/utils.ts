import { z } from "zod";
import { ModelProvider } from "./types";

export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string; // for custom providers like OpenAI compatible
}

async function createProvider(config: ModelConfig) {
  switch (config.provider) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: config.apiKey });
    }
    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      return openai.responses;
    }
     default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

function getDefaultModel(provider: ModelProvider): string {
  switch (provider) {
    case "anthropic":
      return "claude-3-5-sonnet-20240620";
    case "openai":
      return "gpt-5";
    case "openrouter":
      return "anthropic/claude-3.5-sonnet";
    case "azure":
      return "gpt-4"; // This would typically be the deployment name
    case "gemini":
      return "gemini-1.5-pro";
    case "google":
      return "gemini-1.5-pro";
    case "ollama":
      return "llama3.1";
    case "mistral":
      return "mistral-large-latest";
    case "deepseek":
      return "deepseek-chat";
    case "xai":
      return "grok-beta";
    case "groq":
      return "llama-3.1-70b-versatile";
    case "arceeai":
      return "arcee-lite";
    default:
      return "gpt-4o-mini";
  }
}

export async function generatePRMetadata(
  patch: string,
  modelConfig: ModelConfig,
  prompt: string
) {
  const _prompt = `You are tasked to create title and body for a pull request based on the following task:\n${prompt}\n\npatch:\n\n${patch}`;
  const provider = await createProvider(modelConfig);
  const model = getDefaultModel(modelConfig.provider);

  const { generateObject } = await import("ai");
  const { object } = await generateObject({
    model: provider(model),
    prompt: _prompt,
    schema: z.object({
      title: z.string().describe("Suggested title for the pull request"),
      body: z.string().describe("Suggested body for the pull request"),
      branchName: z
        .string()
        .describe(`Suggested branch name, should be unique and descriptive`),
      commitMessage: z
        .string()
        .describe("Suggested commit message for the pull request"),
    }),
  });

  return object;
}

export async function generateCommitMessage(
  patch: string,
  modelConfig: ModelConfig,
  prompt: string
) {
  const _prompt = `You are tasked to create a commit message based on the following task:\n${prompt}\n\npatch:\n\n${patch}`;
  const provider = await createProvider(modelConfig);
  const model = modelConfig.model || getDefaultModel(modelConfig.provider);

  const { generateObject } = await import("ai");
  const { object } = await generateObject({
    model: provider(model),
    prompt: _prompt,
    schema: z.object({
      commitMessage: z
        .string()
        .describe("Suggested commit message for the changes"),
    }),
  });

  return object;
}
