# Opencode TUI Deep Dive

This document summarizes how the text user interface in `opencode/packages/tui` is wired together, with a focus on the streaming conversation experience, tool-call rendering, and the thinking-to-action flow. File paths below are workspace-relative.

## High-Level Architecture
- **Entry point (`cmd/opencode/main.go`)** bootstraps the Go SDK client, fetches initial project/agent/path info, loads the persisted TUI state, and instantiates the Bubble Tea program.
- **App layer (`internal/app`)** encapsulates long-lived state: project metadata, agents, providers/models, the active session, messages, pending permissions, and command bindings. It also handles persistence (`State` TOML), provider selection heuristics, and outbound API calls (`Session.Prompt`, `Session.Command`, `Session.Shell`, etc.).
- **UI model (`internal/tui/tui.go`)** is the Bubble Tea model. It composes the major components (status bar, chat viewport, editor, completion dialogs, toast manager) and processes every incoming message: keyboard/mouse events, API control requests, and server-sent events (SSE) from `/event/list`.
- **Components (`internal/components/...`)** implement discrete UI elements:
  - `chat` renders the conversation feed, tool cards, and editor.
  - `status` draws the bottom status bar and watches git state.
  - `dialog` hosts overlays such as the timeline, model switcher, and completion pickers.
  - `toast` shows ephemeral notifications triggered throughout the app.
- **Supporting utilities** include layout primitives, theming, clipboard helpers, completion providers, command registry, and a thin control-plane API client (`internal/api/api.go`).

## Startup Sequence
1. `main.go` detects piped stdin, merges it into the initial prompt, and registers a custom SSE decoder to get around the `bufio.Scanner` limits.
2. It fetches project, agent, and path metadata in parallel before constructing the `app.App` with `app.New`. During initialization:
   - Config and state are pulled via the SDK and `LoadState(path.State/tui)`.
   - Themes are loaded, command bindings are assembled (built-ins + user-defined), and per-agent model preferences are reconciled.
   - The app records initial prompt/agent/session overrides supplied via CLI flags.
3. `app.New` returns an `App` that knows how to load providers/models, hydrate sessions, and persist UI toggles (`State.ShowToolDetails`, `State.ShowThinkingBlocks`, etc.).
4. `tui.NewModel(app)` wires components, including completion providers (`/` for commands, `@` for context attachments) and the toast manager.
5. Bubble Tea `Program` is started with alt screen + mouse tracking. Concurrent goroutines stream SSE events, poll the `/tui/control/next` endpoint for IDE-driven commands, and initialize the clipboard integration.

## Streaming Pipeline & Update Loop
- **SSE ingestion**: `main.go` calls `httpClient.Event.ListStreaming`, which returns an iterator backed by the Stainless SDK. Before looping, the CLI registers `decoders.NewUnboundedDecoder` for `text/event-stream`, replacing the default scanner with a buffered reader so arbitrarily large events are accepted.
  - Each call to `stream.Next()` reads from the decoder, yielding an SSE frame with `event` + `data`. `Program.Send(evt)` pushes the decoded union payload onto Bubble Tea’s message bus.
- **Model dispatch**: Inside `tui.Model.Update`, a type switch handles the streaming payloads:
  - `EventMessageUpdated` ensures an `opencode.AssistantMessage`/`UserMessage` shell exists in `App.Messages`, inserting by lexicographic message ID if the assistant replies arrive before the local placeholder.
  - `EventMessagePartUpdated` finds the target message and either replaces a matching part (by ID) or appends it when streaming delivers new content chunks. Text, reasoning, tool, file, and step parts all land here. Pending parts (no end timestamp) keep streaming updates until completion toggles `Time.End`.
  - `EventMessagePartRemoved` and `EventMessageRemoved` prune pieces when the backend retracts output (e.g., after a revert).
  - `EventPermissionUpdated` queues permission prompts and blurs the editor until the user answers; `EventPermissionReplied` removes the resolved prompt.
  - `EventSessionUpdated`, `EventSessionDeleted`, `EventSessionCompacted`, and `EventSessionError` keep high-level session metadata and toasts current.
- **Control-plane messages**: `internal/api.Start` continually `GET`s `/tui/control/next`. The returned `api.Request` is also injected via `Program.Send`, letting IDE clients append or submit prompts, open dialogs, or show toasts without touching the terminal directly. Replies go back through `/tui/control/response`.
- **Input events**: Keyboard/mouse events traverse a priority ladder—modal focus, permission hotkeys, leader sequences, completion dialogs, bash mode, command lookup, and finally the editor. Command bindings can be triggered either by keys or textual `/command` submissions parsed inside the editor.
- **Render cadence**: Once `App.Messages` mutates, `chat.messagesComponent` notices the update during the next `Update` call. It guards rendering with `rendering/dirty` flags and schedules a `renderView` command. If the assistant is still working (`App.HasAnimatingWork()` true), a periodic `shimmerTickMsg` keeps the viewport animating while the new SSE chunks arrive.

### Message Part Lifecycle & Display Order
1. **Prompt submission**: `App.SendPrompt` creates a synthetic `UserMessage` locally with a deterministic ascending message ID and enqueues the API call. This guarantees the prompt appears immediately at the bottom of the chat.
2. **Assistant shell**: The streaming API usually emits an `EventMessageUpdated` for the assistant reply before any parts arrive. If the UI has not seen this ID yet, it inserts a blank assistant message at the correct sorted position (IDs are monotonic timestamps, so string compare keeps chronological order).
3. **Streaming parts**:
   - `TextPart` chunks arrive repeatedly; the handler replaces the existing part in-place, so `renderText` always receives the latest partial response.
   - `ReasoningPart` blocks stream independently. While `Time.End == 0`, the last block gets shimmer styling. When `showThinkingBlocks` is off, they are ignored.
   - `ToolPart` updates emit on separate events: first a pending card (no output yet), later the completed/error payload with `State.Input`, `State.Output`, and any metadata. Each update replaces the prior part instance by ID, so the viewport never duplicates the same call.
   - `FilePart`, `AgentPart`, and step parts follow the same ID-based replacement, keeping attachments aligned with their parent text.
4. **Rendering order**: `messagesComponent.renderView` walks `App.Messages` in chronological order and builds “blocks”:
   - User text → attachment badges → inline/queued badges.
   - Assistant text → inline tool summaries (if detail view hidden) → reasoning blocks → tool detail cards.
   - Orphaned tool calls (tool events that arrive before an assistant text chunk) are held temporarily and attached to the next assistant message so the UI still reads top-to-bottom.
5. **Caching & diffs**: `PartCache.GenerateKey` uses message ID, part content, width, toggle state, and permission ID. If the SSE stream updates the same part ID with identical content (common with keep-alive chunks), the cached render is reused, preventing flicker.
6. **Viewport sync**: Submitting a prompt or command triggers `tail = true`, scrolling to the latest output. Manual navigation clears `tail`. When tool cards or reasoning blocks change height mid-stream, `renderView` recomputes `messagePositions` so the timeline dialog can still jump precisely to any user message.

### Streaming Event Sequence (One Assistant Turn)
The UI’s chronological layout directly mirrors the order that SSE events arrive from the backend. The key handlers sit in `opencode/packages/tui/internal/tui/tui.go:486`–`635` and maintain the `App.Messages` slice in-place.

1. **Assistant shell** – `EventMessageUpdated` (lines `580`–`635`) either refreshes the metadata for an existing assistant message or inserts a new one at the lexicographically correct spot. The empty `Parts` array acts as the anchor for subsequent streaming parts.
2. **Thinking starts** – A `ReasoningPart` arrives via `EventMessagePartUpdated` (line `486`). Because no prior part with the same ID exists, the handler appends it to `message.Parts` (line `521`). In the viewport, `renderView` notices the reasoning block and, if enabled, renders it with shimmer (`messages.go:623`–`647`).
3. **Tool plan** – Optional `StepStartPart` / `StepFinishPart` payloads share the same update path (lines `510`–`513`). They are stored in `message.Parts` but not currently rendered, preserving order for future UX work.
4. **Tool call pending** – When the assistant invokes a tool, the backend streams a `ToolPart` with `state.status = "pending"`. The update handler appends it (line `521`); `renderView` records pending tool cards but defers visual output until details arrive (`messages.go:573`–`616`, `message.go:809`–`820`).
5. **Tool output** – The same `ToolPart` ID is re-used once the tool completes. `EventMessagePartUpdated` finds the existing part (line `500`) and replaces it in-place (line `518`), preserving chronology. `renderToolDetails` converts the metadata into the rich card shown under the current text chunk (`message.go:456`–`722`).
6. **Thinking resumes** – Additional `ReasoningPart` updates interleave with tool output. Because each arrives in order, the renderer can display the narrative “thinking → tool → thinking” without any reordering logic.
7. **Final answer** – Streaming `TextPart` updates continually replace the last text part (`message.go:365`–`571`). The final chunk carries a `Time.End` timestamp, signaling completion. Once `EventMessageUpdated` later marks the assistant message as completed, the viewport stops shimmering and cached keys include the finished tool list (`messages.go:529`–`566`).
8. **Cleanup/error handling** – If the model aborts or the user reverts, `EventMessagePartRemoved` (lines `526`–`560`) and `EventMessageRemoved` (lines `564`–`578`) prune parts/messages. Replaced content reflows the viewport because the same chronological walk runs on the next render pass.

Because unknown parts are appended and known parts are replaced (never re-ordered), the on-screen flow exactly matches the server’s emission order. Implementing the same logic in a web UI only requires mirroring these rules: apply parts in arrival order keyed by `part.id`, track replacements by ID, and group contiguous tool parts with the nearest preceding assistant text block before rendering.

## App State Highlights
- `App.Messages` holds the conversation as `[]app.Message`, where each message wraps either `opencode.UserMessage` or `opencode.AssistantMessage` plus the streaming `Part` unions.
- `App.Permissions` queues `opencode.Permission` objects. `CurrentPermission` gates input until the user accepts (`enter`), accepts-always (`a`), or rejects (`esc`). Responses go through `Client.Session.Permissions.Respond`.
- `App.State` persists theme choice, per-agent model selection, recently used models, message history (for editor recall), and visibility toggles (tool details, thinking blocks). State is saved on each toggle via `SaveState`.
- `App.InitializeProvider()` selects the initial model in priority order: CLI override → agent default → config default → most recently used → provider default.
- `App.SendPrompt/SendCommand/SendShell` lazily create a session if needed, append a synthetic `UserMessage` locally, then issue the API call. The actual assistant response arrives via SSE.
- `App.IsBashMode` flips when the user types `!` on an empty editor line, routing `enter` to `SendShell`.

## Conversation Rendering Pipeline
- The chat viewport is rendered by `internal/components/chat/messages.go`. For each render pass it:
  1. Builds header metadata (session title, token usage, cost, share state) using the active model limits.
  2. Traverses `App.Messages` in chronological order, tracking revert state and collecting `blocks` (stringified UI fragments). `messagePositions` maps message IDs to viewport offsets for timeline navigation.
  3. Uses a `PartCache` to memoize rendered text/tool sections keyed by message ID, content, width, and toggle state to avoid recomputing Markdown/diff formatting.
  4. Groups consecutive `ToolPart`s with the preceding assistant `TextPart`, while keeping a list of orphaned tool calls (tool executions that arrived before their associated assistant text).
  5. Calculates shimmer IDs so only the most recent unfinished reasoning block animates.
- **User messages**: `renderText` highlights inline attachments from `FilePart`s and `AgentPart`s, shows queued status when the assistant has not started responding, and renders attachment badges (filename + type icon) above the content.
- **Assistant text**: When `showToolDetails` is disabled, tool calls are summarized inline as prefixed list items (`∟ <tool title>`). When enabled, full tool cards are rendered separately via `renderToolDetails`.
- **Viewport behavior**: When new outgoing prompts or commands are sent, the viewport auto-scrolls to the bottom (`tail = true`). Manual navigation (page up/down, timeline jump) clears `tail` to preserve position.

## Thinking Blocks
- `ReasoningPart`s stream separately from assistant text. When `showThinkingBlocks` is enabled (`<leader>b` or command trigger `thinking`), each reasoning chunk is rendered as a block with a muted background.
- The latest unfinished reasoning block (detected via `part.Time.End == 0`) shimmers using `util.Shimmer`, refreshed by the periodic tick while the assistant is still processing.
- Thinking blocks are hidden by default but the preference persists in state.

## Tool Call Handling
- Tool executions arrive as `ToolPart`s with `State.Status` (`pending`, `completed`, `error`) plus `State.Input`, `State.Output`, and optional `Metadata`. The rendering strategy lives in `chat/message.go`.
- **Pending state**: While `Status == pending`, `renderToolTitle` returns an animated message (“Preparing edit…”, “Fetching from the web…”, etc.) derived from the tool name. No body content is shown until completion.
- **Completed/Error**: `renderToolDetails` inspects `State.Input`/`Metadata` and formats a tool-specific card:
  - `read`: renders a truncated file preview using `util.RenderFile`.
  - `edit`: shows a formatted diff (`diff.FormatDiff` / `FormatUnifiedDiff`) and optional diagnostics (LSP errors from metadata). Errors and warnings are appended beneath.
  - `write`: displays the new file content and any diagnostics.
  - `bash`: emits a console-style code block with the command and captured stdout/stderr from metadata.
  - `webfetch`: truncates fetched content and, for HTML/Markdown formats, pipes it through the Markdown renderer.
  - `todowrite`: lists todos with checkbox/status styling and converts to Markdown.
  - `task`: enumerates delegated tool calls (child sessions) and surfaces navigation hints for cycling through them.
  - `invalid`: falls back to the original tool name extracted from `State.Input`.
  - Any other tool: prints the serialized output truncated to 10 lines.
- **Permissions**: If a `Permission` (e.g., filesystem or shell access) is active for the same `CallID`, `renderToolDetails` overlays a warning panel with accept/reject instructions and merges permission metadata into the tool’s metadata before rendering.
- **Errors**: `State.Error` text is highlighted in red and appended to the card. When `showToolDetails` is off, errored tools still appear inline next to assistant text with red styling.
- **Orphaned calls**: Tool calls that arrive without a preceding assistant text block (often progress updates) are buffered and attached to the next assistant message so the execution history remains chronological.
- **After-effects**: Completed tool calls contribute to revert stats. When a session is reverted, counts of reverted messages/tool calls are surfaced in a dedicated banner with key hints for `/redo`.

## Permissions and Child Sessions
- Permissions can originate in the current session or a spawned child session (`task` tool). If the active permission references a different session, the renderer fetches the relevant message via `Client.Session.Message` to display the card.
- Child sessions are tracked in `Session.Revert`. Commands `session_child_cycle` (`ctrl+right`) and `session_child_cycle_reverse` traverse child sessions, and the timeline dialog highlights whether the view is currently reverted.

## Input, Commands, and Completions
- The editor (`chat/editor.go`) is a customized textarea:
  - Supports multi-line input, OS clipboard integration (OSC52 + native clipboards), attachment insertion (`@path`, drag/paste), and history navigation (`ctrl+p`/`ctrl+n`).
  - `!` toggles bash mode; `enter` submits to `SendShell`, while `esc`/`ctrl+c` exits bash mode without sending.
  - Message history is persisted (last 50 prompts) and restored through undo/redo flows when the server reverts a message.
- Slash commands: typing `/` on an empty prompt opens a completion dialog backed by `internal/completions` providers for commands. Typing `@` opens context attachments (agents, files, symbols).
- Commands originate from `app.Commands` (default + custom). Leader key sequences (`ctrl+x` by default) prime the next keypress. Textual triggers (`/redo`, `/thinking`) route through the same command execution path.
- Input clear (`ctrl+c`), paste (`ctrl+v`/`super+v`), newline (`shift+enter`), and other bindings are handled before the editor to keep interactions snappy.

## Status Bar, Toasts, and Feedback
- The status component shows the OpenCode logo/version, current working directory + git branch (auto-updated via filesystem watch), and the active agent badge (color-coded based on agent index). It also surfaces the default keybinding for cycling agents.
- Toasts (success/info/warning/error) are orchestrated by `toast.ToastManager` and can be triggered by internal events or `/tui/show-toast` control messages. Toasts fade automatically but can also be queued from command handlers.

## Control Channel (`/tui/control`)
- The background poller accepts instructions from external surfaces:
  - `/tui/open-...` commands push dialogs (help, sessions, timeline, themes, models).
  - `/tui/append-prompt`, `/tui/clear-prompt`, `/tui/submit-prompt` manipulate the editor queue remotely.
  - `/tui/execute-command` executes a named command by string lookup in the registry.
  - `/tui/show-toast` displays a toast with optional title/variant.
- Each request is acknowledged via `api.Reply`, allowing the caller to await completion if needed.

## Persistence and Config Integration
- Theme selection honors config defaults, state overrides, and `OPENCODE_THEME`. System themes (light/dark) are auto-updated when the terminal reports background color.
- The state file (`path.State/tui`) persists toggles and recently used entities. Model usage/orders are updated whenever the provider/model changes; the app enforces bounds (max 50 stored models, max 20 stored agents).
- Editor message history is stored in state, enabling restore-after-revert or manual recall.

## Animation & Performance Considerations
- Rendering is width-aware. Resizing the window clears caches so messages are re-rendered at the new width.
- `PartCache` prevents expensive Markdown/diff generation when content has not changed.
- `util.Measure` instrumentation is peppered through render paths (e.g., `messages.renderView`, `chat.renderToolDetails`) to help trace performance during profiling.
- `App.HasAnimatingWork` checks for unfinished assistant messages or pending tool calls. When true, `messagesComponent` schedules `shimmerTickMsg` updates at ~90 ms intervals to keep shimmer/ellipsis animations smooth.

## Useful Toggles & Shortcuts
- `<leader>d` — toggle tool detail cards (summary mode still lists tool titles inline).
- `<leader>b` — toggle thinking blocks.
- `/thinking` or `/details` — textual triggers for the same toggles.
- `tab` / `shift+tab` — cycle agents.
- `ctrl+right` / `ctrl+left` — cycle child sessions spawned by `task` tool calls.
- `<leader>r` / `<leader>u` — redo/undo using server-side revert/unrevert APIs.

Understanding these moving parts should make it easier to navigate the TUI codebase, extend tool rendering, or integrate new control-surface behaviors while preserving the streaming, step-by-step experience (reasoning → tool execution → result synthesis) that the interface is designed to showcase.
