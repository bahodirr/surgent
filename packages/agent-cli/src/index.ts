import { Plugin } from "@opencode-ai/plugin"
import { SurgentDeployPlugin } from "./tools"

const PROVIDERS = ["anthropic", "openai", "google", "vercel", "xai", "zai-org", "moonshotai"]

export const SurgentPlugin: Plugin = async (ctx) => {
  const deployPlugin = await SurgentDeployPlugin(ctx)
  const baseUrl = process.env.SURGENT_AI_BASE_URL
  const apiKey = process.env.SURGENT_API_KEY

  return {
    async config(config) {
      config.provider ??= {}
      for (const id of PROVIDERS) {
        config.provider[id] = {
          ...config.provider[id],
          options: {
            ...config.provider[id]?.options,
            apiKey,
            baseURL: `${baseUrl}/${id}`,
          },
        }
      }
    },
    tool: deployPlugin.tool
  }
}
