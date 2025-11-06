"use client";

import React from "react";
import type { Message, Part, ToolPart, TextPart, ReasoningPart, FileDiff } from "@opencode-ai/sdk";
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
  bash: "Running Shell Command",
  webfetch: "Fetching from the web",
  glob: "Searching Files",
  grep: "Searching Content",
  devLogs: "Viewing Server Logs",
  dev: "Running Development Server",
};

function displayName(name: string) {
  return TOOL_NAMES[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

function toolSubtitle(part: ToolPart) {
  if (part.state.status === "pending") return;
  const i = part.state.input as any;
  if (part.tool === "read" || part.tool === "write" || part.tool === "edit") return i.filePath?.split(/[/\\]/).pop();
  if (part.tool === "list" || part.tool === "glob") return i.path?.split(/[/\\]/).pop();
  if (part.tool === "webfetch") {
    try { return new URL(i.url).hostname; } catch { return i.url; }
  }
  if (part.tool === "bash" || part.tool === "devLogs" || part.tool === "dev") return i.command;
  if (part.tool === "task") return i.description;
  if (part.tool === "grep") return i.pattern;
}

function toolDuration(part: ToolPart) {
  if (part.state.status === "pending" || part.state.status === "running") return;
  const s = Math.floor((part.state.time.end - part.state.time.start) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}` : `${s}s`;
}

function ToolCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = React.useState(false);
  const { status } = part.state;
  const error = status === "error" ? part.state.error : undefined;
  const showDetails = ["bash", "devLogs", "dev"].includes(part.tool);
  const input = part.state.status !== "pending" ? part.state.input : undefined;
  const output = part.state.status === "completed" ? part.state.output : undefined;

  return (
    <div className="px-1 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium wrap-break-word">{displayName(part.tool)}</div>
          {toolSubtitle(part) && <div className="text-[11px] text-muted-foreground truncate break-all">{toolSubtitle(part)}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="text-[10px]">Error</Badge>
              </TooltipTrigger>
              <TooltipContent><span className="text-xs">{String(error)}</span></TooltipContent>
            </Tooltip>
          )}
          {status !== "error" && (
            <Badge variant={status === "completed" ? "secondary" : "outline"} className="text-[10px]">{status}</Badge>
          )}
          {toolDuration(part) && <span className="text-[10px] text-muted-foreground">{toolDuration(part)}</span>}
          {showDetails && (
            <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setOpen(!open)}>
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
      {open && input ? (
        <div className="mt-2 rounded border bg-muted/5 p-2 space-y-2 overflow-hidden">
          <div className="min-w-0">
            <div className="text-[10px] text-muted-foreground mb-1">Input</div>
            <pre className="text-[11px] max-h-40 overflow-auto p-2 rounded border bg-background/50 whitespace-pre-wrap wrap-break-word">
              {(input as { command?: string }).command || JSON.stringify(input, null, 2)}
            </pre>
          </div>
          {output && (
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground mb-1">Output</div>
              <pre className="text-[11px] max-h-40 overflow-auto p-2 rounded border bg-background/50 whitespace-pre-wrap wrap-break-word">
                {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AgentThread({ messages, partsMap }: Props & { messages: Message[]; partsMap: Record<string, Part[]> }) {
  const [groupOpen, setGroupOpen] = React.useState<Record<string, boolean>>({});
  const [messageDiffOpen, setMessageDiffOpen] = React.useState<Record<string, boolean>>({});

  const getUserText = (m: Message) =>
    partsMap[m.id]?.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join("\n") ?? "";

  const groupParts = (parts: Part[]) => {
    const groups: Array<{ kind: 'tool' | 'reasoning' | 'text'; items: Part[] }> = [];
    for (const p of parts) {
      const kind = p.type === 'tool' ? 'tool' : p.type === 'reasoning' ? 'reasoning' : 'text';
      const last = groups[groups.length - 1];
      if (last?.kind === kind) last.items.push(p);
      else groups.push({ kind, items: [p] });
    }
    return groups;
  };

  const userMessages = messages.filter((m) => m.role === "user");

  return (
    <div className="flex flex-col gap-8 w-full min-w-0">
      {userMessages.map((userMsg) => {
        const idx = messages.findIndex((m) => m.id === userMsg.id);
        const nextIdx = messages.slice(idx + 1).findIndex((m) => m.role === "user");
        const end = nextIdx === -1 ? messages.length : idx + 1 + nextIdx;
        const timeline = messages.slice(idx + 1, end)
          .filter((m) => m.role === "assistant")
          .flatMap((m) => partsMap[m.id] || [])
          .filter((p) => p.type === "reasoning" || p.type === "tool" || p.type === "text");

        const groups = groupParts(timeline);
        const userText = getUserText(userMsg);
        const diffs = userMsg.summary?.diffs;

        return (
          <div key={userMsg.id} className="flex flex-col gap-4 w-full min-w-0">
            <div className="rounded-md border bg-muted/20 px-4 py-3 overflow-hidden">
              {userMsg.summary?.title && <div className="text-sm font-medium text-foreground/90 wrap-break-word">{userMsg.summary.title}</div>}
              <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed wrap-break-word">{userText}</div>
            </div>

            <div className="flex flex-col gap-3 w-full min-w-0">
              {groups.map((g, idx) => {
                const key = `${g.kind}:${g.items[0]?.id ?? idx}`;
                
                if (g.kind === 'reasoning') {
                  const text = g.items.map((p) => (p as ReasoningPart).text?.trim()).filter(Boolean).join("\n\n");
                  if (!text) return null;
                  return (
                    <div key={key} className="border-l-2 border-muted-foreground/30 pl-2 overflow-hidden min-w-0">
                      <div className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground wrap-break-word">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                
                if (g.kind === 'tool') {
                  if (g.items.length === 1) {
                    return (
                      <div key={key} className="rounded-md border bg-muted/20 p-2 overflow-hidden">
                        <ToolCard part={g.items[0] as ToolPart} />
                      </div>
                    );
                  }
                  
                  return (
                    <Collapsible key={key} open={groupOpen[key]} onOpenChange={(v) => setGroupOpen({ ...groupOpen, [key]: v })}>
                      <div className="rounded-md border overflow-hidden">
                        <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between bg-muted/20">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">Actions</span>
                            <Badge variant="outline" className="text-[10px]">{g.items.length}</Badge>
                          </div>
                          {groupOpen[key] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-2 border-t space-y-1">
                            {g.items.map((p) => <ToolCard key={p.id} part={p as ToolPart} />)}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                }
                
                const text = g.items.map((p) => (p as TextPart).text?.trim()).filter(Boolean).join("\n\n");
                if (!text) return null;
                return (
                  <div key={key} className="prose prose-sm dark:prose-invert w-full min-w-0 prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:rounded prose-pre:overflow-x-auto prose-code:break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                  </div>
                );
              })}
            </div>

            {diffs && diffs.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                  <div className="min-w-0 flex-1">
                    <DiffSummary diffs={diffs} variant="compact" showBars={false} />
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setMessageDiffOpen({ ...messageDiffOpen, [userMsg.id]: true })}>
                    View Diff
                  </Button>
                </div>
                <Dialog open={messageDiffOpen[userMsg.id]} onOpenChange={(v) => setMessageDiffOpen({ ...messageDiffOpen, [userMsg.id]: v })}>
                  <DialogContent className="max-w-[95vw]! w-[95vw] h-[85vh] flex flex-col">
                    <DialogHeader><DialogTitle>File Changes</DialogTitle></DialogHeader>
                    <DiffViewerWithSidebar  diffs={diffs} className="flex-1 min-h-0" collapseUnchanged={true} contextLines={3} />
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
