"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronDown, PlayCircle, AlertCircle, GitCommit } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useMutation, useQuery } from "convex/react";
import { api, Id } from "@repo/backend";
import { parseMessages, attachCheckpoints } from "@/lib/message-parser";
import ChatInput from "./chat-input";

interface ConversationProps {
  projectId?: string;
}

export default function Conversation({ projectId }: ConversationProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<Id<'sessions'> | undefined>();
  const [isSending, setIsSending] = useState(false);
  const [openToolItems, setOpenToolItems] = useState<Record<string, boolean>>({});

  const sessions = useQuery(api.sessions.listSessionsByProject, projectId ? { projectId: projectId as Id<'projects'> } : 'skip');
  const messages = useQuery(api.sessions.listMessagesBySession, sessionId ? { sessionId, limit: 200 } : 'skip');
  const commits = useQuery(api.commits.listBySession, sessionId ? { sessionId } : 'skip');
  const createAndRun = useMutation(api.sessions.createMessageAndRunAgent);

  const { timeline, todos } = parseMessages(Array.isArray(messages) ? messages : []);
  const timelineWithCheckpoints = Array.isArray(commits) ? attachCheckpoints(timeline, commits) : timeline;

  const handleSend = async (text: string) => {
    if (!text.trim() || !projectId || !sessionId || isSending) return;
    setIsSending(true);
    try {
      await createAndRun({ projectId: projectId as Id<'projects'>, prompt: text, sessionId });
    } catch {}
    setIsSending(false);
  };

  useEffect(() => {
    if (!sessions?.length) return;
    if (!sessionId || !sessions.some((s) => s._id === sessionId)) {
      setSessionId(sessions[0]!._id as Id<'sessions'>);
    }
  }, [sessions, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [timeline?.length]);

  const preClamp = "bg-gray-100 p-2 rounded text-[10px] font-mono overflow-auto max-h-48 whitespace-pre-wrap break-words break-all";
  const isDisabled = !projectId || !sessionId || isSending;
  const placeholder = !projectId ? "Select a project to start" : !sessionId ? "Preparing session..." : "Ask anything...";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="mb-2 flex items-center gap-2 px-6 py-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Session</span>
        <select
          className="text-sm border rounded px-2 py-1 bg-background"
          value={sessionId || ''}
          onChange={(e) => setSessionId(e.target.value as Id<'sessions'>)}
          disabled={!sessions?.length}
        >
          {sessions?.map((s) => (
            <option key={s._id} value={s._id}>
              {s.title || new Date(s._creationTime).toLocaleString()}
            </option>
          ))}
        </select>
      </div>
      <ScrollArea className={cn(
        "flex-1 min-h-0 p-6",
        "[&_[data-slot='scroll-area-scrollbar']]:w-1.5 [&_[data-slot='scroll-area-scrollbar']]:border-l-0",
        "[&_[data-slot='scroll-area-scrollbar'][data-orientation='horizontal']]:h-1.5"
      )}>
        <div className="p-2 space-y-2">
          {!timelineWithCheckpoints?.length && (
            <div className="text-xs text-muted-foreground">No messages yet. Ask something to get started.</div>
          )}

          {timelineWithCheckpoints?.map((entry, idx) => {
            if (entry.kind === "toolGroup") {
              const items = entry.items;
              const ts = items?.[0]?._creationTime ? new Date(items[0]._creationTime) : undefined;
              const key = `tool-group-${idx}-${items?.length ?? 0}`;
              const hasRunning = items?.some((m) => !m.tool?.result && m.tool?.status !== "error") ?? false;

              return (
                <div key={key} className="flex justify-start">
                  <div className="max-w-full p-2 rounded border bg-background w-full space-y-1">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span className={cn("inline-flex h-3 w-3 border-2 border-current border-t-transparent rounded-full", hasRunning && "animate-spin")} />
                      <span className="font-medium text-foreground">{items?.length ?? 0} tool{(items?.length ?? 0) > 1 ? "s" : ""}</span>
                      {ts && <span>• {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>

                    {items?.map((mm, j) => {
                      const status = mm.tool?.status;
                      const label = status === "error" ? "error" : mm.tool?.result ? "completed" : mm.tool?.input ? "running" : "processing";
                      const itemKey = `${key}-${j}`;
                      const itemOpen = openToolItems[itemKey!] ?? false;

                      return (
                        <div key={`tool-${idx}-${j}`} className="rounded border bg-white/60">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between px-2 py-1 text-xs"
                            onClick={() => setOpenToolItems((s) => ({ ...s, [itemKey]: !itemOpen }))}
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                label === "completed" && "bg-green-500",
                                label === "error" && "bg-red-500",
                                label !== "completed" && label !== "error" && "bg-yellow-500"
                              )} />
                              <span className="font-mono">{mm.tool?.name || "tool"}</span>
                              <span className="text-muted-foreground">• {label}</span>
                            </div>
                            <ChevronDown size={12} className={cn("text-muted-foreground transition-transform", itemOpen && "rotate-180")} />
                          </button>

                          {itemOpen && (
                            <div className="px-2 pb-2 max-h-60 overflow-auto space-y-2">
                              {mm.tool?.input && (
                                <>
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">input</div>
                                  <pre className={preClamp}>{JSON.stringify(mm.tool.input, null, 2)}</pre>
                                </>
                              )}
                              {mm.tool?.result && (
                                <>
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">result</div>
                                  <pre className={preClamp}>{JSON.stringify(mm.tool.result, null, 2)}</pre>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (entry.kind === "systemInit" || entry.kind === "systemResult") {
              const m = entry.msg;
              const ts = m?._creationTime ? new Date(m._creationTime) : undefined;
              const key = m?._id || `${idx}-${m?._creationTime || Date.now()}`;

              const systemTypes = {
                init: { icon: PlayCircle, label: "Session started" },
                error: { icon: AlertCircle, label: "Conversation error" },
                result: { icon: Check, label: /compacted/i.test(m?.contentText || "") ? "Compacted" : "Conversation completed" },
              };
              const sysKey = (m?.type as 'init' | 'error' | 'result') ?? 'result';
              const { icon: Icon, label } = systemTypes[sysKey] || { icon: Check, label: "Completed" };

              return (
                <div key={key} className="flex flex-col items-center my-2">
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-px bg-muted flex-1" />
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] text-muted-foreground bg-muted/30 border-muted/30">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="font-medium text-foreground/80">{label}</span>
                      {ts && <span className="text-muted-foreground/70">• {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                    <div className="h-px bg-muted flex-1" />
                  </div>

                  {entry.kind === "systemResult" && m && m.contentText?.trim() && (
                    <div className="mt-2 w-full max-w-[720px] rounded border bg-white/60 p-2">
                      {(() => {
                        const mm = m!;
                        const isHook = mm?.event?.kind === "hook";
                        const isCompact = isHook && mm?.event?.name === "compact";
                        const tone = mm?.event?.status === "error" ? "text-red-600" : "text-green-700";
                        return (
                          <div className="space-y-1">
                            {isHook && (
                              <div className={cn("inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[10px] border", isCompact ? "bg-green-50 border-green-200" : "bg-muted/30 border-muted/30")}>
                                <span className={cn("font-medium", tone)}>{mm.event?.name}</span>
                                {mm?.event?.status && <span className="text-muted-foreground">• {mm.event.status}</span>}
                              </div>
                            )}
                            <div className="text-[11px] text-foreground/80 whitespace-pre-wrap break-words">{mm.contentText}</div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {m?.type === "result" && m?.raw && (() => {
                    const usage = m.raw?.usage || m.raw?.data?.usage || m.raw?.result?.usage || {};
                    const inTok = usage.input_tokens ?? usage.input ?? usage.prompt_tokens;
                    const outTok = usage.output_tokens ?? usage.output ?? usage.completion_tokens;
                    const dur = m.raw?.duration_ms ?? m.raw?.data?.duration_ms ?? m.raw?.result?.duration_ms;
                    const turns = m.raw?.num_turns ?? m.raw?.data?.num_turns ?? m.raw?.result?.num_turns;

                    return (inTok || outTok || dur || turns) ? (
                      <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-2">
                        {(inTok || outTok) && <span>tokens: {inTok ?? "-"} / {outTok ?? "-"}</span>}
                        {dur && <span>{Math.round(dur / 1000)}s</span>}
                        {turns && <span>{turns} turns</span>}
                      </div>
                    ) : null;
                  })()}

                  {entry.kind === "systemResult" && entry.checkpoint && (() => {
                    const cp = entry.checkpoint;
                    const sha = (cp?.sha || "").slice(0, 7);
                    const { filesChanged, additions, deletions } = cp?.stats || {};
                    
                    return (
                      <div className="mt-2 w-full max-w-[720px] rounded border bg-white/60 p-2 text-[11px]">
                        <div className="flex items-center gap-2 text-foreground">
                          <GitCommit className="h-3.5 w-3.5" />
                          <span className="font-medium">Checkpoint</span>
                          {sha && <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">{sha}</code>}
                        </div>
                        {cp?.message && <div className="mt-1 text-muted-foreground">{cp.message}</div>}
                        {(filesChanged || additions || deletions) && (
                          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-3">
                            {filesChanged && <span>{filesChanged} files</span>}
                            {(additions || deletions) && (
                              <span>
                                {additions && <span className="text-green-600">+{additions}</span>}
                                {additions && deletions && " / "}
                                {deletions && <span className="text-red-600">-{deletions}</span>}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            }

            const m = entry.msg;
            if (!m) return null;
            const key = m._id || `${idx}-${m._creationTime || Date.now()}`;
            const content = m.contentText || (typeof m.raw === "string" ? m.raw : undefined);
            const isUser = (m.role || "system") === "user";

            return (
              <div key={key} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                <div className="max-w-full rounded border bg-background p-2 min-w-0">
                  <div className="text-sm markdown-content break-words" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {content ? (
                      <ReactMarkdown components={{
                        code: ({ children, ...props }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono break-words break-all" {...props}>{children}</code>,
                        pre: ({ children }) => <pre className={preClamp}>{children}</pre>,
                      }}>{content}</ReactMarkdown>
                    ) : (
                      <pre className={preClamp}>{JSON.stringify(m?.raw ?? {}, null, 2)}</pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <ChatInput onSubmit={handleSend} disabled={isDisabled} placeholder={placeholder} todos={todos} timeline={timelineWithCheckpoints} />
    </div>
  );
}
