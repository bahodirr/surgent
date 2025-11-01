// Lightweight types to mirror OpenCode's event/message/part model for the web app.
// These are intentionally minimal and focused on what our UI needs to render.

export type Role = "user" | "assistant";

export type TimeInfo = {
  created?: number;
  updated?: number;
  completed?: number;
  start?: number;
  end?: number;
};

export type TokenInfo = {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
};

export type SummaryDiff = {
  file: string;
  before: string;
  after: string;
  additions?: number;
  deletions?: number;
};

export type MessageSummary = {
  title?: string;
  body?: string;
  diffs?: SummaryDiff[];
};

export type Session = {
  id: string;
  title?: string;
  time: { updated: number } & Partial<TimeInfo>;
  summary?: { diffs?: SummaryDiff[] };
};

export type BaseMessage = {
  id: string;
  sessionID: string;
  parentID?: string;
  role: Role;
  time: Partial<TimeInfo>;
  tokens?: TokenInfo;
  providerID?: string;
  modelID?: string;
  cost?: number;
  summary?: MessageSummary;
};

export type Message = BaseMessage;
export type AssistantMessage = Message & { role: "assistant" };

export type BasePart = {
  id: string;
  messageID: string;
  sessionID: string;
  time?: Partial<TimeInfo>;
  synthetic?: boolean;
};

export type TextPart = BasePart & {
  type: "text";
  text: string;
};

export type ReasoningPart = BasePart & {
  type: "reasoning";
  text: string;
};

export type StepStartPart = BasePart & {
  type: "step-start";
};

export type StepFinishPart = BasePart & {
  type: "step-finish";
};

export type FilePart = BasePart & {
  type: "file";
  filename?: string;
};

export type PatchPart = BasePart & {
  type: "patch";
};

export type ToolState = {
  status: "pending" | "completed" | "error";
  title?: string;
  input?: Record<string, any>;
  output?: string;
  metadata?: Record<string, any>;
  error?: string;
};

export type ToolPart = BasePart & {
  type: "tool";
  tool: string;
  callID?: string;
  state: ToolState;
};

export type AgentPart = BasePart & { type: "agent" };
export type RetryPart = BasePart & { type: "retry" };

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | FilePart
  | PatchPart
  | AgentPart
  | RetryPart;

export type EventSessionUpdated = {
  type: "session.updated";
  properties: { info: Session };
};

export type EventMessageUpdated = {
  type: "message.updated";
  properties: { info: Message };
};

export type EventMessagePartUpdated = {
  type: "message.part.updated";
  properties: { part: Part };
};

export type Event = EventSessionUpdated | EventMessageUpdated | EventMessagePartUpdated;


