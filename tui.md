# OpenCode TUI Architecture and UI Patterns

## Overview

The TUI (Terminal User Interface) is a Go-based Bubble Tea application that provides a clean, terminal-based chat interface for OpenCode. It's located in `opencode/packages/tui` and demonstrates best practices for rendering streaming AI conversations, tool calls, and thinking processes in a compact, readable format.

## Core Architecture

### Tech Stack
- **Framework**: Bubble Tea (elm-inspired TUI framework)
- **Rendering**: Lipgloss (terminal styling library)
- **Layout**: Custom flex layout system
- **Syntax**: Glamour (markdown rendering), Chroma (syntax highlighting)

### Component Structure
```
tui/
├── cmd/               # CLI entry point
├── internal/
│   ├── app/          # App state, messages, session management
│   ├── components/   # UI components (chat, status, dialogs, etc.)
│   ├── util/         # Helpers (shimmer, colors, markdown, file rendering)
│   ├── theme/        # Theme system with 20+ themes
│   ├── layout/       # Flexbox-style layout engine
│   └── viewport/     # Scrollable viewport
```

## State Management

### App State (`app/state.go`)
Persisted state in TOML format:
- `Theme`: Current theme name (default: "opencode")
- `Agent`: Last used agent (default: "build")
- `AgentModel`: Map of agent → provider/model preference
- `RecentlyUsedModels`: Last 50 models with timestamps
- `RecentlyUsedAgents`: Last 20 agents with timestamps
- `MessageHistory`: Last 50 prompts for autocomplete
- `ShowToolDetails`: Toggle for expanded tool rendering (default: true)
- `ShowThinkingBlocks`: Toggle for reasoning part visibility (default: false)

### Runtime State (`app/app.go`)
In-memory application state:
- `Project`, `Config`, `Providers`, `Agents`
- `Session`, `Messages[]`, `Permissions[]`
- `AgentIndex`, `Provider`, `Model` (current selections)
- `Client` (OpenCode SDK client for API calls)
- UI state: `IsLeaderSequence`, `IsBashMode`, `ScrollSpeed`

## Streaming Architecture: How Parts Are Ordered

### Stream Event Flow (from OpenCode engine)

The AI SDK emits events in this sequence during a single assistant turn:

```
1. start-step
2. reasoning-start (id=r1)
3. reasoning-delta (id=r1, text chunks...)
4. reasoning-end (id=r1)
5. tool-input-start (id=t1, toolName)
6. tool-call (id=t1, input={...})
7. tool-result (id=t1, output={...})
8. tool-input-start (id=t2, toolName)
9. tool-call (id=t2, input={...})
10. tool-result (id=t2, output={...})
11. reasoning-start (id=r2)
12. reasoning-delta (id=r2, text chunks...)
13. reasoning-end (id=r2)
14. tool-input-start (id=t3, toolName)
15. tool-call (id=t3, input={...})
16. tool-result (id=t3, output={...})
17. text-start
18. text-delta (text chunks for final response...)
19. text-end
20. finish-step
```

**Key insights**:
- **Interleaved thinking + actions**: The model alternates between reasoning and tool use
- **Multiple cycles possible**: reasoning → tools → reasoning → tools → ... → final text
- **Tool execution is blocking**: Each tool completes before the next starts
- **Final text comes last**: After all reasoning and tool use
- **finishReason**: If `"tool-calls"`, the assistant will continue in another turn (loop continues)

### Part Storage and IDs

**Part IDs** are ascending lexicographic (Identifier.ascending("part")):
- `prt_a474212c6001M1d6iPq3jesj4v`
- `prt_a474212c7001Xzy9...`
- etc.

When sorted by ID, parts appear **in creation order**:
```
parts = [
  { type: "reasoning", text: "I need to read the file first..." },
  { type: "tool", tool: "read", state: { status: "completed", ... } },
  { type: "reasoning", text: "Now I'll edit it..." },
  { type: "tool", tool: "edit", state: { status: "completed", ... } },
  { type: "text", text: "I've updated the file as requested." },
]
```

This **chronological ordering** is what enables the clean sequential display.

### Real-Time Streaming Behavior

**What the user sees frame-by-frame**:

**Frame 1** (reasoning-start, reasoning-delta...):
```
┌─────────────────────────────────────────┐
│ Thinking...                             │  ← shimmering
│                                         │
│ I need to read                          │  ← text accumulating
│                                         │
│ Claude Sonnet 4.5 (03:04 PM)            │
└─────────────────────────────────────────┘
```

**Frame 2** (reasoning continues...):
```
┌─────────────────────────────────────────┐
│ Thinking...                             │  ← shimmering
│                                         │
│ I need to read the file first to       │  ← more text
│ understand its structure.               │
│                                         │
│ Claude Sonnet 4.5 (03:04 PM)            │
└─────────────────────────────────────────┘
```

**Frame 3** (reasoning-end, tool-input-start):
```
┌─────────────────────────────────────────┐
│ Thinking...                             │  ← static now (time.end set)
│                                         │
│ I need to read the file first to       │
│ understand its structure.               │
│                                         │
│ Claude Sonnet 4.5 (03:04 PM)            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Reading file...                         │  ← new tool, pending, shimmering
└─────────────────────────────────────────┘
```

**Frame 4** (tool-call):
```
[same reasoning block]

┌─────────────────────────────────────────┐
│ Reading file...                         │  ← status: running, still shimmering
└─────────────────────────────────────────┘
```

**Frame 5** (tool-result):
```
[same reasoning block]

┌─────────────────────────────────────────┐
│ Read src/main.ts                        │  ← status: completed, no shimmer
│                                         │
│ ```typescript                           │
│ export function main() {                │
│   console.log("Hello");                 │
│ }                                       │
│ ```                                     │
└─────────────────────────────────────────┘
```

**Frame 6** (reasoning-start for cycle 2):
```
[previous blocks...]

┌─────────────────────────────────────────┐
│ Thinking...                             │  ← NEW reasoning, shimmering
│                                         │
│ Now I'll edit                           │
│                                         │
│ Claude Sonnet 4.5 (03:04 PM)            │
└─────────────────────────────────────────┘
```

**Frame 7-8** (tool cycle 2: edit file):
```
[previous blocks...]

┌─────────────────────────────────────────┐
│ Thinking...                             │  ← static
│                                         │
│ Now I'll edit the function to add a    │
│ parameter.                              │
│                                         │
│ Claude Sonnet 4.5 (03:04 PM)            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Edit src/main.ts                        │  ← completed tool
│                                         │
│ [diff content...]                       │
└─────────────────────────────────────────┘
```

**Frame 9** (text-start, text-delta... final response):
```
[previous blocks...]

  I've updated the function                   ← text streaming in
  
  Claude Sonnet 4.5 (03:04 PM)
```

**Frame 10** (text-end, finish-step - COMPLETE):
```
[previous blocks...]

  I've updated the function to accept a      ← final text complete
  name parameter and use it in the greeting.
  
  Claude Sonnet 4.5 (03:04 PM)
```

**Critical points**:
1. Parts render **in the order they arrive** (chronologically)
2. Each part is a separate block (except tools grouped with text when `showToolDetails=false`)
3. Shimmer animates **only the last active item** (reasoning or pending tool)
4. Completed parts become static immediately
5. The sequence naturally shows: think → act → think → act → respond

## Message Rendering Pipeline

### Rendering Flow (messages.go)

1. **Event Ingestion**
   - SSE events from `/event` endpoint trigger re-renders
   - Events: `message.updated`, `message.part.updated`, `session.updated`, `permission.updated`
   - Render is debounced/batched to prevent flicker

2. **Render Pipeline**
   ```
   User input → renderView() → Build blocks → Cache lookup → Render each part → Viewport update
   ```

3. **Part Cache (`cache.go`)**
   - Thread-safe cache with FNV-1a hash keys
   - Key factors: messageID, text, width, showToolDetails, tool parts
   - Cleared on: resize, session switch, part removal, theme change
   - Only caches **completed** parts (streaming parts re-render every tick)

4. **Rendering Strategy**
   - Process messages in order
   - For each message, iterate parts **in chronological order** (by ascending ID)
   - Build "blocks" (styled content strings) for each part type
   - Track line positions for scroll-to-message
   - Handle "orphaned" tool calls (tools without preceding text part)
   - Apply selection highlighting for clipboard
   - Join blocks with blank lines, render to viewport

### How TUI Renders the Interleaved Sequence

**The Critical Loop** (messages.go lines 488-652):

```go
for partIndex, p := range message.Parts {
  switch part := p.(type) {
  case opencode.TextPart:
    // Render text block (may include trailing tool summaries if showToolDetails=false)
    blocks = append(blocks, renderText(..., toolCallParts...))
    
  case opencode.ToolPart:
    if showToolDetails {
      // Render full tool block
      blocks = append(blocks, renderToolDetails(...))
    } else if !hasTextPart {
      // Orphaned tool - save for next text part
      orphanedToolCalls = append(orphanedToolCalls, part)
    }
    // else: tool already rendered inline with preceding text
    
  case opencode.ReasoningPart:
    if showThinkingBlocks {
      // Render thinking block
      blocks = append(blocks, renderText(..., isThinking=true, shimmer=...))
    }
    // else: skip (hidden)
  }
}
```

**Example Render Output** (with `showThinkingBlocks=true`, `showToolDetails=true`):

```
┌─────────────────────────────────────────┐
│ Thinking...                             │  ← reasoning part 1
│                                         │
│ I need to read the file first to       │
│ understand its structure.               │
│                                         │
│ Claude Sonnet 4.5 (03:04 PM)            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Read src/main.ts                        │  ← tool part 1
│                                         │
│ ```typescript                           │
│ export function main() {                │
│   console.log("Hello");                 │
│ }                                       │
│ ```                                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Thinking...                             │  ← reasoning part 2
│                                         │
│ Now I'll edit the function to add a    │
│ parameter.                              │
│                                         │
│ Claude Sonnet 4.5 (03:04 PM)            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Edit src/main.ts                        │  ← tool part 2
│                                         │
│ [unified diff showing changes]          │
│ +5 -2                                   │
└─────────────────────────────────────────┘

  I've updated the function to accept a      ← text part (final)
  name parameter and use it in the greeting.
  
  Claude Sonnet 4.5 (03:04 PM)
```

**With `showThinkingBlocks=false` (default)**:

```
┌─────────────────────────────────────────┐
│ Read src/main.ts                        │  ← tool part 1
│                                         │
│ ```typescript                           │
│ export function main() {                │
│   console.log("Hello");                 │
│ }                                       │
│ ```                                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Edit src/main.ts                        │  ← tool part 2
│                                         │
│ [unified diff showing changes]          │
│ +5 -2                                   │
└─────────────────────────────────────────┘

  I've updated the function to accept a      ← text part (final)
  name parameter and use it in the greeting.
  
  Claude Sonnet 4.5 (03:04 PM)
```

**With `showToolDetails=false`, `showThinkingBlocks=false` (ultra-compact)**:

```
  I've updated the function to accept a      ← text part (final)
  name parameter and use it in the greeting.
  
  ∟ Read src/main.ts                         ← inline tool summaries
  ∟ Edit src/main.ts
  
  Claude Sonnet 4.5 (03:04 PM)
```

### Text Part Grouping Strategy

**Critical logic** (lines 498-527): When rendering a TextPart, TUI **looks ahead** to find all subsequent ToolParts until the next TextPart:

```go
remainingParts := message.Parts[partIndex+1:]
toolCallParts := []opencode.ToolPart{}

for _, part := range remainingParts {
  switch part := part.(type) {
  case opencode.TextPart:
    // Stop - next text part ends this group
    remaining = false
  case opencode.ToolPart:
    // Collect tool for this text block
    toolCallParts = append(toolCallParts, part)
  }
}

// Render text with its associated tools
renderText(..., toolCalls=toolCallParts)
```

**Why this works**:
- Parts are stored in chronological order (ascending IDs)
- Tools always come after the reasoning/text that triggered them
- Next text part signals a new "thought cycle"
- This grouping mirrors the model's behavior: think → act → think → act → respond

### Streaming Display During Active Turn

**While streaming** (assistant message not completed):

1. **ReasoningPart streaming**:
   - Last reasoning part (no `time.end`) gets shimmer on "Thinking..." prefix
   - Text accumulates via `reasoning-delta` events
   - Block re-renders every 90ms tick

2. **ToolPart progression**:
   - `pending` → Shimmered "Reading file..." title, no body
   - `running` → Title updates with args, no body yet
   - `completed` → Full block with title + body (diff, output, etc.)

3. **TextPart streaming**:
   - Accumulates via `text-delta` events
   - Re-renders every event (no cache until `time.end`)
   - Grouped with trailing tool calls (look-ahead logic)

4. **"Generating..." placeholder**:
   - If assistant message has **no content yet** (no text/tool/reasoning rendered)
   - Shows shimmered placeholder block
   - Replaced when first real part arrives

**Auto-scroll behavior**:
- Viewport follows bottom if user was at bottom
- New blocks push content down
- Shimmer updates don't change scroll position (same block height)

### Message Part Types and Rendering

#### TextPart (User)
```go
// User message with file/agent attachments highlighted inline
renderText(message, text, author, showToolDetails, width, filesExtra, isThinking=false, isQueued, shimmer=false, fileParts, agentParts, toolCalls...)
```

**Visual structure**:
- Border: left + right thick borders with secondary color
- Background: `BackgroundPanel`
- Content: Markdown-rendered text with file pills (colored badges showing mime type + filename)
- Footer: `username (timestamp)`
- If queued (ID > last assistant ID): "QUEUED" badge at top
- File/agent mentions: inline highlighted with Secondary color

**Attachments Display**:
- File parts: `[txt] filename.md` or `[img] photo.png` (colored by mime type)
- Stacked vertically below the text
- Mime type badges: txt (muted), img (accent), pdf (primary)

#### TextPart (Assistant)
```go
renderText(message, text, modelID, showToolDetails, width, extra="", isThinking, isQueued=false, shimmer, fileParts=[], agentParts=[], toolCalls...)
```

**Visual structure**:
- No border (clean, minimal)
- Background: `Background` (unless thinking → `BackgroundPanel`)
- Content: Markdown-rendered response text
- Footer: `AgentName ModelID (timestamp)` with agent color
- Tool calls: appended inline as compact "∟ ToolName arg" lines when `showToolDetails=false`

**Special states**:
- **Thinking mode** (`isThinking=true`):
  - Background: `BackgroundPanel`
  - Prepend: "Thinking..." (shimmered if `shimmer=true`)
  - Used for ReasoningPart rendering
- **Generating** (no content, not completed):
  - Shows shimmered "Generating..." placeholder
- **Tool calls inline**: When `showToolDetails=false`, completed tool calls appear as compact "∟ Read file.txt" lines below the text

#### ReasoningPart
```go
// Only rendered if showThinkingBlocks=true
renderText(message, part.Text, modelID, showToolDetails, width, extra="", isThinking=true, isQueued=false, shimmer, ...)
```

**Shimmer animation**:
- Only the **last streaming** reasoning part gets shimmer effect
- 90ms tick interval, moving highlight sweep over text
- Uses "Thinking..." prefix with shimmered text
- Background: `BackgroundPanel` to visually distinguish from final text

**Purpose**: Show chain-of-thought without cluttering the main feed. Hidden by default; toggled via keybind.

#### ToolPart
```go
renderToolDetails(app, toolCall, permission, width)
```

**Rendering by status**:

**Pending**:
- Title: Shimmered action phrase ("Reading file...", "Delegating...", "Fetching from the web...")
- No body

**Running/Completed/Error**:
- Title: `ToolName args` (e.g., "Read src/main.ts", "Shell pnpm build", "Edit[build] create API")
- Body: Tool-specific content (see below)
- Error state: Title rendered in Error color, error message at bottom
- Permission request: Yellow border, shows "enter/a/esc" prompt

**Tool-specific rendering**:

1. **read**:
   - Body: File preview from `metadata.preview`, rendered as syntax-highlighted code block
   - Truncated to 6 lines

2. **edit**:
   - Body: Formatted diff from `metadata.diff`
   - Split diff (2 columns) if width >= 120, otherwise unified diff
   - Shows diagnostics (linter errors) below diff if present
   - Format: `Error [line:col] message` in Error color

3. **write**:
   - Body: File content from input, syntax-highlighted
   - Shows diagnostics below if present

4. **bash**:
   - Body: Console-style output
   ```
   $ command
   stdout/stderr output
   ```
   - Output is ANSI-stripped, rendered as markdown code block

5. **webfetch**:
   - Body: Fetched content, truncated to 10 lines
   - Rendered as markdown if format is html/markdown

6. **todowrite**:
   - Body: Markdown checklist
   ```
   - [x] Completed task
   - [ ] ~~Cancelled task~~
   - [ ] `In progress task`
   - [ ] Pending task
   ```

7. **task** (subagent delegation):
   - Body: Summary of subtask tool calls (nested list)
   ```
   ∟ Read file.ts
   ∟ Edit file.ts
   ...
   keybind1, keybind2 navigate child sessions
   ```
   - Shows navigation hint for cycling through child sessions

**Orphaned tools**: If a tool call appears without a preceding text part in the same assistant message, it's collected and attached to the next text part.

### Tool Title Formatting

**Pending title** (shimmered action phrases):
- task → "Delegating..."
- bash → "Writing command..."
- edit → "Preparing edit..."
- webfetch → "Fetching from the web..."
- glob → "Finding files..."
- grep → "Searching content..."
- list → "Listing directory..."
- read → "Reading file..."
- write → "Preparing write..."
- todowrite/todoread → "Planning..."
- patch → "Preparing patch..."

**Completed title** (concise name + key args):
- read → "Read filepath"
- edit/write → "Edit filepath" / "Write filepath"
- bash → "Shell description" (from input.description)
- task → "Task[subagent] description"
- webfetch → "Fetch url"
- todowrite → "Creating plan" / "Updating plan" / "Completing plan" (dynamic based on todo statuses)
- glob → "Glob path (pattern=*.ts)"
- grep → "Grep path (pattern=searchterm, include=*.ts)"

### Display Toggles

#### showToolDetails (default: true)
- **true**: Each tool part renders as a full bordered block with title + body
- **false**: Tools appear as compact inline "∟ ToolName args" appended to the preceding text part
- Toggled via keybind; persisted in state

#### showThinkingBlocks (default: false)
- **true**: ReasoningPart blocks are rendered (with "Thinking..." prefix)
- **false**: Reasoning is hidden from the chat feed
- Only the last **streaming** reasoning part gets shimmer animation
- Toggled via keybind; persisted in state

## Rendering Optimizations

### Caching Strategy
- **Cache key**: `hash(messageID, text, width, showToolDetails, toolParts...)`
- **Cache on**: Completed parts only
- **Invalidate on**: Resize, session switch, part removal, theme change
- **Measurement**: Every render is timed with `util.Measure()`

### Shimmer Animation
- 90ms tick interval when any work is in-flight
- Only animates:
  - Pending tool titles ("Reading file...")
  - Last streaming reasoning part ("Thinking..." prefix)
  - "Generating..." placeholder when assistant has no content yet
- Uses moving brightness sweep (bold → medium → faint)
- Disabled when no animating work detected

### Viewport Scrolling
- Auto-scrolls to bottom (`tail=true`) when:
  - New prompt sent
  - New session loaded
  - User is already at bottom
- Preserves scroll position when user scrolls up
- Page up/down, half-page, go-to-top/bottom keybinds
- Mouse wheel support with configurable speed

## UI Components

### Status Bar (`components/status/status.go`)
**Layout**: `[opencode VERSION] [CWD:BRANCH] ← spacer → [keybind AGENT_NAME AGENT]`

**Features**:
- Agent color-coded (7 colors cycling based on agent index)
- First agent (build) uses muted text on element background; others use bold colored background
- Git branch watcher (fsnotify on .git/HEAD and ref files)
- Path truncation with ellipsis when width constrained
- Keybind hint for agent switching

### Messages Component (`components/chat/messages.go`)

**Responsibilities**:
- Renders all messages/parts into a scrollable viewport
- Maintains part cache
- Handles tool details toggle, thinking blocks toggle
- Implements undo/redo (revert to earlier message)
- Mouse selection → clipboard copy
- Scroll-to-message for child session navigation

**Header rendering** (`renderHeader()`):
- Session title (markdown H1)
- Token usage: `110K/45% ($0.12)` or `110K/45%` (subscription models)
- Share link and `/share` command hint (if sharing enabled)
- Child session indicator with "back" nav hint
- Colored border (accent for child, element for parent)

**Message rendering order**:
1. Find last streaming reasoning part (for shimmer)
2. Iterate messages in creation order
3. For each message:
   - User: render text + file attachments
   - Assistant: render text/reasoning/tools based on toggles
   - Handle orphaned tools
   - Track revert state (hide reverted messages)
4. Show revert summary block if active
5. Show permission request block if pending (in child session)

**Revert Display**:
```
N messages reverted, M tool calls reverted
keybind (or /redo) to restore

file1.ts +5 -2
file2.ts +10 -3
```

### Diff Component (`components/diff/diff.go`)

**Modes**:
- **Unified** (width < 120): Traditional `+`/`-` line-by-line diff
- **Split** (width >= 120): Side-by-side before/after columns

**Features**:
- Syntax highlighting within diff blocks
- Line numbers
- Addition/deletion stats (+N -M)
- Hunk headers (`@@ -10,5 +10,7 @@`)

### Prompt Input (`components/chat/editor.go`)

**Features**:
- Multi-line contenteditable-style input
- `@` trigger for file/symbol autocomplete
- Model/agent pickers (dialog overlays)
- Prompt history (up/down arrows, max 50)
- Command mode (`/help`, `/share`, `/compact`, etc.)
- Auto-submit on Enter (Shift+Enter for newline)
- Clipboard paste support

**Attachments**:
- File attachments inserted as pills in the input
- Source text ranges tracked for highlighting in user message

### Dialogs (`components/dialog/`)

**Agent Picker** (`agents.go`):
- Lists non-subagent agents with descriptions
- Colored by agent index
- Shows current selection
- Keybind navigation

**Model Picker** (`models.go`):
- Grouped by provider
- Shows model details (context window, cost, features)
- Recent models at top
- Free/subscription models indicated
- Filter/search support

**Session List** (`session.go`):
- Shows session titles, timestamps, file change counts
- Parent/child hierarchy visualization
- Delete/switch actions

**Theme Picker** (`theme.go`):
- 20+ built-in themes
- Live preview
- Saves to state

**Timeline** (`timeline.go`):
- Shows full conversation timeline
- Jump to specific messages
- Visual indicators for user/assistant/tools

### Toast Notifications (`components/toast/toast.go`)
- Success/error/info variants
- Auto-dismiss timeout
- Queued display (one at a time)

## Key UI Patterns

### 1. Thinking Display Strategy

**When `showThinkingBlocks=false` (default)**:
- Reasoning parts are **completely hidden** from the main chat feed
- Only final text parts are shown
- This keeps the main view clean and focused on results

**When `showThinkingBlocks=true`**:
- Reasoning parts render as full blocks with:
  - "Thinking..." prefix (shimmered if streaming)
  - Background: `BackgroundPanel` (visually distinct from final text)
  - Timestamp and model info in footer
- Only the **last streaming** reasoning part gets shimmer animation
- Multiple reasoning parts appear as separate blocks in chronological order

**Rationale**: Chain-of-thought is verbose; showing it by default clutters the interface. Power users can toggle it on when debugging or curious about the model's process.

### 2. Tool Call Display Strategy

**When `showToolDetails=false`**:
- Tools appear as **inline compact lines** appended to the preceding text part:
  ```
  Assistant response text here.
  
  ∟ Read src/main.ts
  ∟ Edit src/api.ts
  ∟ Shell pnpm build
  ```
- Only shows tool name and primary arg (file path, command, URL, etc.)
- No body content visible
- Errors shown in red color

**When `showToolDetails=true` (default)**:
- Each tool renders as a **full bordered block** with:
  - Header: Title + primary args + error/permission badges
  - Body: Tool-specific content (code preview, diff, output, etc.)
  - Border colors: Default (BackgroundPanel), Warning (permission), Error (failed)

**Orphaned Tool Strategy**:
- If a tool call appears without a preceding text part in the same assistant message, it's collected and attached to the next text part
- This handles cases where the model calls tools before generating explanatory text

### 3. Streaming Indicators

**Pending tools**:
- Shimmered action phrase title ("Reading file...", "Delegating...")
- No body content
- Updates to completed state trigger cache and re-render

**Streaming text**:
- Text parts without `time.end` are not cached
- Re-rendered on every tick (no flicker due to terminal refresh model)

**Streaming reasoning**:
- Last streaming reasoning part gets shimmer on "Thinking..." prefix
- Older reasoning parts (with `time.end`) render static

**"Generating..." state**:
- When assistant message has no content yet (no text/tool/reasoning parts)
- Shows shimmered "Generating..." placeholder

### 4. Visual Hierarchy

**User messages**:
- Background: `BackgroundPanel`
- Border: Left + right thick borders, `Secondary` color (or `Accent` if queued)
- Text: White/text color
- Footer: `username (timestamp)`

**Assistant messages (final text)**:
- Background: `Background` (same as viewport background → seamless)
- No border (NoBorder option)
- Text: White/text color
- Footer: `AgentName ModelID (timestamp)` with agent-colored name

**Thinking blocks**:
- Background: `BackgroundPanel` (visually separated from final text)
- Border: Left + right borders, `BackgroundPanel` color
- Prefix: "Thinking..." (shimmered if streaming)
- Text: Reasoning content

**Tool blocks**:
- Background: `BackgroundPanel`
- Border: Left + right borders
  - Default: `BackgroundPanel` color
  - Permission: `Warning` color (yellow)
  - Error: Title in `Error` color
- Title: Tool name + args
- Body: Scrollable, syntax-highlighted content

### 5. Compact Design Principles

**Padding**:
- Content blocks: `paddingTop=1, paddingBottom=1, paddingLeft=2, paddingRight=2`
- Viewport: 2-space left/right margins
- Blocks separated by single blank line

**Borders**:
- Thick borders (▐ character) for user messages and tool details
- No borders for assistant final text (seamless with background)
- Colored borders for status (permission/error)

**Text wrapping**:
- Word wrap with non-breaking hyphens (`-` → `\u2011` before wrap, then restore)
- Prevents mid-word hyphen breaks

**Height limits**:
- File previews: 6 lines (read tool)
- Command output: No limit, but markdown rendering compacts it
- Webfetch: 10 lines
- Tool bodies: No hard limit, viewport scrolls

**Width breakpoints**:
- Diff rendering: Split (120+), Unified (<120)
- Status bar: Show version (40+), hide (<40)
- Path truncation: Dynamic ellipsis based on available width

### 6. Progressive Disclosure

**Default view (minimal)**:
- showToolDetails: true
- showThinkingBlocks: false
- Result: See final text + full tool steps, hide reasoning

**Power user view**:
- Toggle thinking blocks → see full chain-of-thought
- Toggle tool details off → ultra-compact inline tool list

**Details on demand**:
- Collapsible tool bodies (always collapsed on pending)
- Expand to see code previews, diffs, outputs
- Diagnostics shown inline with edits

## Color System

### Agent Colors (7-color cycle)
1. TextMuted (default/build)
2. Secondary
3. Accent
4. Success (green)
5. Warning (yellow)
6. Primary
7. Error (red)

Used for:
- Status bar agent indicator
- Agent name in message footer
- Subagent task titles

### Theme Palette
Each theme defines:
- `Background`, `BackgroundPanel`, `BackgroundElement` (3-level depth)
- `Text`, `TextMuted` (foreground)
- `Primary`, `Secondary`, `Accent` (highlights)
- `Success`, `Warning`, `Error` (semantic)

20+ themes: opencode, aura, dracula, nord, gruvbox, catppuccin, tokyo-night, etc.

## Performance & Responsiveness

### Render Batching
- Debounced re-renders during streaming
- `dirty` flag prevents overlapping renders
- Viewport updates only when render completes

### Lazy Computation
- Messages rendered **only when visible** in viewport
- Cache hits avoid markdown/syntax re-processing
- Selection highlighting applied in final pass (not per-part)

### Concurrency
- Git watcher runs in background goroutine
- Shimmer ticks only when work is active
- Clipboard operations async

## Keyboard Interactions

### Navigation
- Page up/down, half-page up/down
- Go to top/bottom
- Scroll to specific message (timeline dialog)

### Actions
- `ctrl+x` (leader) + key combos for commands
- Toggle tool details, thinking blocks
- Agent/model cycling
- Session management (new, list, timeline, share/unshare)
- Message undo/redo (revert system)
- Copy last message

### Input
- Enter: Submit
- Shift+Enter: Newline
- `@`: File picker
- Up/Down: Prompt history
- Ctrl+C: Clear input or exit (if empty)

## Lessons for Web UI

### What to Mirror

1. **Two-tier toggle system**:
   - Default: Show tools, hide thinking
   - Advanced: Expose thinking for power users
   - Compact mode: Hide tool bodies, show inline list

2. **Streaming polish**:
   - Shimmer only the **last active item** (reasoning or pending tool)
   - Static render for completed items
   - "Generating..." placeholder when assistant has no content

3. **Tool rendering**:
   - Pending: Human-readable action phrase ("Reading file...")
   - Completed: Concise title + key args ("Read src/main.ts")
   - Body: Tool-specific content (previews, diffs, outputs) in collapsible
   - Icons + duration + status indicators for quick scanning

4. **Orphaned tool handling**:
   - Collect tools without preceding text
   - Attach to next text part
   - Prevents floating tool blocks

5. **Compact inline mode**:
   - "∟ ToolName arg" list below assistant text
   - No body expansion
   - Clean for reviewing completed sessions

6. **Visual separation**:
   - Thinking: Different background color (panel vs main)
   - User: Bordered, panel background
   - Assistant: Borderless, main background (seamless)
   - Tools: Bordered, panel background

7. **Progressive animation**:
   - Graceful reveal of completed steps
   - Debounced updates (90ms ticks, not every event)
   - Auto-scroll only if user is at bottom

### What to Simplify for Web

1. **No terminal constraints**: Use actual icons, smooth CSS transitions, better typography
2. **Hover states**: Expand tool previews on hover instead of full collapse/expand
3. **Copy buttons**: No need for mouse selection; add copy buttons per block
4. **Syntax highlighting**: Use Shiki (web) instead of Chroma (terminal)
5. **Infinite scroll**: Web can lazy-load old messages; TUI renders all
6. **Better diffs**: Use Monaco diff editor or react-diff-view for rich diffs

## Component File Reference

### Core Components
- `internal/components/chat/messages.go` - Main message list viewport (1323 lines)
- `internal/components/chat/message.go` - Message/part rendering logic (1031 lines)
- `internal/components/chat/cache.go` - Render cache (63 lines)
- `internal/components/chat/editor.go` - Prompt input
- `internal/components/status/status.go` - Status bar (341 lines)

### Supporting Components
- `internal/components/diff/diff.go` - Diff formatting (split/unified)
- `internal/components/diff/parse.go` - Diff parsing and stats
- `internal/components/dialog/*.go` - Overlays (agents, models, sessions, themes, help, timeline)
- `internal/components/list/list.go` - Filtered list primitive
- `internal/components/textarea/textarea.go` - Multi-line input primitive
- `internal/components/toast/toast.go` - Toast notifications
- `internal/components/modal/modal.go` - Modal overlay primitive

### Utilities
- `internal/util/shimmer.go` - Moving brightness animation
- `internal/util/color.go` - RGB→ANSI conversion, agent colors
- `internal/util/file.go` - File rendering, syntax highlighting
- `internal/util/util.go` - Markdown rendering, truncation, path helpers
- `internal/styles/markdown.go` - Glamour markdown renderer
- `internal/layout/flex.go` - Flexbox-style layout engine
- `internal/theme/theme.go` - Theme system
- `internal/viewport/viewport.go` - Scrollable viewport (custom fork of Bubble Tea viewport)

## Summary

The TUI achieves a **clean, compact, and responsive** chat interface by:

1. **Hiding noise by default**: Reasoning off, tool details inline optional
2. **Shimmering only active work**: Pending tools, last reasoning, "Generating..."
3. **Caching aggressively**: Completed parts never re-render unless invalidated
4. **Smart scrolling**: Auto-follow when at bottom, preserve position when reviewing
5. **Tool-specific rendering**: Each tool knows how to display its input/output optimally
6. **Progressive disclosure**: Inline summaries → expandable details → full tool bodies
7. **Visual hierarchy**: Background colors and borders separate user/assistant/thinking/tools
8. **Compact spacing**: 1-line padding, thin margins, word-wrapped text
9. **Responsive layout**: Dynamic width/truncation, breakpoint-based diff mode
10. **Stateful UX**: Remembers toggle preferences, recent models/agents, prompt history

For the web UI, we can adopt these patterns with richer interactivity (hover previews, smooth transitions, copy buttons) while maintaining the core principle: **distill the stream to essentials, defer details, animate the active frontier**.

---

## THE CRITICAL PATTERN: Chronological Part Rendering

### How It Actually Works

**The Fundamental Rule**: 
> Iterate through `message.Parts[]` in order (already sorted by ascending ID) and render each part type **as a separate block** in the sequence they arrive.

**The Algorithm** (simplified):

```typescript
const blocks = [];

for (const part of message.parts) {
  if (part.type === "reasoning") {
    if (showThinkingBlocks) {
      blocks.push(renderThinkingBlock(part)); // Bordered "Thinking..." block
    }
  }
  else if (part.type === "tool") {
    if (showToolDetails) {
      blocks.push(renderToolBlock(part)); // Full bordered tool block
    } else if (!hasSeenTextYet) {
      orphanedTools.push(part); // Save for next text part
    }
  }
  else if (part.type === "text") {
    hasSeenTextYet = true;
    const toolsAfterThisText = collectToolsUntilNextText(remainingParts);
    blocks.push(renderTextBlock(part, orphanedTools + toolsAfterThisText));
    orphanedTools = [];
  }
}

return blocks.join("\n\n");
```

### Why This Creates the Clean Interleaved UI

1. **Parts arrive in order**: reasoning₁ → tool₁ → tool₂ → reasoning₂ → tool₃ → text
2. **Each renders as a block**: 
   - reasoning₁ → Thinking block
   - tool₁ → Tool block
   - tool₂ → Tool block
   - reasoning₂ → Thinking block
   - tool₃ → Tool block
   - text → Text block
3. **Result**: Natural "thought process" timeline visible in the UI

### The Two Display Modes

**Mode 1: Full Timeline** (`showThinkingBlocks=true`, `showToolDetails=true`)
- Every part gets its own block
- User sees: think → act → think → act → respond
- **Best for**: Understanding model's decision-making process

**Mode 2: Actions Only** (`showThinkingBlocks=false`, `showToolDetails=true`) - **DEFAULT**
- Reasoning parts skipped
- Tool and text parts render as blocks
- User sees: act → act → respond
- **Best for**: Focused view of what the agent did

**Mode 3: Ultra-Compact** (`showThinkingBlocks=false`, `showToolDetails=false`)
- Reasoning parts skipped
- Tools collected and rendered inline with final text as compact list
- User sees: respond + (∟ act, ∟ act)
- **Best for**: Reviewing completed sessions quickly

### Streaming Animation Strategy

**Only animate the frontier**:
- Last reasoning part without `time.end` → shimmer the "Thinking..." prefix
- Last tool part with `status=pending` or `running` → shimmer the action title
- All completed parts → static (no shimmer, cached)

**Why only the last?**
- Prevents visual chaos (multiple shimmers)
- Indicates current active work
- Older parts fade into history

### The "Orphaned Tool" Problem and Solution

**Problem**: Sometimes tools are called before the model generates explanatory text. If you render them immediately as separate blocks, you get:

```
[tool block 1]
[tool block 2]
[text block explaining what was just done]
```

This feels backwards (actions before explanation).

**Solution**: Collect "orphaned" tools (tools encountered before any text part) and attach them to the next text part:

```typescript
if (part.type === "tool" && !hasSeenTextYet) {
  orphanedTools.push(part);
} else if (part.type === "text") {
  renderText(part, orphanedTools + subsequentTools);
  orphanedTools = [];
}
```

Result:
```
[text block explaining what will be done]
∟ tool 1
∟ tool 2
```

Much more natural.

### Key Takeaway for Web Implementation

**Don't try to group or reorganize parts**. The engine already emits them in the optimal order for display. Just:

1. Iterate parts in ID order
2. Render each type appropriately
3. Animate only the last active item
4. Let the chronological sequence tell the story

The "think → act → think → act → respond" pattern emerges naturally from this simple iteration.

