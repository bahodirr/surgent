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
    id?: string | number;
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

type MessageRecord = {
  raw: unknown;
  _id?: string;
  _creationTime: number;
};

type SdkContentPart =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; id?: string | number; name?: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string | number; content?: unknown; is_error?: boolean };

type SdkMessagePayload = {
  type?: string;
  subtype?: string;
  message?: { content?: SdkContentPart[] | string };
  content?: SdkContentPart[] | string;
  parent_tool_use_id?: string;
  usage?: unknown;
  total_cost_usd?: number;
  num_turns?: number;
  data?: { usage?: unknown; total_cost_usd?: number; cost_usd?: number; num_turns?: number };
  cost_usd?: number;
  result?: {
    usage?: unknown;
    total_cost_usd?: number;
    num_turns?: number;
    cost_usd?: number;
  };
};

export function parseMessages(messages: any[]): ParsedSessionData {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { timeline: [], todos: [] };
  }

  const timeline: TimelineEntry[] = [];

  for (const message of messages as MessageRecord[]) {
    const raw = message?.raw;

    if (typeof raw === 'string') {
      appendTimelineEntries(timeline, createUserMessage(message, raw));
      continue;
    }

    const payload = raw as SdkMessagePayload | undefined;
    const type = payload?.type;
    const subtype = payload?.subtype;

    if (type === 'system') {
      if (subtype === 'init') {
        appendTimelineEntries(timeline, createSystemInitMessage(message, payload));
      }
      continue;
    }

    if (type === 'result') {
      appendTimelineEntries(timeline, createSystemResultMessage(message, payload, subtype));
      continue;
    }

    if (type === 'assistant' || type === 'user') {
      appendTimelineEntries(timeline, parseSDKMessage(message, payload, type));
      continue;
    }

    if (type === 'message') {
      appendTimelineEntries(timeline, parseLegacyMessage(message, payload));
      continue;
    }

    appendTimelineEntries(timeline, createUnknownMessage(message, payload));
  }

  const latestTodos = extractLatestTodos(timeline);

  return { timeline, todos: latestTodos };
}

function appendTimelineEntries(target: TimelineEntry[], entries?: TimelineEntry | TimelineEntry[]): void {
  if (!entries) return;
  const list = Array.isArray(entries) ? entries : [entries];

  for (const entry of list) {
    if (!entry) continue;

    if (entry.kind === 'toolGroup') {
      const incoming = entry.items?.map(normalizeToolItem) ?? [];
      if (incoming.length === 0) continue;

      const last = target[target.length - 1];
      if (last?.kind === 'toolGroup') {
        last.items = mergeToolItems(last.items ?? [], incoming);
      } else {
        target.push({ kind: 'toolGroup', items: incoming });
      }
      continue;
    }

    target.push(entry);
  }
}

function normalizeToolItem(item: ParsedMessage): ParsedMessage {
  const tool = { ...(item.tool ?? {}) };
  return {
    ...item,
    type: 'tool',
    tool,
  };
}

function mergeToolItems(existing: ParsedMessage[], incoming: ParsedMessage[]): ParsedMessage[] {
  if (existing.length === 0) return incoming.map(normalizeToolItem);

  const merged = existing.map(normalizeToolItem);

  for (const next of incoming.map(normalizeToolItem)) {
    const toolId = next.tool?.id;
    if (toolId === undefined || toolId === null) {
      merged.push(next);
      continue;
    }

    const index = merged.findIndex((candidate) => candidate.tool?.id === toolId);
    if (index === -1) {
      merged.push(next);
      continue;
    }

    const existing = merged[index];
    if (!existing) {
      merged.push(next);
      continue;
    }

    merged[index] = mergeToolItem(existing, next);
  }

  return merged;
}

function mergeToolItem(base: ParsedMessage, incoming: ParsedMessage): ParsedMessage {
  const baseTool = base.tool ?? {};
  const incomingTool = incoming.tool ?? {};

  const mergedTool = {
    ...baseTool,
    id: incomingTool.id ?? baseTool.id,
    name: baseTool.name ?? incomingTool.name,
    input: baseTool.input ?? incomingTool.input,
    result: incomingTool.result ?? baseTool.result,
    status: incomingTool.status ?? baseTool.status,
    parentId: incomingTool.parentId ?? baseTool.parentId,
  };

  return {
    ...base,
    type: 'tool',
    raw: incomingTool.result !== undefined ? incoming.raw : base.raw,
    tool: mergedTool,
    _creationTime: Math.min(base._creationTime, incoming._creationTime),
    _id: base._id ?? incoming._id,
  };
}

function buildStableToolId(messageId: string | undefined, key: string): string {
  return `${messageId ?? 'no-message-id'}:tool:${key}`;
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

function createUserMessage(message: MessageRecord, raw: string): TimelineEntry {
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

function createSystemInitMessage(message: MessageRecord, raw: SdkMessagePayload | undefined): TimelineEntry {
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

function createSystemResultMessage(
  message: MessageRecord,
  raw: SdkMessagePayload | undefined,
  subtype: string | undefined
): TimelineEntry {
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

function parseSDKMessage(message: MessageRecord, raw: SdkMessagePayload | undefined, role: 'assistant' | 'user'): TimelineEntry[] {
  // Agent SDK may place content under raw.message.content OR raw.content
  const messageContent = raw?.message?.content ?? raw?.content;

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

  // No content array, treat as simple text message if string; otherwise stringify
  const simpleText = typeof messageContent === 'string'
    ? messageContent
    : JSON.stringify(raw?.message || raw);

  return [{
    kind: 'message',
    msg: {
      role,
      type: 'message',
      contentText: simpleText,
      raw,
      _id: message._id,
      _creationTime: message._creationTime
    }
  }];
}

function parseLegacyMessage(message: MessageRecord, raw: SdkMessagePayload | undefined): TimelineEntry[] {
  const content = Array.isArray(raw?.content) ? raw?.content : [];
  return parseContentMessage('assistant', content, message, raw);
}

function parseContentMessage(
  defaultRole: ParsedMessage['role'],
  content: SdkContentPart[],
  message: MessageRecord,
  raw: SdkMessagePayload | undefined
): TimelineEntry[] {
  const timelineEntries: TimelineEntry[] = [];

  const textParts = content.filter((part): part is Extract<SdkContentPart, { type: 'text' }> => part?.type === 'text' && !!part?.text);
  const toolUses = content.filter((part): part is Extract<SdkContentPart, { type: 'tool_use' }> => part?.type === 'tool_use');
  const toolResults = content.filter((part): part is Extract<SdkContentPart, { type: 'tool_result' }> => part?.type === 'tool_result');

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
  toolUses: Extract<SdkContentPart, { type: 'tool_use' }>[],
  toolResults: Extract<SdkContentPart, { type: 'tool_result' }>[],
  raw: SdkMessagePayload | undefined,
  creationTime: number,
  messageId?: string
): ParsedMessage[] {
  if (toolUses.length === 0 && toolResults.length === 0) return [];

  const byKey = new Map<string, ParsedMessage>();
  const order: string[] = [];
  // Agent SDK may propagate parent tool id on root payload
  const parentId = typeof raw?.parent_tool_use_id === 'string' ? raw.parent_tool_use_id : undefined;

  const ensureItem = (key: string): ParsedMessage => {
    const existing = byKey.get(key);
    if (existing) return existing;

    const entry: ParsedMessage = normalizeToolItem({
      role: 'assistant',
      type: 'tool',
      tool: parentId !== undefined ? { parentId } : {},
      raw,
      _id: buildStableToolId(messageId, key),
      _creationTime: creationTime,
    });

    byKey.set(key, entry);
    order.push(key);
    return entry;
  };

  const makeKey = (value: unknown, index: number, prefix: string): { key: string; id?: string | number } => {
    if (value === undefined || value === null || value === '') {
      return { key: `${prefix}-${index}` };
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return { key: String(value), id: value };
    }
    return { key: String(value) };
  };

  toolUses.forEach((part, index) => {
    const { key, id } = makeKey(part.id, index, 'use');
    const item = ensureItem(key);
    const tool = { ...(item.tool ?? {}) };

    if (id !== undefined) tool.id = id;
    if (part.name !== undefined) tool.name = part.name;
    if (part.input !== undefined) tool.input = part.input;
    if (parentId !== undefined) tool.parentId = parentId;

    item.tool = tool;
  });

  toolResults.forEach((part, index) => {
    const { key, id } = makeKey(part.tool_use_id, index, 'result');
    const item = ensureItem(key);
    const tool = { ...(item.tool ?? {}) };

    if (id !== undefined) tool.id = id;
    if (part.content !== undefined) tool.result = part.content;
    if (typeof part.is_error === 'boolean') {
      tool.status = part.is_error ? 'error' : 'completed';
    }
    if (parentId !== undefined && tool.parentId === undefined) {
      tool.parentId = parentId;
    }

    item.tool = tool;
  });

  return order.map((key) => normalizeToolItem(byKey.get(key)!));
}

function createUnknownMessage(message: MessageRecord, raw: unknown): TimelineEntry {
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
