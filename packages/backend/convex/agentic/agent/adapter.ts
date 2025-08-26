export type AgentAdapterType = "claude" | "codex" | "opencode" | "gemini" | "grok" | "openai";

export type NormalizedTool = {
  name?: string;
  id?: string;
  input?: any;
  result?: any;
  status?: "success" | "error";
  parentId?: string;
};

export type NormalizedMessage = {
  role:  "system" | "user" | "assistant";
  type: "message" | "reasoning" | "result" | "metrics" | "event" | "init" | "error" | "tool" | "tool_result";
  contentText?: string;
  tool?: NormalizedTool;
  raw: any;
};

function normalizeClaudeParts(parts: any[], roleGuess: NormalizedMessage["role"], raw: any): NormalizedMessage[] {
  const out: NormalizedMessage[] = [];
  for (const part of parts) {
    if (part.type === "text" && part.text) {
        out.push({ role: roleGuess, type: "message", contentText: part.text, raw });
      continue;
    }
    if (part.type === "tool_use") {
      out.push({ role: "assistant", type: "tool", tool: { name: part.name, id: part.id, input: part.input, parentId: raw.parent_tool_use_id }, raw });
      continue;
    }
    if (part.type === "tool_result") {
      out.push({ role: "assistant", type: "tool_result", tool: { id: part.tool_use_id, result: part.content, status: part.is_error ? "error" : "success", parentId: raw.parent_tool_use_id }, raw });
      continue;
    }
  }
  return out;
}

function normalizeClaude(raw: any): NormalizedMessage[] {
  const type = raw.type;
  const subtype = raw.subtype;

  if (type === "system" && subtype === "init") return [{ role: "system", type: "init", raw }];
  if (type === "result") return [{ role: "system", type: (typeof subtype === "string" && subtype.startsWith("error")) ? "error" : "result", raw }];

  const message = raw.message;
  const content = message.content;
  
  return normalizeClaudeParts(content, "assistant", raw);
}

export function normalizeAgentMessage(
  agent: AgentAdapterType,
  raw: any
): NormalizedMessage[] {
  try {
    switch (agent) {
      case "claude":
        return normalizeClaude(raw);
      case "openai":
      case "opencode":
      case "gemini":
      default:
        return [{ role: "assistant", type: "event", raw }];
    }
  } catch {
    return [{ role: "assistant", type: "error", raw }];
  }
}


