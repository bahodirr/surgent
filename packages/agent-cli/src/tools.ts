import { type Plugin, tool } from "@opencode-ai/plugin"
import { ApifyClient } from "apify-client"

type SurgentConfig = {
  name?: string
  scripts?: {
    dev?: string | string[]
    lint?: string
  }
}

export const SurgentDeployPlugin: Plugin = async ({ $, directory }) => {
  $.cwd(directory)

  async function readJSONIfExists(path: string) {
    try {
      return await $`cat ${path}`.json()
    } catch {
      return undefined
    }
  }

  async function pm2JList(): Promise<any[]> {
    try {
      return await $`pm2 jlist`.json()
    } catch {
      return []
    }
  }

  async function isPm2Online(name: string): Promise<boolean> {
    const list = await pm2JList()
    const proc = list.find((p: any) => p?.name === name)
    const status = proc?.pm2_env?.status
    return status === "online"
  }

  async function startOrRestartPm2Process(name: string, command: string): Promise<string> {
    const online = await isPm2Online(name)
    if (online) {
      return `already online ${name}`
    }
    await $`${{ raw: `pm2 start "${command}" --name ${name}` }}`
    return `started ${name}`
  }

  function getNameFromSurgent(cfg: SurgentConfig | undefined): string {
    const direct = cfg?.name?.trim()
    if (!direct) throw new Error('Missing "name" in surgent.json')
    return direct
  }

  async function runDev(): Promise<string> {
    const cfg: SurgentConfig = await readJSONIfExists(`${directory}/surgent.json`)
    const dev = cfg?.scripts?.dev
    if (!dev) throw new Error('Missing "scripts.dev" in surgent.json')

    const steps: string[] = []

    const lint = cfg?.scripts?.lint
    if (lint) {
      await $`${{ raw: lint }}`
      steps.push("Ran lint")
    }

    const commands = Array.isArray(dev) ? dev : [dev]
    const configuredName = getNameFromSurgent(cfg)

    for (let i = 0; i < commands.length; i++) {
      const name = commands.length > 1 ? `${configuredName}:${i + 1}` : configuredName
      const action = await startOrRestartPm2Process(name, commands[i])
      steps.push(`PM2 ${action}`)
    }

    steps.push("Done")
    return steps.join("\n")
  }

  return {
    tool: {
      dev: tool({
        description: "Ensures the development server is running. Runs if dev server is not already running.",
        args: {},
        async execute(): Promise<string> {
          try {
            const result = await runDev()
            return result
          } catch (error) {
            const err = error as Error
            return `Failed error message: ${err.message}\n${err.stack?.toString()}`
          }
        },
      }),

      devLogs: tool({
        description: "Show the last N lines of dev server/browser logs to see the errors. Use this tool to debug and analyze the errors. Args: lines (default 20) to specify the number of lines to show.",
        args: { lines: tool.schema.number().optional() },
        async execute(args): Promise<string> {
          try {
            const cfg: SurgentConfig = await readJSONIfExists(`${directory}/surgent.json`)
            const name = getNameFromSurgent(cfg) as string
            const lines = args.lines ?? 20
            const out = await $`pm2 logs ${name} --lines ${lines} --nostream`.text()
            return out
          } catch (error) {
            return `Log fetch failed: ${(error as Error).message} JSON: ${JSON.stringify(error)}`
          }
        },
      }),

      linkedin: tool({
        description: "Fetch a LinkedIn profile via Apify. Args: linkedinUrl (required).",
        args: {
          linkedinUrl: tool.schema.string()
        },
        async execute(args): Promise<string> {
          try {
            const linkedinUrl = (args.linkedinUrl ?? "").trim()
            if (!linkedinUrl) {
              return `Missing linkedinUrl`
            }
            const token = process.env.APIFY_TOKEN
            const client = new ApifyClient({ token })
            const run = await client.actor('2SyF0bVxmgGr8IVCZ').call({
              profileUrls: [linkedinUrl],
            })
            const { items } = await client.dataset(run.defaultDatasetId).listItems()
            const first = items?.[0]
            if (!first) {
              return `No result found`
            }
            return JSON.stringify({ success: true, data: first })
          } catch (error) {
            const err = error as Error
            return `Apify request failed: ${err.message}`
          }
        },
      }),

      downloadToRepo: tool({
        description: "Download a file from a URL and save it to the project. Use for downloading images, assets, or files. targetPath is relative to project root (e.g. 'public/logo.png', 'src/assets/image.jpg'). Do NOT use absolute paths.",
        args: {
          sourceUrl: tool.schema.string(),
          targetPath: tool.schema.string(),
        },
        async execute(args): Promise<string> {
          try {
            const sourceUrl = args.sourceUrl?.trim()
            const targetPath = args.targetPath?.trim()

            if (!sourceUrl) return "Missing sourceUrl"
            if (!targetPath) return "Missing targetPath"

            const fullPath = `${directory}/${targetPath}`
            await $`curl -L --create-dirs -o ${fullPath} ${sourceUrl}`

            return `Downloaded ${sourceUrl} to ${targetPath}`
          } catch (error) {
            const err = error as Error
            return `Download failed: ${err.message}`
          }
        },
      }),
    },
  }
}
