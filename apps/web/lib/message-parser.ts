export interface ParsedMessage {
  role: 'user' | 'assistant' | 'system';
  type: 'message' | 'init' | 'result' | 'error' | 'event' | 'tool' | 'tool_result';
  contentText?: string;
  event?: {
    kind: 'hook';
    name: string;
    status?: 'success' | 'error';
  };
  tool?: {
    name?: string;
    id?: string;
    input?: any;
    result?: any;
    status?: 'completed' | 'error';
    parentId?: string;
  };
  raw?: any;
  _id?: string;
  _creationTime: number;
}

export interface TimelineEntry {
  kind: 'message' | 'systemInit' | 'systemResult' | 'toolGroup';
  msg?: ParsedMessage;
  items?: ParsedMessage[];
  checkpoint?: any;
}

export interface TodoItem {
  id: string;
  text: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ParsedSessionData {
  timeline: TimelineEntry[];
  todos: TodoItem[];
}

export function parseMessages(messages: any[]): ParsedSessionData {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { timeline: [], todos: [] };
  }

  const timeline: TimelineEntry[] = [];

  for (const message of messages) {
    const raw = message.raw;

    if (typeof raw === 'string') {
      // User message
      timeline.push(createUserMessage(message, raw));
      continue;
    }

    const type = raw?.type;
    const subtype = raw?.subtype;

    if (type === 'system') {
      if (subtype === 'init') {
        timeline.push(createSystemInitMessage(message, raw));
      } else if (subtype === 'compact_boundary') {
        continue; // Skip compact boundaries
      }
      continue;
    }

    if (type === 'result') {
      timeline.push(createSystemResultMessage(message, raw, subtype));
      continue;
    }

    // Handle SDK message types (SDKAssistantMessage, SDKUserMessage)
    if (type === 'assistant' || type === 'user') {
      const timelineEntries = parseSDKMessage(message, raw, type);
      timeline.push(...timelineEntries);
      continue;
    }

    // Handle legacy message format (backward compatibility)
    if (type === 'message') {
      const timelineEntries = parseLegacyMessage(message, raw);
      timeline.push(...timelineEntries);
      continue;
    }

    // Handle unknown message types
    timeline.push(createUnknownMessage(message, raw));
  }

  // Extract todos from latest TodoWrite tool
  const latestTodos = extractLatestTodos(timeline);

  // Post-process: merge adjacent tool groups and combine tool_use/result
  const mergedTimeline = mergeToolGroups(timeline);

  return { timeline: mergedTimeline, todos: latestTodos };
}

// Helper to attach commit checkpoints returned from backend to systemResult entries
export function attachCheckpoints(timeline: TimelineEntry[], commits: any[]): TimelineEntry[] {
  if (!Array.isArray(timeline) || timeline.length === 0 || !Array.isArray(commits) || commits.length === 0) {
    return timeline;
  }
  // Build index from messageId -> commit (latest wins if duplicates)
  const byMessageId = new Map<string, any>();
  for (const c of commits) {
    const mid = c?.messageId as string | undefined;
    if (mid) byMessageId.set(mid, c);
  }
  if (byMessageId.size === 0) return timeline;

  // Attach checkpoint where message ids match
  return timeline.map((entry) => {
    if (entry.kind === 'systemResult' && entry.msg?._id) {
      const cp = byMessageId.get(entry.msg._id as string);
      if (cp) {
        return { ...entry, checkpoint: { sha: cp.sha, message: cp.message, stats: cp.stats, metadata: cp.metadata } };
      }
    }
    return entry;
  });
}

function createUserMessage(message: any, raw: string): TimelineEntry {
  return {
    kind: 'message',
    msg: {
      role: 'user',
      type: 'message',
      contentText: raw,
      raw,
      _id: message._id,
      _creationTime: message._creationTime
    }
  };
}

function createSystemInitMessage(message: any, raw: any): TimelineEntry {
  return {
    kind: 'systemInit',
    msg: {
      role: 'system',
      type: 'init',
      raw,
      _id: message._id,
      _creationTime: message._creationTime
    }
  };
}

function createSystemResultMessage(message: any, raw: any, subtype: string): TimelineEntry {
  return {
    kind: 'systemResult',
    msg: {
      role: 'system',
      type: (typeof subtype === 'string' && subtype.startsWith('error')) ? 'error' : 'result',
      raw,
      _id: message._id,
      _creationTime: message._creationTime
    }
  };
}

function parseSDKMessage(message: any, raw: any, type: 'assistant' | 'user'): TimelineEntry[] {
  const role = type;
  const messageContent = raw?.message?.content;

  if (Array.isArray(messageContent)) {
    return parseContentMessage(role, messageContent, message, raw);
  }

  // Handle local command stdout (e.g., /compact) emitted as a plain string
  const contentText = (typeof messageContent === 'string' ? messageContent : (typeof raw?.content === 'string' ? raw.content : undefined));
  if (typeof contentText === 'string' && contentText.includes('<local-command-stdout>')) {
    const stdoutMatch = contentText.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
    if (stdoutMatch) {
      const output = (stdoutMatch[1] ?? '').trim();
      const lower = output.toLowerCase();
      const isCompact = /\bcompacted\b/.test(lower);
      const status: 'success' | 'error' | undefined = (lower.includes('error') || lower.includes('failed')) ? 'error' : isCompact ? 'success' : undefined;
      const event = isCompact ? { kind: 'hook' as const, name: 'compact', status } : undefined;
      return [{
        kind: 'systemResult',
        msg: {
          role: 'system',
          type: 'result',
          contentText: output,
          event,
          raw,
          _id: message._id,
          _creationTime: message._creationTime
        }
      }];
    }
  }

  // No content array, treat as simple text message
  return [{
    kind: 'message',
    msg: {
      role,
      type: 'message',
      contentText: JSON.stringify(raw?.message || raw),
      raw,
      _id: message._id,
      _creationTime: message._creationTime
    }
  }];
}

function parseLegacyMessage(message: any, raw: any): TimelineEntry[] {
  const content = raw?.content || [];
  return parseContentMessage('assistant', content, message, raw);
}

function parseContentMessage(
  defaultRole: ParsedMessage['role'],
  content: any[],
  message: any,
  raw: any
): TimelineEntry[] {
  const timelineEntries: TimelineEntry[] = [];

  const textParts = content.filter((part: any) => part?.type === 'text' && part?.text);
  const toolUses = content.filter((part: any) => part?.type === 'tool_use');
  const toolResults = content.filter((part: any) => part?.type === 'tool_result');

  // Add text messages
  for (const part of textParts) {
    timelineEntries.push({
      kind: 'message',
      msg: {
        role: defaultRole,
        type: 'message',
        contentText: part.text,
        raw,
        _id: message._id,
        _creationTime: message._creationTime
      }
    });
  }

  // Group tool uses and results
  if (toolUses.length > 0 || toolResults.length > 0) {
    const toolItems = createToolItems(toolUses, toolResults, raw, message._creationTime, message._id);
    if (toolItems.length > 0) {
      timelineEntries.push({ kind: 'toolGroup', items: toolItems });
    }
  }

  return timelineEntries;
}

function createToolItems(
  toolUses: any[],
  toolResults: any[],
  raw: any,
  creationTime: number,
  messageId?: string
): ParsedMessage[] {
  const toolItems: ParsedMessage[] = [];

  // Add tool uses
  for (let i = 0; i < toolUses.length; i++) {
    const part = toolUses[i];
    const toolUseId = (typeof part.id === 'string' ? part.id : String(part.id ?? i));
    const stableId = `${messageId ?? 'no-message-id'}:tool_use:${toolUseId}`;

    toolItems.push({
      role: 'assistant',
      type: 'tool',
      tool: {
        name: part.name,
        id: part.id,
        input: part.input,
        parentId: raw.parent_tool_use_id
      },
      raw,
      _id: stableId,
      _creationTime: creationTime
    });
  }

  // Add tool results
  for (let i = 0; i < toolResults.length; i++) {
    const part = toolResults[i];
    const linkId = (typeof part.tool_use_id === 'string' ? part.tool_use_id : String(part.tool_use_id ?? i));
    const stableId = `${messageId ?? 'no-message-id'}:tool_result:${linkId}`;

    toolItems.push({
      role: 'assistant',
      type: 'tool_result',
      tool: {
        id: part.tool_use_id,
        result: part.content,
        status: part.is_error ? 'error' : 'completed',
        parentId: raw.parent_tool_use_id
      },
      raw,
      _id: stableId,
      _creationTime: creationTime
    });
  }

  return toolItems;
}

function createUnknownMessage(message: any, raw: any): TimelineEntry {
  return {
    kind: 'message',
    msg: {
      role: 'system',
      type: 'event',
      contentText: JSON.stringify(raw),
      raw,
      _id: message._id,
      _creationTime: message._creationTime
    }
  };
}

function extractLatestTodos(timeline: TimelineEntry[]): TodoItem[] {
  for (const entry of [...timeline].reverse()) {
    if (entry.kind !== 'toolGroup' || !entry.items?.length) continue;
    const todoTool = entry.items.find(
      (item: ParsedMessage) => item.tool?.name === 'TodoWrite' && Array.isArray(item.tool?.input?.todos)
    );
    if (todoTool && todoTool.tool) {
      const todos = todoTool.tool.input?.todos || [];
      return todos.map((t: any) => ({
        id: t.id,
        text: t.content,
        status: t.status
      }));
    }
  }
  return [];
}

// Merge adjacent toolGroup entries and combine tool_use with matching tool_result
function mergeToolGroups(timeline: TimelineEntry[]): TimelineEntry[] {
  const output: TimelineEntry[] = [];

  // First pass: merge adjacent toolGroup entries
  for (const entry of timeline) {
    if (entry.kind !== 'toolGroup') {
      output.push(entry);
      continue;
    }

    const last = output[output.length - 1];
    if (last && last.kind === 'toolGroup') {
      if (!last.items) last.items = [];
      if (entry.items?.length) last.items.push(...entry.items);
    } else {
      output.push({ kind: 'toolGroup', items: [...(entry.items || [])] });
    }
  }

  // Second pass: within each toolGroup, merge items by tool.id
  for (const entry of output) {
    if (entry.kind !== 'toolGroup' || !entry.items?.length) continue;

    const mergedById: Map<string, ParsedMessage> = new Map();
    const order: string[] = [];

    for (const it of entry.items) {
      const toolId = (it.tool?.id as string | undefined) || `no-id-${order.length}`;
      if (!mergedById.has(toolId)) {
        order.push(toolId);
        mergedById.set(toolId, {
          role: 'assistant',
          type: 'tool',
          tool: {
            name: it.tool?.name,
            id: it.tool?.id,
            input: it.tool?.input,
            result: it.tool?.result,
            status: it.tool?.status,
            parentId: it.tool?.parentId,
          },
          raw: it.raw,
          _creationTime: it._creationTime,
        } as ParsedMessage);
        continue;
      }

      const merged = mergedById.get(toolId)!;
      // Prefer to keep name/input from tool_use, and result/status from tool_result
      merged.tool = merged.tool || {};
      if (it.type === 'tool') {
        if (it.tool?.name) merged.tool.name = it.tool.name;
        if (it.tool?.input !== undefined) merged.tool.input = it.tool.input;
        if (it.tool?.parentId) merged.tool.parentId = it.tool.parentId;
      }
      if (it.type === 'tool_result') {
        if (it.tool?.result !== undefined) merged.tool.result = it.tool.result;
        if (it.tool?.status) merged.tool.status = it.tool.status;
        if (it.tool?.parentId) merged.tool.parentId = it.tool.parentId;
      }
      // Update creation time to earliest
      merged._creationTime = Math.min(merged._creationTime, it._creationTime);
    }

    entry.items = order.map((id) => mergedById.get(id)!);
  }

  return output;
}

// Helper to get min _creationTime for an entry
function getEntryTime(entry: TimelineEntry): number {
  if (entry.kind === 'toolGroup' && entry.items?.length) {
    return Math.min(...entry.items.map(item => item._creationTime));
  }
  return entry.msg?._creationTime ?? 0;
}

// =====================
// Status helpers
// =====================

export type StatusTone = 'default' | 'success' | 'warning' | 'error';

export interface StatusInfo {
  label: string;
  summary?: string;
  isActive?: boolean;
  tone?: StatusTone;
  progress?: { done: number; total: number; percent: number };
  name?: 'thinking' | 'running' | 'done';
  activeToolName?: string;
}

export function computeStatus(timeline?: TimelineEntry[]): StatusInfo | undefined {
  if (!timeline || timeline.length === 0) return undefined;

  const latest = getLatestOfKinds(timeline, ['toolGroup', 'systemResult', 'message']);
  if (!latest) return undefined;

  switch (latest.kind) {
    case 'toolGroup':
      return summarizeToolGroup(latest);
    case 'systemResult': {
      const m = latest.msg as any;
      const summary = formatUsageSummary(m?.raw);
      return { label: 'Completed', name: 'done', summary: summary || undefined, isActive: false };
    }
    case 'message': {
      const role = (latest as any)?.msg?.role;
      if (role === 'user') {
        return { label: 'Thinking...', isActive: true, name: 'thinking', tone: 'default' };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

// Returns the latest entry among the specified kinds by _creationTime
function getLatestOfKinds(timeline: TimelineEntry[], kinds: TimelineEntry['kind'][]): TimelineEntry | undefined {
  const candidates = timeline.filter((e) => kinds.includes(e.kind));
  if (candidates.length === 0) return undefined;
  let latest: TimelineEntry = candidates[0] as TimelineEntry;
  for (let i = 1; i < candidates.length; i++) {
    const entry = candidates[i] as TimelineEntry;
    if (getEntryTime(entry) >= getEntryTime(latest)) {
      latest = entry;
    }
  }
  return latest;
}

// Summarize progress for a toolGroup entry
function summarizeToolGroup(entry: TimelineEntry): StatusInfo {
  const items = entry.items || [];
  const total = items.length;
  const done = items.filter((mm: any) => mm?.tool?.result || mm?.tool?.status === 'completed' || mm?.tool?.status === 'error').length;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  const activeItem = items.find((mm: any) => !(mm?.tool?.result || mm?.tool?.status === 'completed' || mm?.tool?.status === 'error'));
  const activeToolName = activeItem?.tool?.name as string | undefined;
  return {
    label: done < total ? 'Running' : 'Completed',
    name: done < total ? 'running' : 'done',
    summary: total ? `${done}/${total} done` : undefined,
    isActive: done < total,
    progress: total ? { done, total, percent } : undefined,
    activeToolName,
  };
}

export function formatUsageSummary(raw: any): string | undefined {
  if (!raw) return undefined;
  const usage = (raw?.usage || raw?.data?.usage || raw?.result?.usage) as any;
  const inTok = usage?.input_tokens ?? usage?.input ?? usage?.prompt_tokens;
  const outTok = usage?.output_tokens ?? usage?.output ?? usage?.completion_tokens;
  const costUsd = (
    raw?.total_cost_usd ??
    raw?.data?.total_cost_usd ??
    raw?.result?.total_cost_usd ??
    raw?.cost_usd ??
    raw?.data?.cost_usd ??
    raw?.result?.cost_usd
  ) as number | undefined;
  const turns = raw?.num_turns ?? raw?.data?.num_turns ?? raw?.result?.num_turns;
  const bits: string[] = [];
  if (typeof costUsd === 'number') bits.push(`$${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`);
  if (typeof turns === 'number') bits.push(`${turns} turns`);
  if (typeof inTok === 'number' || typeof outTok === 'number') bits.push(`tok ${inTok ?? '-'} / ${outTok ?? '-'}`);
  return bits.join(' • ') || undefined;
}
