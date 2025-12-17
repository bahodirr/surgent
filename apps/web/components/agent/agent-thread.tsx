"use client";

import React, { useState, useMemo } from "react";
import type { Message, Part, ToolPart, TextPart, ReasoningPart, FileDiff, FilePart } from "@opencode-ai/sdk";
import { ChevronDown, Undo2, CheckCircle2, Eye, FileText, FilePenLine, Trash2, Terminal, Search, Globe, ListTodo, Play, Loader2, AlertCircle } from "lucide-react";
import { ShimmeringText } from "@/components/ui/shimmer-text";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Markdown } from "@/components/ui/markdown";

// Tool configs
const TOOLS: Record<string, { icon: React.ElementType; done: string; doing: string }> = {
  read: { icon: Eye, done: "Read", doing: "Reading..." },
  write: { icon: FileText, done: "Created", doing: "Creating..." },
  edit: { icon: FilePenLine, done: "Edited", doing: "Editing..." },
  delete: { icon: Trash2, done: "Deleted", doing: "Deleting..." },
  bash: { icon: Terminal, done: "Ran", doing: "Running..." },
  grep: { icon: Search, done: "Searched", doing: "Searching..." },
  glob: { icon: Search, done: "Searched", doing: "Searching..." },
  list: { icon: Search, done: "Listed", doing: "Listing..." },
  webfetch: { icon: Globe, done: "Fetched", doing: "Fetching..." },
  todowrite: { icon: ListTodo, done: "Todos", doing: "Updating..." },
  todoread: { icon: ListTodo, done: "Todos", doing: "Loading..." },
  dev: { icon: Play, done: "Started", doing: "Starting..." },
  devLogs: { icon: Terminal, done: "Logs", doing: "Loading..." },
};

function getTarget(part: ToolPart): string | undefined {
  if (part.state.status === "pending") return;
  const input = part.state.input as Record<string, unknown>;
  if (["read", "write", "edit"].includes(part.tool)) return String(input.filePath || "").split(/[/\\]/).pop();
  if (["bash", "dev"].includes(part.tool)) return String(input.command || "");
  if (part.tool === "grep") return String(input.pattern || "");
  if (part.tool === "glob") return String(input.pattern || "");
  if (part.tool === "list") return String(input.path || "/");
  if (part.tool === "webfetch") try { return new URL(String(input.url)).hostname; } catch { return String(input.url); }
}

// Components
function Tool({ part }: { part: ToolPart }) {
  const cfg = TOOLS[part.tool] || { icon: FileText, done: part.tool, doing: "Working..." };
  const Icon = cfg.icon;
  const target = getTarget(part);
  const running = part.state.status === "running" || part.state.status === "pending";
  const error = part.state.status === "error";

  if (running) return (
    <div className="flex items-center gap-1 sm:gap-1.5 py-0.5 sm:py-1 text-[11px] sm:text-sm text-muted-foreground flex-wrap min-w-0">
      <ShimmeringText text={cfg.doing} duration={0.4} className="text-[11px] sm:text-sm" />
      {target && <code className="px-1 py-0.5 bg-muted rounded text-[10px] sm:text-xs truncate max-w-24 sm:max-w-48">{target}</code>}
    </div>
  );

  if (error) return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="py-0.5 text-[11px] sm:text-xs text-muted-foreground/60 cursor-help truncate">Skipped {target || cfg.done}</div>
      </TooltipTrigger>
      <TooltipContent><p className="text-xs">{part.state.status === "error" ? String(part.state.error) : "Failed"}</p></TooltipContent>
    </Tooltip>
  );

    return (
    <div className="flex items-center gap-1 py-0.5 sm:py-1 text-[11px] sm:text-sm text-muted-foreground flex-wrap min-w-0">
      <Icon className="size-2.5 sm:size-3.5 shrink-0" />
      <span>{cfg.done}</span>
      {target && <code className="px-1 py-0.5 bg-muted rounded text-[10px] sm:text-xs truncate max-w-24 sm:max-w-48">{target}</code>}
      </div>
    );
  }

function Todos({ part }: { part: ToolPart }) {
  const loading = part.state.status === "running" || part.state.status === "pending";
  const todos = useMemo(() => {
    // Read from input.todos (like opencode) for todowrite, fallback to output
    const input = part.state.status !== "pending" ? (part.state.input as Record<string, unknown>) : {};
    if (Array.isArray(input?.todos)) return input.todos;
    if (part.state.status !== "completed") return [];
    try {
      const val = typeof part.state.output === "string" ? JSON.parse(part.state.output) : part.state.output;
      return Array.isArray(val) ? val : [];
    } catch { return []; }
  }, [part.state]);

  const done = todos.filter((t: { status?: string }) => t.status === "completed").length;

  return (
    <div className="my-1.5 sm:my-2 p-2 sm:p-3 rounded-xl bg-muted/50 border w-full min-w-0">
      <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-sm text-muted-foreground mb-1.5 sm:mb-2">
        <ListTodo className="size-3 sm:size-4 shrink-0" />
        <span className="font-medium">{done}/{todos.length} done</span>
        {loading && <Loader2 className="size-2.5 sm:size-3 animate-spin ml-1" />}
      </div>
      {todos.length > 0 ? (
        <div className="space-y-1 sm:space-y-1.5">
          {todos.map((t: { id?: string; content?: string; status?: string }, i: number) => {
            const isDone = t.status === "completed";
              return (
              <div key={t.id || i} className={`flex items-start gap-1 sm:gap-2 text-[11px] sm:text-sm ${isDone ? "opacity-50" : ""}`}>
                <div className={`size-3 sm:size-4 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${isDone ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                  {isDone && <CheckCircle2 className="size-1.5 sm:size-2.5 text-primary-foreground" />}
                </div>
                <span className={`break-words min-w-0 ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.content}</span>
                </div>
              );
            })}
          </div>
      ) : (
        <p className="text-[11px] sm:text-xs text-muted-foreground">No tasks yet</p>
      )}
    </div>
  );
}

function Thinking({ text, streaming, open, toggle }: { text: string; streaming: boolean; open: boolean; toggle: () => void }) {
  return (
    <div className="my-1">
      <button onClick={toggle} className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className={`size-2.5 sm:size-3.5 transition-transform shrink-0 ${open ? "" : "-rotate-90"}`} />
        <span className="font-medium">{streaming ? "Thinking..." : "Thoughts"}</span>
      </button>
      {open && (
        <div className="pl-2 sm:pl-5 pt-1 sm:pt-1.5 text-[11px] sm:text-sm text-muted-foreground border-l-2 border-muted ml-1 sm:ml-1.5 overflow-x-auto min-w-0">
          {text ? <Markdown className="prose prose-sm max-w-none prose-muted [&_*]:text-[11px] sm:[&_*]:text-sm">{text}</Markdown>
            : streaming ? <ShimmeringText text="Thinking..." duration={0.3} /> : null}
        </div>
      )}
        </div>
  );
}

function FileThumb({ file }: { file: FilePart }) {
  const isImage = file.mime?.startsWith("image/");
  return (
    <a href={file.url} target="_blank" rel="noreferrer" download={!isImage ? file.filename : undefined} className="block size-8 sm:size-10 rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity shrink-0">
      {isImage ? (
        <img src={file.url} alt={file.filename || "file"} className="size-full object-cover" />
      ) : (
        <div className="size-full flex items-center justify-center"><FileText className="size-3 sm:size-4 text-muted-foreground" /></div>
      )}
    </a>
  );
}

function Changes({ diffs, onView }: { diffs: FileDiff[]; onView: () => void }) {
  return (
    <div className="mt-1.5 sm:mt-3 p-1.5 sm:p-3 rounded-lg border bg-muted/30 w-full min-w-0">
      <div className="font-medium text-[11px] sm:text-sm mb-1.5 sm:mb-2">Changes</div>
      <div className="space-y-0.5 sm:space-y-1 mb-1.5 sm:mb-3">
        {diffs.map(d => (
          <div key={d.file} className="flex items-center gap-1 text-[11px] sm:text-sm text-muted-foreground flex-wrap min-w-0">
            <div className="size-1 sm:size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
            <span className="shrink-0">{!d.deletions ? "Created" : !d.additions ? "Deleted" : "Edited"}</span>
            <code className="px-1 py-0.5 bg-muted rounded text-[10px] sm:text-xs truncate max-w-[50%] sm:max-w-[60%]">{d.file.split(/[/\\]/).pop()}</code>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={onView} className="text-[11px] sm:text-sm h-7 sm:h-8 px-2 sm:px-3">View Diff</Button>
    </div>
  );
}

function ApiError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 py-1 sm:py-2 text-[11px] sm:text-sm text-destructive min-w-0">
      <AlertCircle className="size-3 sm:size-4 shrink-0" />
      <span className="break-words min-w-0">{message}</span>
    </div>
  );
}

// Main
export function AgentThread({ messages, partsMap, onRevert, revertMessageId, reverting, revertingMessageId, onViewChanges, isWorking }: {
  sessionId: string;
  messages: Message[];
  partsMap: Record<string, Part[]>;
  onRevert?: (id: string) => void;
  revertMessageId?: string;
  reverting?: boolean;
  revertingMessageId?: string;
  onViewChanges?: (diffs: FileDiff[], messageId?: string) => void;
  isWorking?: boolean;
}) {
  const [openThoughts, setOpenThoughts] = useState<Record<string, boolean>>({});

  const visible = revertMessageId ? messages.filter(m => m.id < revertMessageId) : messages;
  const userMessages = visible.filter(m => m.role === "user");

  const getText = (m: Message) => {
    let text = "";
    const fromParts = partsMap[m.id]?.filter((p): p is TextPart => p.type === "text").map(p => p.text).join("\n") ?? "";
    if (fromParts) {
      text = fromParts;
    } else {
      const summary = m.summary;
      if (summary && typeof summary === "object") {
        text = summary.body || summary.title || "";
      }
    }
    // Strip markdown image links from user messages (images shown via FileThumb)
    if (m.role === "user") {
      text = text.replace(/!\[[^\]]*\]\([^)]+\)\n*/g, "").trim();
    }
    return text;
  };
  const getFiles = (m: Message) => partsMap[m.id]?.filter((p): p is FilePart => p.type === "file") ?? [];
  const renderPart = (p: Part) => {
    if (p.type === "reasoning") {
      const text = (p as ReasoningPart).text?.replace("[REDACTED]", "").trim() || "";
      const streaming = !(p as ReasoningPart).time?.end;
      if (!text && !streaming) return null;
      const key = p.id;
      return (
        <Thinking
          key={key}
          text={text}
          streaming={streaming}
          open={openThoughts[key] ?? streaming}
          toggle={() => setOpenThoughts(s => ({ ...s, [key]: !s[key] }))}
        />
      );
    }
    if (p.type === "tool") {
      const toolPart = p as ToolPart;
      // Hide todoread like opencode does
      if (toolPart.tool === "todoread") return null;
      // Render todowrite with Todos component
      if (toolPart.tool === "todowrite") return <Todos key={p.id} part={toolPart} />;
      return <Tool key={p.id} part={toolPart} />;
    }
    if (p.type === "file") return <div key={p.id} className="flex gap-1 py-1"><FileThumb file={p as FilePart} /></div>;
    if (p.type === "step-start" || p.type === "step-finish") return null;
    if (p.type === "patch") return null;
    if (p.type === "text") {
      const content = (p as TextPart).text?.trim();
      if (!content) return null;
      return <Markdown key={p.id} className="prose prose-sm max-w-none dark:prose-invert break-words [&_p]:text-[13px] [&_p]:sm:text-sm [&_li]:text-[13px] [&_li]:sm:text-sm">{content}</Markdown>;
    }
    return null;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {userMessages.map((userMsg, idx) => {
        // Get assistant responses for this user message (use visible to respect revert)
        const msgIdx = visible.findIndex(m => m.id === userMsg.id);
        const nextUserIdx = visible.slice(msgIdx + 1).findIndex(m => m.role === "user");
        const assistants = visible.slice(msgIdx + 1, nextUserIdx === -1 ? undefined : msgIdx + 1 + nextUserIdx).filter(m => m.role === "assistant");
        const timeline = assistants.flatMap(m => partsMap[m.id] || []);

        const text = getText(userMsg);
        const userFiles = getFiles(userMsg);
        const diffs = userMsg.summary?.diffs;
        const isLast = idx === userMessages.length - 1;
        const lastAssistant = assistants[assistants.length - 1];
        const working = isLast && isWorking !== undefined ? isWorking : (lastAssistant && !lastAssistant.time?.completed);
        const showPlanning = isLast && !!working;

        return (
          <div key={userMsg.id} className="space-y-2 sm:space-y-3">
            {/* User bubble */}
            <div className="flex flex-col items-end gap-1">
              {userFiles.length > 0 && (
                <div className="flex gap-1 flex-wrap justify-end">
                  {userFiles.map((fp) => <FileThumb key={fp.id} file={fp} />)}
                </div>
              )}
              <div className="relative max-w-[90%] sm:max-w-[80%] md:max-w-[70%] rounded-xl bg-muted/50 border px-2.5 sm:px-3 py-2 overflow-hidden">
                <div className="whitespace-pre-wrap text-sm sm:text-[15px] pr-5 sm:pr-6 break-all">
                  {text || <span className="text-muted-foreground italic">Sending...</span>}
                </div>
                {onRevert && text && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="absolute top-1 sm:top-1.5 right-1 sm:right-1.5 size-5 sm:size-6 text-muted-foreground/40 hover:text-muted-foreground" onClick={() => onRevert(userMsg.id)} disabled={reverting}>
                        {reverting && revertingMessageId === userMsg.id ? <Loader2 className="size-3 sm:size-3.5 animate-spin" /> : <Undo2 className="size-3 sm:size-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Undo</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Assistant content */}
            <div className="space-y-1 overflow-x-hidden">
              {/* API errors */}
              {assistants.map((m) => {
                const err = (m as any).info?.error;
                if (!err) return null;
                return <ApiError key={m.id} message={err.data?.message || err.name || "Request failed"} />;
              })}

              {timeline.map(renderPart)}

              {showPlanning && (
                <ShimmeringText text="Working..." duration={0.4} className="text-xs sm:text-sm text-muted-foreground py-1" />
              )}
            </div>

            {/* Diffs */}
            {diffs?.length ? (
              isLast && working ? (
                <p className="text-xs text-muted-foreground py-1">{diffs.length} file{diffs.length > 1 ? "s" : ""} changed</p>
              ) : (
                <Changes diffs={diffs} onView={() => onViewChanges?.(diffs, userMsg.id)} />
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
