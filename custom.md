Agents in this repo: how they work, how to create and switch them, and how models/permissions apply

Overview
- Location: core logic in `opencode/packages/opencode` with public SDK in `opencode/packages/sdk/js`, and plugin hook surface in `opencode/packages/plugin`.
- Built‑ins: three agents ship by default (see `opencode/packages/opencode/src/agent/agent.ts:38`):
  - `general` — subagent, research/search helper; default tool set; less privileged.
  - `build` — primary agent; main coding agent with full tools unless configured otherwise.
  - `plan` — primary agent; read‑only planning agent. Guardrails reinforce no edits (see `opencode/packages/opencode/src/session/prompt/plan.txt:1`).
- Agent “mode” in this codebase is a capability/role flag on the agent: `"primary" | "subagent" | "all"`. Primary agents are selectable as the main agent; subagents are invoked via the Task tool.

Agent model and structure
- Runtime shape: `Agent.Info` (validated with Zod) contains:
  - `name`, `description?`, `mode`, `builtIn`, `temperature?`, `topP?`, `prompt?` (system prompt),
  - `model?` (`{ providerID, modelID }`),
  - `tools` (record of tool-id -> enabled/disabled),
  - `permission` (edit/bash/webfetch policies),
  - `options` (extra provider/model options). See `opencode/packages/opencode/src/agent/agent.ts:11`.
- Resolution & merge:
  - Base defaults + built‑ins are assembled at startup, then merged with user config (below) and plugins. See `Agent.state()` in `agent.ts`.
  - Tool enablement further respects permission policies via `ToolRegistry.enabled()`; explicit `tools` overrides then apply. See `opencode/packages/opencode/src/tool/registry.ts:73` and `session/prompt.ts:550` (merge order).

Configuring agents
- Primary way (Markdown): put files under `.opencode/agent/*.md` (project) or in the global config dir’s `agent/*.md`. Frontmatter matches `Config.Agent` (model, tools, permissions, mode, description, temperature, top_p, …) and Markdown body is the system prompt. Loader: `opencode/packages/opencode/src/config/config.ts:210` (AGENT_GLOB) and parser `config/markdown.ts`.
- Alternative (JSON): `opencode.jsonc` → `agent` block (object keyed by agent name). The legacy `mode` block is migrated to `agent` automatically (see `config.ts:48, 86-99, 112-121, 520-566`).
- Permissions merge: global `permission` merges with per‑agent overrides with pattern support for bash (string or map). Merge logic: `mergeAgentPermissions()` in `agent.ts:125`.

Creating a new agent
- CLI (guided): `bun opencode agent create`
  - Prompts for scope (project/global), description, tool selection, and mode (`all | primary | subagent`).
  - Generates a Markdown agent at `<scope>/.opencode/agent/<identifier>.md` with frontmatter and the generated system prompt. See `opencode/packages/opencode/src/cli/cmd/agent.ts` and `src/agent/generate.txt`.
- Manual (Markdown): create `.md` under `agent/` with frontmatter like:
  ```yaml
  ---
  description: Use this when performing X
  mode: primary
  model: provider/model
  tools: { bash: true, read: true, edit: true, write: true }
  permission:
    edit: allow
    bash: { "*": ask, "rg*": allow }
    webfetch: allow
  ---
  <system prompt body>
  ```
- Manual (JSON): in `opencode.jsonc` within `agent.{name}` using the same keys (see SDK schema `AgentConfig` in `opencode/packages/sdk/js/src/gen/types.gen.ts:171`).

Selecting and switching agents
- TUI
  - Open agent list: keybind `agent_list` (default `<leader>a`) → dialog to pick; see `opencode/packages/opencode/src/cli/cmd/tui/app.tsx:196` and `tui/component/dialog-agent.tsx`.
  - Cycle primary agents: `agent_cycle` / `agent_cycle_reverse` (disabled by default in menu but wired to keybinds) updates `local.agent` state; see `tui/context/local.tsx`.
  - Model auto‑sync: when an agent specifies `model`, the TUI updates the current model to match, validating against available providers; see `tui/context/local.tsx:22-66` and `:78-101`.
- CLI
  - Run with a specific agent: `bun opencode run --agent <name> [--model provider/model] "your prompt"` (defaults: explicit `--model` > agent.model > default model).
  - Files can be attached with `--file` and the session can be continued with `--continue` or `--session`.
- SDK / Programmatic
  - Start server: `createOpencodeServer({ config? })` → returns `{ url, close }`. See `opencode/packages/sdk/js/src/server.ts`.
  - TUI programmatic launch: `createOpencodeTui({ project?, model?, agent?, session?, config? })`.
  - HTTP client: `createOpencodeClient(baseUrl)` (from `@opencode-ai/sdk`) exposes:
    - List agents: `client.app.agents()` → `GET /agent`.
    - Send prompt: `client.session.prompt({ path:{id}, body:{ parts, agent?, model?, tools? } })`.
    - Commands, shell, and events as additional endpoints. The generated types include `Agent`, `AgentConfig`, and `SessionPromptData` (`types.gen.ts`).

Agent roles and the Task tool
- Primary vs subagent
  - Selectable “main” agents are those with `mode !== "subagent"`.
  - Subagents are invoked via the `task` tool by the primary agent for specialized work. The tool enumerates non‑primary agents in its description and launches a nested session with the chosen subagent. See `opencode/packages/opencode/src/tool/task.ts`.
- General agent
  - The built‑in `general` agent is a subagent designed for research and multi‑step “find/explore” tasks. It is not selected as the main agent in the TUI by default, but is available to the Task tool.

Model resolution and provider behavior
- Order of precedence for model selection in a prompt: explicit request body (`model`) → current agent’s `model` → `Provider.defaultModel()`. See `session/prompt.ts:481-490`.
- Provider transforms adjust parameters, limits, and options per provider/model. Tokens/out‑of‑band options are consolidated in `ProviderTransform` and merged with agent `options`. See `session/prompt.ts` around params building.
- When an agent sets `temperature`/`top_p`, they override provider defaults if the model supports it.

Permissions and tool gating
- Global `permission` in config and per‑agent overrides control:
  - `edit`: allow/ask/deny file edits and related tools.
  - `bash`: allow/ask/deny with wildcard patterns (e.g. `"rg*": allow`, default `"*"`).
  - `webfetch`: allow/ask/deny web access.
- Tool availability is derived from permissions plus explicit `tools` record for the agent, and cross‑checked when the tool registry builds the active tool set for a conversation.

Agent metadata on messages
- Each assistant message records a `mode` string (e.g., `"build"`/`"plan"`) for audit/tracing in the timeline (`MessageV2.Assistant.mode`). Session compaction uses `mode: "build"` as well. See `message-v2.ts` and `session/compaction.ts`.

How to build and use agents programmatically
- With SDK (Node):
  - Start server and create a client
    ```ts
    import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk"
    const server = await createOpencodeServer({ config: { agent: { build: { tools: { webfetch: false } } } } })
    const client = createOpencodeClient({ baseUrl: server.url })
    ```
  - Pick an agent and send a prompt
    ```ts
    const agents = await client.app.agents()
    const build = agents.data.find(a => a.name === "build")!
    await client.session.prompt({
      path: { id: (await client.session.create()).data.id },
      body: {
        agent: build.name,
        parts: [{ type: "text", text: "Add pagination to users list" }],
      },
    })
    ```
  - Launch TUI with an initial agent/model
    ```ts
    import { createOpencodeTui } from "@opencode-ai/sdk"
    const tui = createOpencodeTui({ agent: "plan", model: "anthropic/claude-3-5-sonnet" })
    ```
- With config files:
  - Add `.opencode/agent/my-agent.md` or extend `opencode.jsonc` → `agent.my-agent`.
  - Restart TUI or re‑load to pick up new agents; they appear in `GET /agent` and selection menus.

Switching “modes” (plan/build/custom)
- Plan vs Build: implemented as distinct agents (`plan`, `build`) with different permissions and prompts.
  - Plan forbids edits and uses a strict reminder prompt; Build allows edits and switching (`build-switch.txt`).
- Custom modes: create an agent with `mode: "primary" | "subagent" | "all"` and a descriptive `description` so it’s discoverable. If `primary` or `all`, it will be user‑selectable as the main agent in the TUI. If `subagent` or `all`, it will be available to the Task tool.

Plugins and extensibility
- Package `@opencode-ai/plugin` provides hooks to influence behavior without forking core:
  - Define tools: export `tool({ description, args, execute })` from `tool/*.ts` or via a plugin package.
  - Hooks: `chat.params` (tune temperature/topP/options), `chat.message`, `permission.ask`, and tool lifecycle hooks.
  - Plugins are discovered from config (`plugin` array) and from `tool/*.{ts,js}` in config directories. See `config.ts` and `tool/registry.ts`.

MCP and Agents
- Global config: MCP servers are configured globally under `mcp` in `opencode.jsonc` (or provided programmatically). There is no per‑agent `mcp` block.
- Tool exposure: each MCP server’s tools are exposed as normal tools with ids in the form `<client>_<tool>` (whitespace/dashes sanitized), see `opencode/packages/opencode/src/mcp/index.ts:229`.
- Per‑agent scoping via tools:
  - Agents can enable/disable tools by id pattern. Use wildcards to scope MCP tools per agent, e.g. disable all tools from a server `search`:
    ```yaml
    ---
    mode: primary
    tools:
      search_*: false
    ---
    ````
  - Or disable a single MCP tool: `tools: { search_find_code: false }`.
- Per‑request override: when calling the API/SDK you can pass `tools` in the prompt body to enable/disable specific tools for that request, regardless of agent defaults.
- Isolation via multiple servers: if you need hard separation, run separate opencode servers with different `mcp` configs and route sessions/agents to the appropriate instance.
- Plugin guardrails: as an extra layer, a plugin can implement `tool.execute.before` to reject execution based on `ctx.agent` and the tool id.

What agent is “general” (built‑in)?
- `general` is the built‑in subagent optimized for research/exploration and multi‑step searches. It is not the default main agent; primary work typically uses `build` or `plan`. It remains available via the Task tool, and can be promoted to a primary by defining a custom agent with `mode: "all"` (or creating a new primary agent tailored to your workflow).

Agent Creation & Best Practices

Create via CLI (guided)
- Run: `bunx opencode agent create`
- Picks scope (project/global), asks for description, lets you choose tools and `mode` (`primary` | `subagent` | `all`).
- Writes `.opencode/agent/<identifier>.md` with frontmatter + system prompt. Code: `opencode/packages/opencode/src/cli/cmd/agent.ts:1`.

Create manually (Markdown)
- Add `.opencode/agent/my-agent.md`:
  ```yaml
  ---
  description: Use this when performing X
  mode: all                    # primary | subagent | all
  model: anthropic/claude-3-5-sonnet
  tools:
    bash: true
    read: true
    write: true
    edit: true
    webfetch: false
  permission:
    edit: allow
    bash: { "*": ask, "rg*": allow }
    webfetch: deny
  ---
  You are …
  ```
- Loader parses frontmatter; body becomes the system prompt. Code: `opencode/packages/opencode/src/config/config.ts:210`, `opencode/packages/opencode/src/config/markdown.ts:18`.

Create via JSON config
- Extend `opencode.jsonc`:
  ```json
  {
    "agent": {
      "my-agent": {
        "description": "…",
        "mode": "all",
        "model": "provider/model",
        "tools": { "webfetch": false },
        "permission": { "edit": "allow", "bash": { "*": "ask" } }
      }
    }
  }
  ```
- Schema: `AgentConfig` (`opencode/packages/sdk/js/src/gen/types.gen.ts:171`).

Create programmatically (SDK)
- Start a server with inline config and use the agent:
  ```ts
  import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk"
  const server = await createOpencodeServer({
    config: { agent: { "my-agent": { mode: "all", tools: { webfetch: false } } } }
  })
  const client = createOpencodeClient({ baseUrl: server.url })
  const s = await client.session.create()
  await client.session.prompt({
    path: { id: s.data.id },
    body: { agent: "my-agent", parts: [{ type: "text", text: "Do X" }] }
  })
  ```

Best practices
- Clear role + mode
  - Use `mode: primary` for your main workflow; `mode: subagent` for specialists; `mode: all` if you want both.
  - Add a crisp `description` so it’s discoverable in UI and Task prompts.
- Opinionated system prompt
  - Focus on what’s unique for this agent (steps, constraints, success checks). Keep it concise.
- Strict permissions
  - Planning/analysis agents: `permission.edit: deny`, conservative `bash`, disable risky tools.
  - Build/execution agents: allow what’s needed; gate bash with patterns (e.g., allow read‑only commands, set `*` to ask).
- Minimal toolset
  - Enable only what’s needed; agent tool map plus permission gating determines final toolset. Code: `opencode/packages/opencode/src/tool/registry.ts:92`.
- Model strategy
  - Cheaper/smaller model for planning; reasoning model for complex edits.
  - TUI auto‑switches to the agent’s configured model when selected. Code: `opencode/packages/opencode/src/cli/cmd/tui/context/local.tsx:22`.
- Subagent composition
  - Keep specialists (search, refactor, rewrite) as subagents and invoke via the Task tool. Code: `opencode/packages/opencode/src/tool/task.ts:12`.
  - If a specialist should also be selectable as main, set `mode: all`.
- Naming
  - Short, descriptive, hyphenated identifiers (e.g., `api-hardener`, `test-writer`).

Custom tools via plugin
- Define a tool in a plugin or `tool/*.ts` under your config directory:
  ```ts
  import { z } from "zod"
  import { tool } from "@opencode-ai/plugin"
  export const find_hotspots = tool({
    description: "Find risky functions",
    args: { path: z.string() },
    async execute({ path }, ctx) {
      // implement and return a string result
      return `Analyzed ${path}`
    }
  })
  ```
- Enable it in your agent’s `tools` map (e.g., `tools: { find_hotspots: true }`).
- Hooks like `chat.params` can tune temperature/topP/options per request.

MCP scoping per agent
- MCP tools are globally registered as `<client>_<tool>`; scope them per agent with `tools` patterns (e.g., `search_*: false`).
- Per‑request, pass `body.tools` in `client.session.prompt` to fine‑tune which tools are active.

Using your agent
- TUI: open agent list (`agent_list` keybind, default `<leader>a`) and select it. Code: `opencode/packages/opencode/src/cli/cmd/tui/app.tsx:196`.
- CLI: `bunx opencode run --agent my-agent "Do X"`.
- SDK: set `body.agent = "my-agent"` in `client.session.prompt(...)`.

Diffs & Summaries
- How diffs are computed
  - On each assistant cycle, the system captures snapshots at step start/finish. A diff is then computed between the earliest step-start and the last step-finish for the scope being summarized.
  - Implementation: `opencode/packages/opencode/src/session/summary.ts:88` (computeDiff), `opencode/packages/opencode/src/snapshot/index.ts:131` (git-backed diff).
  - Under the hood: `git diff --numstat` to collect changed files and counts, then `git show` retrieves full file contents for `before`/`after`.
- Where diffs are exposed
  - Per message: `UserMessage.summary.diffs: FileDiff[]` (the changes resulting from that user prompt + assistant work). SDK type: `opencode/packages/sdk/js/src/gen/types.gen.ts:552`.
  - Per session: `Session.summary.diffs: FileDiff[]` (aggregate of patched files across the session). SDK type: `opencode/packages/sdk/js/src/gen/types.gen.ts:521`.
  - API: `GET /session/{id}/diff?messageID=...` to compute/fetch diffs for a given user message. SDK: `client.session.diff(...)` (`opencode/packages/sdk/js/src/gen/sdk.gen.ts:482`).
- FileDiff shape
  - `{ file: string, before: string, after: string, additions: number, deletions: number }`. Types: `opencode/packages/sdk/js/src/gen/types.gen.ts:508`.
- Practical use
  - Message-level: show a compact summary (“N files changed +X −Y”).
  - Session-level: attach a “Diff” action that opens a modal with the file list and counts; optionally add per-file unified diffs.
  - You already have full `before`/`after`; a unified/side-by-side view can be rendered client-side without extra API calls.
- Notes
  - Session summary filters to files actually patched (based on `patch` parts) before including them. Code: `opencode/packages/opencode/src/session/summary.ts:25`.
  - Plan agents typically won’t generate diffs due to read-only permissions; build and other write-capable agents will.

Practical suggestions
- Keep primary agents minimal and opinionated (e.g., a strict `plan`, a powerful `build`). Put specialized skills into subagents and call them with the Task tool.
- Give each agent a clear `description` so selection UIs and the Task tool description are helpful.
- Set an explicit `model` per agent when you need a specific provider/model pairing (e.g., a cheaper “small” model for `plan`, a reasoning model for `build`).
- Use permissions to prevent foot‑guns (e.g., deny broad `bash` in `plan`, pattern‑allow read‑only commands).
- Manage tools at the agent level: disable risky tools by default and enable only what the agent needs.

Agent Concept vs Modes
- One agent concept: All agents share the same schema and runtime pipeline (system prompt, tools, permissions, model). There are no separate “entity types” for plan/build/general — they differ only by configuration.
- Mode flag (usage role):
  - primary: selectable as the main agent in the TUI.
  - subagent: not shown as the main agent; callable via the Task tool.
  - all: both selectable as main and callable as a subagent.
- Built-ins recap:
  - build — primary; default main coding agent.
  - plan — primary; read‑only planning agent (strict guardrails via prompt/permissions).
  - general — subagent; research/exploration helper, usually invoked via Task.
- Selection logic:
  - Main agent switcher shows agents with mode !== "subagent" (primary and all).
  - Task tool lists agents with mode !== "primary" (subagent and all) for delegation.
- Two meanings of "mode":
  - Agent.Info.mode controls the agent’s usage category (primary/subagent/all).
  - Message.mode is a label on each assistant message indicating which agent answered (e.g., "build", "plan").
- Promote/demote an agent:
  - Markdown frontmatter: set `mode: all` (or `primary`/`subagent`).
  - JSON config: `agent: { my-agent: { mode: "all" } }`.
