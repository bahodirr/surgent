"use client";

import React from "react";
import type { Message, Part, ToolPart, TextPart, ReasoningPart } from "@opencode-ai/sdk";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";
import DiffSummary from "@/components/diff/diff-summary";
import DiffViewerWithSidebar from "@/components/diff/diff-viewer-with-sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = { sessionId: string };

const TOOL_NAMES: Record<string, string> = {
  bash: "Shell",
  webfetch: "Fetch",
  glob: "Glob",
  grep: "Search",
};

function displayName(name: string) {
  return TOOL_NAMES[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

function toolSubtitle(part: ToolPart) {
  if (part.state.status === "pending") return undefined;
  const i = part.state.input as Record<string, any>;
  if (part.tool === "read") return i.filePath?.split(/[/\\]/).pop();
  if (part.tool === "write" || part.tool === "edit") return i.filePath;
  if (part.tool === "list" || part.tool === "glob") return i.path;
  if (part.tool === "webfetch") return i.url;
  if (part.tool === "bash") return i.command;
  if (part.tool === "task") return i.description;
  if (part.tool === "grep") return [i.path, i.pattern].filter(Boolean).join(" ");
}

const isToolPart = (p: Part): p is ToolPart => p.type === "tool";
const isReasoningPart = (p: Part): p is ReasoningPart => p.type === "reasoning";

function toolDuration(part: ToolPart) {
  if (part.state.status === "pending" || part.state.status === "running") return undefined;
  const ms = part.state.time.end - part.state.time.start;
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}` : `${s}s`;
}

function ToolCard({ part }: { part: ToolPart }) {
  const status = part.state.status;
  const title = status === "pending" ? `${displayName(part.tool)}…` : displayName(part.tool);
  const subtitle = toolSubtitle(part);
  const error = part.state.status === "error" ? part.state.error : undefined;
  const duration = toolDuration(part);

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground/80">{title}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {error ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive" className="text-[10px]">Error</Badge>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>
              <span className="max-w-xs block whitespace-pre-wrap text-left text-xs">
                {String(error).replace("Error: ", "")}
              </span>
            </TooltipContent>
          </Tooltip>
        ) : status && (
          <Badge variant={status === "completed" ? "secondary" : "outline"} className="text-[10px]">
            {status}
          </Badge>
        )}
        {duration && <span className="text-[10px] text-muted-foreground tabular-nums">{duration}</span>}
      </div>
    </div>
  );
}

export function AgentThread({ sessionId, messages, partsMap }: Props & { messages: Message[]; partsMap: Record<string, Part[]> }) {
  const userMessages = messages.filter((m) => m.role === "user");
  const [groupOpen, setGroupOpen] = React.useState<Record<string, boolean>>({});
  const [messageDiffOpen, setMessageDiffOpen] = React.useState<Record<string, boolean>>({});

  const getUserText = (m: Message) =>
    partsMap[m.id]?.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join("\n") ?? "";

  const groupParts = (parts: Part[]) => {
    const groups: Array<{ kind: 'tool' | 'reasoning' | 'text'; items: Part[] }> = [];
    for (const p of parts) {
      const kind = isToolPart(p) ? 'tool' : isReasoningPart(p) ? 'reasoning' : 'text';
      const last = groups.at(-1);
      if (last?.kind === kind) {
        last.items.push(p);
      } else {
        groups.push({ kind, items: [p] });
      }
    }
    return groups;
  };

  return (
    <div className="flex flex-col gap-8">
      {userMessages.map((userMsg) => {
        const i = messages.findIndex((m) => m.id === userMsg.id);
        const nextUserIdx = messages.slice(i + 1).findIndex((m) => m.role === "user");
        const end = nextUserIdx === -1 ? messages.length : i + 1 + nextUserIdx;
        const assistants = messages.slice(i + 1, end).filter((m) => m.role === "assistant");

        const timeline = assistants
          .flatMap((m) => partsMap[m.id] || [])
          .filter((p) => p.type === "reasoning" || p.type === "tool" || p.type === "text");

        const groups = groupParts(timeline);
        const userText = getUserText(userMsg);

        return (
          <div key={userMsg.id} className="flex flex-col gap-4">
            <div className="rounded-md border bg-muted/20 px-4 py-3">
              {userMsg.summary?.title ? (
                <>
                  <div className="text-sm font-medium text-foreground/90">{userMsg.summary.title}</div>
                  <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{userText}</div>
                </>
              ) : (
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{userText}</div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {groups.map((g, idx) => {
                const key = `${g.kind}:${g.items[0]?.id ?? idx}`;
                if (g.kind === 'reasoning') {
                  const text = g.items.map((p) => (p as ReasoningPart).text?.trim()).filter(Boolean).join("\n\n");
                  if (!text) return null;
                  return (
                    <div key={key} className="border-l-2 border-muted-foreground/30 pl-2">
                      <div className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                if (g.kind === 'tool') {
                  const open = groupOpen[key] ?? false;
                  return (
                    <Collapsible key={key} open={open} onOpenChange={(v) => setGroupOpen((prev) => ({ ...prev, [key]: v }))}>
                      <div className="rounded-md border overflow-hidden">
                        <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between bg-muted/20">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">Actions</span>
                            <Badge variant="outline" className="text-[10px]">{g.items.length}</Badge>
                          </div>
                          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-2 border-t space-y-1">
                            {g.items.map((p) => (
                              <ToolCard key={p.id} part={p as ToolPart} />
                            ))}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                }
                const text = g.items.map((p) => (p as TextPart).text?.trim()).filter(Boolean).join("\n\n");
                if (!text) return null;
                return (
                  <div key={key} className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:rounded">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                  </div>
                );
              })}
            </div>

            {userMsg.summary?.diffs && userMsg.summary.diffs.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <DiffSummary diffs={userMsg.summary.diffs} variant="compact" showBars={false} />
                  <Button size="sm" variant="outline" onClick={() => setMessageDiffOpen((p) => ({ ...p, [userMsg.id]: true }))}>
                    View Diff
                  </Button>
                </div>
                <Dialog open={!!messageDiffOpen[userMsg.id]} onOpenChange={(v) => setMessageDiffOpen((p) => ({ ...p, [userMsg.id]: v }))}>
                  <DialogContent className="!max-w-[95vw] sm:!max-w-[95vw] h-[85vh]">
                    <DialogHeader>
                      <DialogTitle>File Changes</DialogTitle>
                    </DialogHeader>
                    <DiffViewerWithSidebar diffs={userMsg.summary.diffs} className="flex-1 min-h-0" />
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
