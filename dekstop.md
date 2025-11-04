## Desktop (SolidJS) architecture, state, streaming, and UI patterns

### Overview
- SolidJS desktop app structured under `opencode/packages/desktop/src`.
- Key layers:
  - SDK client + SSE subscription (streams events from server)
  - Sync store (normalized, sorted data model for sessions/messages/parts)
  - Local store (derived UI state: current agent/model, active session/message, files/context)
  - Pages/UI components (chat layout, progress rail, details, prompt input, code/diff panels)

### Streaming: SDK + event bus
- `SDKProvider` creates an OpenCode client and subscribes to `/event` SSE.
- Events are re-emitted via a typed global emitter for consumers.
- Pseudocode:
```ts
const sdk = createOpencodeClient({ baseUrl: url, signal: abort.signal, fetch });
const emitter = createGlobalEmitter<{ [k in Event["type"]]: Extract<Event, { type: k }> }>();
sdk.event.subscribe().then(async (events) => {
  for await (const event of events.stream) emitter.emit(event.type, event);
});
```

### Normalized store: Sync (sessions/messages/parts)
- `SyncProvider` consumes SDK events and maintains a normalized, sorted cache:
  - `session: Session[]` sorted by ascending id
  - `message: Record<sessionID, Message[]>` sorted by ascending id
  - `part: Record<messageID, Part[]>` sorted by ascending id
- Binary search + splice used for fast upsert without re-sorting.
- Tool parts are sanitized on completion/error (strip absolute paths from metadata/input/error using `sanitize`).
- Initial `load` fetches providers, agents, project, path, sessions, changes, node tree.
- `session.sync(sessionID)` refetches a session + messages + parts and populates normalized structures. Includes a retry if a new session has 0 messages.

Key update logic (concept):
```ts
on event "session.updated": upsert into session[] (binary search by id)
on event "message.updated": upsert into message[sessionID][]
on event "message.part.updated": upsert into part[messageID][] (sanitize tool parts)
```

### Derived UI state: Local
- Provides view-level state and helpers:
  - Agent selection (list excludes subagents; persists current agent; model syncs when agent changes)
  - Model selection (providers/models from Sync; recent models persisted in localStorage; fallback order: config -> recent -> first available)
  - File tree and opened tabs (open/init/list/read, diff views, selection, folding, pinned tabs)
  - Session view helpers:
    - `messages()`, `userMessages()`
    - `messagesWithValidParts()` filters out noisy parts
    - `getMessageText(message)` joins non-synthetic text parts
    - `active`, `activeMessage`, `last`, `lastUserMessage`, `tokens`, `context%`
- Noisy parts filtered (kept out of the main message feed):
  - Excluded types: `step-start`, `step-finish`, `file`, `patch`
  - Excluded tools: `todoread`, `todowrite`, `list`, `grep`
  - `text`: must be non-synthetic and non-empty
  - `reasoning`: allowed if non-empty (used for status/teasers; not exposed verbatim in final UI text)

### Chat layout (clean main view + details on demand)
- Page layout (high-level):
  - Left: sessions list (titles, time ago, files changed), project info
  - Center: chat area with sticky title (streaming typewriter until titled)
  - Bottom: prompt input (contenteditable; supports `@file` insertion and model/agent pickers)
  - Optional panels: code/diff views

Main chat flow:
1) While working (no `summary.body` yet): show a compact progress rail (`MessageProgress`) and the latest text/reasoning snippet.
2) When completed (has `summary.body`): show Summary (or Response) markdown and diffs; if there were tool steps, expose a collapsible “Show details” section listing assistant messages/parts.

### MessageProgress (streaming rail)
- Purpose: minimal, non-noisy indication of what the agent is doing while streaming.
- Inputs: assistant messages for the active user message.
- Behavior:
  - Build `parts` = flatMap of parts from assistant messages.
  - If there’s a running `task` tool with `metadata.sessionId`, follow that sub-session’s assistant parts instead (subagent progress).
  - Compute `currentText` from the latest `text` part, else latest `reasoning`.
  - `eligibleItems` = completed tool parts (status === `completed`).
  - Animated list: reveals completed items gradually (slide-up via translateY) with a timer; also shows a small “Thinking…” row.
  - Below the rail, render the current text snippet as markdown.

Animation logic (concept):
```ts
const finishedItems = [spacer, spacer, Thinking..., ...completedTools, ...(done ? [spacer, spacer, spacer] : [])];
visibleCount increments on a timer (400ms streaming, 220ms done), translateY moves the list up as it grows.
```

### PromptInput (compose + submit)
- `contenteditable` field maintains a list of parts (text + file pills), preserves cursor while reconciling DOM and store.
- `@` trigger shows file picker list; selecting inserts a "file" part pill.
- On submit:
  - Create/activate a session if needed
  - Build `parts`: main text part plus file attachments (with `file://` url and embedded source text)
  - Call `sdk.client.session.prompt({ agent, model, parts })`
  - Streaming events update Sync store → UI.

### Sessions list & active message
- Right rail shows per-message status and diffs bars for each user message.
- Status heuristic based on the last part type (tool → specific activity, reasoning → thinking, text → gathering thoughts).
- The active message drives the central chat contents; switching updates the normalized data via `sync.session.sync`.

### Sorting & IDs
- IDs sort ascending lexicographically (`a.id.localeCompare(b.id)`) to form timelines; binary-search upserts keep arrays sorted without full resort.
- This invariant applies to sessions, messages, and parts.

### Model selection
- Source: providers/models from Sync (`/config/providers`).
- Current model derived from: agent-configured → stored per-agent → recent → configured default → first available.
- Recent models are capped and persisted (max 5).
- UI groups by provider with a preferred provider order; free models indicated in picker.

### Noise reduction and details hygiene
- Core idea: keep the main chat readable while streaming by:
  - Showing only the latest assistant text (and small status rail)
  - Hiding step scaffolding and internal tools from the main flow
  - Exposing completed tool steps in a collapsible “Show details” after completion
- This mirrors how a human communicates: concise text up front; details on demand.

### Keyboard & UX touches
- Shortcut decisions (e.g., focus prompt on first keypress, ESC blur, project quick file open)
- Sticky title bar with typewriter effect until titled
- Animated progress for pleasant but unobtrusive feedback

### Mapping these patterns into React/Next + Zustand (what we implemented)
- Event ingest: `EventSource` → Zustand store; upsert sessions/messages/parts using id-sorted arrays.
- MessageProgress (React):
  - Follows desktop semantics: subagent task redirection, latest text, completed tools, progressive animation.
  - Clean primary view while streaming; details only when needed.
- AgentPanel (React):
  - While working: show `MessageProgress`.
  - On completion: show Summary/Response; if tool steps exist, a collapsible “Show details” lists assistant steps (without duplicating primary text).
- Filtering mirrors desktop (hide `step-start`, `step-finish`, `todoread` etc.; ignore synthetic text).

### Why it feels clean
- The stream is distilled to the essentials (latest coherent text + small animated cue of background work).
- All operational detail is deferred and discoverable, not forced.
- Sorting + stable upserts avoid flicker and keep items in logical order.

### Implementation pointers
- Keep normalization pure and deterministic; UI reads from selectors.
- Avoid rendering reasoning verbatim in the main area; safe to use as status input.
- Use timers/transitions sparingly (progress rail) and debounce status changes to prevent jitter.
- When tasks delegate, switch the progress rail context to the sub-session automatically; fall back gracefully if unavailable.

### UI components and paths (desktop + shared UI)

Desktop (SolidJS) app components
- opencode/packages/desktop/src/pages/index.tsx: Main chat page layout
- opencode/packages/desktop/src/components/prompt-input.tsx: Prompt composer with @file insert and model/agent pickers
- opencode/packages/desktop/src/components/message-progress.tsx: Streaming progress rail (compact, animated)
- opencode/packages/desktop/src/components/code.tsx: Code/diff viewer wrapper
- opencode/packages/desktop/src/components/file-tree.tsx: File tree and opened tabs
- opencode/packages/desktop/src/components/spinner.tsx: Small spinner
- opencode/packages/desktop/src/context/sdk.tsx: SDK client + SSE subscription + event emitter
- opencode/packages/desktop/src/context/sync.tsx: Normalized store (sessions/messages/parts), event ingest, loaders
- opencode/packages/desktop/src/context/local.tsx: Derived UI state (agent/model, session/message, files, context)
- opencode/packages/desktop/src/ui/collapsible.tsx: Collapsible wrapper for details
- opencode/packages/desktop/src/ui/file-icon.tsx: File icon mapping

Shared UI library (Solid) used by desktop
- opencode/packages/ui/src/components/message-part.tsx: Core chat rendering
  - Message: User/Assistant switch
  - AssistantMessageDisplay: filters parts (hides reasoning, todoread)
  - Part: dynamic part renderer using PART_MAPPING
  - ToolRegistry: tool name → renderer mapping
  - Registered tools: read, list, glob, grep, webfetch, task, bash, edit, write, todowrite
- opencode/packages/ui/src/components/basic-tool.tsx: GenericTool and BasicTool shells
- opencode/packages/ui/src/components/markdown.tsx: Markdown rendering
- opencode/packages/ui/src/components/diff.tsx: Split/unified diff viewer
- opencode/packages/ui/src/components/diff-changes.tsx: Diff summary bars
- opencode/packages/ui/src/components/accordion.tsx: Accordion primitive
- opencode/packages/ui/src/components/collapsible.tsx: Collapsible primitive
- opencode/packages/ui/src/components/list.tsx: List with current/hover
- opencode/packages/ui/src/components/select.tsx + select-dialog.tsx: Model picker, file select
- opencode/packages/ui/src/components/tabs.tsx: Tabs for chat/code panels
- opencode/packages/ui/src/components/button.tsx, icon.tsx, icon-button.tsx: Controls
- opencode/packages/ui/src/components/progress-circle.tsx: Context usage indicator
- opencode/packages/ui/src/components/typewriter.tsx: Title typewriter during streaming
- opencode/packages/ui/src/context/marked.tsx, shiki.tsx: Markdown/shiki providers
- opencode/packages/ui/src/hooks/use-filtered-list.tsx: Filtered list logic used by prompt input

How components compose in chat
- Desktop page renders:
  - Title (typewriter until titled), Message (main message + parts), Summary/Response (on completion), Diffs (accordion)
  - While working: MessageProgress (latest text + completed tool steps); details hidden by default
  - After completion and if tools ran: Collapsible → list of assistant messages rendered via Message/Part
- Part rendering rules (from message-part.tsx):
  - Hide reasoning in AssistantMessageDisplay; show in progress rail as text fallback
  - Hide internal tools (`todoread`) and scaffolding parts from main feed
  - Tool parts use ToolRegistry; individual tool UIs in basic-tool.tsx and message-part.tsx registrations

Porting notes for React/Next
- Mirror component boundaries: Message, Part, ToolPartView, MessageProgress, PromptInput, FileTree/Code as needed
- Maintain the same filtering and ToolRegistry mapping; register tools by name, render minimal triggers + optional content
- Keep streaming UI minimal in main area; show details via collapsible after completion


