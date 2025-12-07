import { Plugin } from "@opencode-ai/plugin"
import { SurgentDeployPlugin } from "./tools"

const PROVIDERS = ["anthropic", "openai", "google", "vercel", "xai", "zai-org", "moonshotai"]
const API_KEY_ENV = "SURGENT_API_KEY"
const BASE_URL = "https://ai.surgent.dev"

export const SurgentPlugin: Plugin = async (ctx) => {
  const deployPlugin = await SurgentDeployPlugin(ctx)

  return {
    async config(config) {
      config.provider ??= {}
      for (const id of PROVIDERS) {
        config.provider[id] = {
          ...config.provider[id],
          options: {
            ...config.provider[id]?.options,
            apiKey: `{env:${API_KEY_ENV}}`,
            baseURL: `${BASE_URL}/${id}`,
          },
        }
      }
    },
    tool: deployPlugin.tool
  }
}
