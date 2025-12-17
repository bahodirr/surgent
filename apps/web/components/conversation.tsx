"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import type { FileDiff } from "@opencode-ai/sdk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { http } from "@/lib/http";
import { MessageCircle, Loader2, RotateCcw, MessagesSquare, Terminal, Plus, History, Check, AlertCircle } from "lucide-react";
import ChatInput, { type FilePart } from "./chat-input";
import TerminalWidget from "./terminal/terminal-widget";
import { useSandbox } from "@/hooks/use-sandbox";
import useAgentStream from "@/lib/use-agent-stream";
import { AgentThread } from "@/components/agent/agent-thread";
import { useSessionsQuery, useCreateSession, useSendMessage, useAbortSession, useRevertMessage, useUnrevert } from "@/queries/chats";
import SessionDiffDialog from "@/components/diff/session-diff-dialog";

export interface ConversationProps {
  projectId?: string;
  initialPrompt?: string;
  onViewChanges?: (diffs: FileDiff[], messageId?: string) => void;
}

type ProviderList = {
  all: Array<{ id: string; models: Record<string, { limit?: { context: number } }> }>;
};

const formatTitle = (title: string) => {
  const isoMatch = title.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (!isoMatch) return title;
  try {
    return format(parseISO(isoMatch[0]), "MMM d HH:mm");
  } catch {
    return title;
  }
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2.5 text-sm border-r transition-colors shrink-0 @md/conversation:gap-2 @md/conversation:px-4",
        active ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
      )}
    >
      {children}
    </button>
  );
}

function ActionButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 px-2.5 text-sm border-l transition-colors shrink-0 @md/conversation:gap-2 @md/conversation:px-4",
        disabled ? "opacity-50 cursor-not-allowed" : "text-muted-foreground hover:bg-muted/50"
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px] text-center px-4">
      <div className="rounded-full bg-muted p-3 sm:p-4 mb-3 sm:mb-4">
        <MessageCircle className="size-6 sm:size-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="font-medium text-sm sm:text-base">No messages yet</p>
      <p className="text-xs sm:text-sm text-muted-foreground">Start a conversation</p>
    </div>
  );
}

export default function Conversation({ projectId, initialPrompt, onViewChanges }: ConversationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const usageRef = useRef<{ ctxTokens: number; contextPct?: number; costSpent: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const stickRef = useRef(true);
  const seededRef = useRef(false);

  const [tab, setTab] = useState<"chat" | "terminal">("chat");
  const [mode, setMode] = useState<"plan" | "build">("build");
  const [diffOpen, setDiffOpen] = useState(false);
  const [revertingId, setRevertingId] = useState<string>();
  const [inputValue, setInputValue] = useState("");
  const lastSentRef = useRef<string>("");

  const sandboxId = useSandbox(s => s.sandboxId || undefined);
  const storedSessionId = useSandbox(s => projectId ? s.activeSessionId[projectId] : undefined);
  const setActiveSession = useSandbox(s => s.setActiveSession);

  const { data: sessions = [] } = useSessionsQuery(projectId);
  const create = useCreateSession(projectId);
  const send = useSendMessage(projectId);
  const abort = useAbortSession();
  const revert = useRevertMessage(projectId);
  const unrevert = useUnrevert(projectId);

  const activeId = (storedSessionId && sessions.some(s => s.id === storedSessionId))
    ? storedSessionId
    : sessions[0]?.id;
  const busy = revert.isPending || unrevert.isPending;
  const { messages, parts, permissions, session, connected, status, loading } = useAgentStream({ projectId, sessionId: activeId });
  const working = status?.type !== undefined && status.type !== "idle";

  // Auto-scroll setup
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    viewportRef.current = viewport;
    const onScroll = () => { stickRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100; };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stickRef.current && viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, permissions.length]);

  // Seed initial prompt: wait for SSE connected, then send
  useEffect(() => {
    if (!initialPrompt || seededRef.current || !activeId || !connected) return;
    const text = initialPrompt.trim();
    if (!text) return;
    seededRef.current = true;
    send.mutate({ sessionId: activeId, text, agent: "plan", model: "gpt-5.2", providerID: "openai" });
    try {
      const params = new URLSearchParams(searchParams?.toString?.() || "");
      if (params.has("initial")) {
        params.delete("initial");
        router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
      }
    } catch {}
  }, [initialPrompt, activeId, connected, pathname, router, searchParams, send]);

  const handleSend = (text: string, files?: FilePart[], model?: string, providerID?: string) => {
    if (!activeId || (!text.trim() && !files?.length) || working) return;
    lastSentRef.current = text.trim();
    setInputValue("");
    send.mutate({ sessionId: activeId, text: text.trim(), agent: mode, files, model, providerID });
  };

  const handleAbort = () => {
    if (!activeId || !projectId) return;
    abort.mutate({ projectId, sessionId: activeId });
    // Restore the last sent message back to the input
    if (lastSentRef.current) {
      setInputValue(lastSentRef.current);
      lastSentRef.current = "";
    }
  };

  const handleRevert = async (messageId: string) => {
    if (!activeId || busy) return;
    setRevertingId(messageId);
    try { await revert.mutateAsync({ sessionId: activeId, messageId }); }
    finally { setRevertingId(undefined); }
  };

  const handleCreate = () =>
    create.mutateAsync().then((s) => s?.id && projectId && setActiveSession(projectId, s.id));

  const activeSession = sessions.find((s) => s.id === activeId);
  const sessionName = formatTitle(session?.title || activeSession?.title || "Untitled");

  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const lastAssistantError = (lastAssistant as any)?.error || (lastAssistant as any)?.info?.error;
  const rawErrorMessage = lastAssistantError?.data?.message || lastAssistantError?.message || lastAssistantError?.name;
  // Skip abort errors (user initiated stop)
  const lastAssistantErrorMessage = rawErrorMessage?.toLowerCase().includes("abort") ? undefined : rawErrorMessage;
  const ctxTokens =
    lastAssistant && "tokens" in lastAssistant ? lastAssistant.tokens.input + lastAssistant.tokens.cache.read : 0;
  const costSpent = assistantMessages.reduce((sum, m) => sum + ("cost" in m ? m.cost : 0), 0);

  const { data: providers } = useQuery<ProviderList>({
    queryKey: ["providers", projectId],
    enabled: Boolean(projectId),
    staleTime: 60_000,
    queryFn: async () => (await http.get(`api/agent/${projectId}/provider`).json()) as ProviderList,
  });

  const contextLimit =
    lastAssistant && "providerID" in lastAssistant && "modelID" in lastAssistant
      ? providers?.all.find((p) => p.id === lastAssistant.providerID)?.models?.[lastAssistant.modelID]?.limit?.context
      : undefined;
  const contextPct = contextLimit ? Math.round((ctxTokens / contextLimit) * 100) : 0;

  useEffect(() => {
    usageRef.current = null;
  }, [activeId]);

  useEffect(() => {
    if (ctxTokens > 0) {
      usageRef.current = {
        ctxTokens,
        contextPct: contextLimit ? contextPct : usageRef.current?.contextPct,
        costSpent,
      };
    }
  }, [ctxTokens, contextPct, contextLimit, costSpent]);

  const shownTokens = usageRef.current?.ctxTokens || (ctxTokens > 0 ? ctxTokens : undefined);
  const shownPct = usageRef.current?.contextPct ?? (contextLimit ? contextPct : undefined);
  const shownCost = usageRef.current?.costSpent ?? costSpent;

  return (
    <div className="flex flex-col h-full w-full min-w-0 @container/conversation">
      {/* Header */}
      <header className="flex flex-col border-b bg-muted/30 shrink-0">
        {/* Tabs + Session + Actions */}
        <div className="flex h-10 items-stretch border-b min-w-0">
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
            <MessagesSquare className="size-4" />
            <span className="hidden @md/conversation:inline">Chat</span>
          </TabButton>
          <TabButton active={tab === "terminal"} onClick={() => setTab("terminal")}>
            <Terminal className="size-4" />
            <span className="hidden @md/conversation:inline">Terminal</span>
          </TabButton>

          <div className="flex-1" />

          <ActionButton onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            <span className="hidden @md/conversation:inline">New session</span>
          </ActionButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center px-2.5 text-sm border-l text-muted-foreground hover:bg-muted/50 @md/conversation:px-4">
                <History className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
              {sessions.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => projectId && setActiveSession(projectId, s.id)} className="gap-2">
                  {s.id === activeId ? <Check className="size-4" /> : <span className="w-4" />}
                  <span className="truncate">{formatTitle(s.title || "Untitled")}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {session?.summary?.diffs?.length ? (
            <div className="flex items-center px-2 @md/conversation:px-4">
              <Button size="sm" variant="outline" onClick={() => setDiffOpen(true)} className="text-xs px-2 @md/conversation:text-sm @md/conversation:px-3">
                <span className="hidden @md/conversation:inline">View </span>Diff
              </Button>
            </div>
          ) : null}
        </div>
        {/* Context stats */}
        <div className="h-8 flex items-center px-3 gap-2 min-w-0 text-xs">
          {connected ? (
            <>
              <span className="font-medium truncate max-w-32 @md/conversation:max-w-64">{sessionName}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground tabular-nums">
                {shownTokens?.toLocaleString() ?? "—"} tokens
                {shownPct !== undefined && <span className="hidden @md/conversation:inline"> / {shownPct}%</span>}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">${shownCost.toFixed(2)}</span>
            </>
          ) : projectId ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Connecting...
            </span>
          ) : null}
        </div>

      </header>

      {/* Chat */}
      {tab === "chat" && (
      <div className="flex flex-col flex-1 min-h-0">
        <div ref={scrollRef} className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="max-w-3xl mx-auto px-2 py-4 @md/conversation:px-4 @md/conversation:py-6 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length ? (
                <AgentThread
                  projectId={projectId}
                  sessionId={activeId!}
                  messages={messages}
                  partsMap={parts}
                  permissions={permissions}
                  onRevert={handleRevert}
                  revertMessageId={session?.revert?.messageID}
                  reverting={busy}
                  revertingMessageId={revertingId}
                  onViewChanges={onViewChanges}
                  isWorking={working}
                />
              ) : (
                <EmptyState />
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input */}
        <div className="px-2 py-2 shrink-0 relative @md/conversation:px-4 @md/conversation:py-4">
          {session?.revert?.messageID && (
            <div className="absolute -top-10 right-2 sm:right-4 z-10">
              <Button
                size="sm"
                variant="outline"
                onClick={() => unrevert.mutate({ sessionId: activeId! })}
                disabled={unrevert.isPending}
                className="bg-background/90 backdrop-blur-sm shadow-sm text-xs @md/conversation:text-sm"
              >
                {unrevert.isPending ? (
                  <><Loader2 className="size-3 sm:size-3.5 mr-1 sm:mr-2 animate-spin" />Restoring...</>
                ) : (
                  <><RotateCcw className="size-3 sm:size-3.5 mr-1 sm:mr-2" />Restore</>
                )}
              </Button>
            </div>
          )}
          <div className="max-w-3xl mx-auto">
            {lastAssistantErrorMessage && (
              <div className="mb-2 px-3 py-2 rounded-lg border bg-muted/50 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-3.5 shrink-0 text-muted-foreground" />
                  <p className="flex-1 min-w-0 text-muted-foreground break-all line-clamp-2">{lastAssistantErrorMessage}</p>
                  <button
                    onClick={handleCreate}
                    disabled={create.isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    {create.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    <span>New session</span>
                  </button>
                </div>
                <p className="text-muted-foreground/50 mt-1 pl-5">or revert your last message</p>
              </div>
            )}
            <ChatInput
              onSubmit={handleSend}
              disabled={!connected || working || busy}
              placeholder={!connected ? "Connecting..." : working ? "Working..." : "Ask anything..."}
              mode={mode}
              onToggleMode={() => setMode(m => m === "plan" ? "build" : "plan")}
              isWorking={working}
              onStop={handleAbort}
              isStopping={abort.isPending}
              value={inputValue}
              onValueChange={setInputValue}
            />
          </div>
        </div>
      </div>
      )}

      {/* Terminal */}
      {tab === "terminal" && (
      <div className="flex-1 min-h-0 p-3">
        <TerminalWidget sandboxId={sandboxId} className="size-full rounded-lg" />
      </div>
      )}

      <SessionDiffDialog open={diffOpen} onOpenChange={setDiffOpen} diffs={session?.summary?.diffs} />
    </div>
  );
}
