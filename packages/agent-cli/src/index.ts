import { Plugin } from "@opencode-ai/plugin"
import { SurgentDeployPlugin } from "./tools.js"

export const SurgentPlugin: Plugin = async (ctx) => {
  const deployPlugin = await SurgentDeployPlugin(ctx)
  return {
    
    tool: deployPlugin.tool
  }
}
