import { Plugin } from "@opencode-ai/plugin"
import { SurgentDeployPlugin } from "./tools.js"

const PROVIDERS = ["anthropic", "openai", "google", "vercel", "xai", "zai-org", "moonshotai"]

export const SurgentPlugin: Plugin = async (ctx) => {
  const deployPlugin = await SurgentDeployPlugin(ctx)

  return {
    async config(config) {
      const baseUrl = process.env.SURGENT_AI_BASE_URL
      const apiKey = process.env.SURGENT_API_KEY

      console.log("[SurgentPlugin] config hook called", { baseUrl, apiKey: apiKey ? "***" : undefined })

      if (!baseUrl || !apiKey) {
        console.log("[SurgentPlugin] Missing env vars, skipping provider config")
        return
      }

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
      console.log("[SurgentPlugin] Configured providers:", PROVIDERS)
    },
    tool: deployPlugin.tool
  }
}
