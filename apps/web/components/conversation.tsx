"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { MessageCircle, Loader2, RotateCcw, MessagesSquare, Terminal, Plus, History, Check, AlertCircle, X, Zap } from "lucide-react";
import ChatInput, { type FilePart, type ProviderModel } from "./chat-input";
import TerminalWidget from "./terminal/terminal-widget";
import { useSandbox } from "@/hooks/use-sandbox";
import useAgentStream from "@/lib/use-agent-stream";
import { AgentThread } from "@/components/agent/agent-thread";
import { useSessionsQuery, useCreateSession, useSendMessage, useAbortSession, useRevertMessage, useUnrevert } from "@/queries/chats";
import SessionDiffDialog from "@/components/diff/session-diff-dialog";
import ProviderDialog from "@/components/provider-dialog";

export interface ConversationProps {
  projectId?: string;
  initialPrompt?: string;
  onViewChanges?: (diffs: FileDiff[], messageId?: string) => void;
}

type ProviderList = {
  all: Array<{ id: string; models: Record<string, { name?: string; limit?: { context: number } }> }>;
  connected: string[];
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
  "github-copilot": "Copilot",
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

  const usageRef = useRef<{ ctxTokens?: number; contextPct?: number; costSpent: number; contextExceeded?: boolean } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const stickRef = useRef(true);
  const prefilledRef = useRef(false);

  const showTerminal = searchParams?.get("terminal") === "true";
  const [tab, setTab] = useState<"chat" | "terminal">("chat");
  const [mode, setMode] = useState<"plan" | "build">("build");
  const [diffOpen, setDiffOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [revertingId, setRevertingId] = useState<string>();
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] = useState<{ modelId: string; providerId: string }>({ modelId: "gemini-3-flash-preview", providerId: "google" });
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
  const { messages, parts, permissions, session, connected, status, loading, compacting, error: sessionError, dismissError } = useAgentStream({ projectId, sessionId: activeId });
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

  // Prefill initial prompt into the input (don't auto-send)
  useEffect(() => {
    if (!initialPrompt || prefilledRef.current) return;
    const text = initialPrompt.trim();
    if (!text) return;
    if (!inputValue) setInputValue(text);
    prefilledRef.current = true;

    try {
      const params = new URLSearchParams(searchParams?.toString?.() || "");
      if (params.has("initial")) {
        params.delete("initial");
        router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
      }
    } catch {}
  }, [initialPrompt, inputValue, pathname, router, searchParams]);

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

  const isContextLengthExceeded = (err: any) => {
    if (!err) return false;
    const directCode = err.code || err.data?.code;
    if (directCode === "context_length_exceeded") return true;

    const responseBody = err.data?.responseBody ?? err.responseBody;
    if (typeof responseBody === "string" && responseBody) {
      try {
        const body = JSON.parse(responseBody);
        const code =
          body?.code ??
          body?.error?.code ??
          body?.error?.error?.code ??
          body?.error?.data?.code ??
          body?.error?.error?.data?.code;
        if (code === "context_length_exceeded") return true;
        if (body?.type === "error" && body?.error?.code === "context_length_exceeded") return true;
      } catch {}
    }

    const msg = err.data?.message || err.message || err.name;
    return typeof msg === "string" && (msg.toLowerCase().includes("context_length_exceeded") || msg.toLowerCase().includes("context window"));
  };

  const lastAssistantError = (() => {
    const last = assistantMessages[assistantMessages.length - 1];
    const err = (last as any)?.error || (last as any)?.info?.error;
    if (!err) return undefined;
    const code = err.code || err.data?.code;
    const msg = err.data?.message || err.message || err.name;
    if (msg?.toLowerCase().includes("abort")) return undefined;
    const isContext = isContextLengthExceeded(err) || code === "context_length_exceeded" || msg?.includes("context");
    return { message: isContext ? "Context limit reached. Start a new session." : msg, isContext };
  })();

  const { data: providers } = useQuery<ProviderList>({
    queryKey: ["providers", projectId],
    enabled: Boolean(projectId),
    staleTime: 60_000,
    queryFn: async () => (await http.get(`api/agent/${projectId}/provider`).json()) as ProviderList,
  });

  // Transform providers into a flat list of models from connected providers only
  const availableModels = useMemo<ProviderModel[]>(() => {
    if (!providers?.all || !providers.connected) return [];
    
    const models: ProviderModel[] = [];
    for (const provider of providers.all) {
      // Only include models from connected providers
      if (!providers.connected.includes(provider.id)) continue;
      
      for (const [modelId, modelInfo] of Object.entries(provider.models)) {
        models.push({
          id: modelId,
          name: modelInfo.name,
          providerId: provider.id,
          providerName: PROVIDER_LABELS[provider.id] || provider.id,
          limit: modelInfo.limit,
        });
      }
    }
    return models;
  }, [providers]);

  const handleModelChange = (modelId: string, providerId: string) => {
    setSelectedModel({ modelId, providerId });
  };

  // Reset usage cache on session change
  useEffect(() => {
    usageRef.current = null;
  }, [activeId]);

  // Track context tokens from the last COMPLETED assistant message
  // During streaming, we keep showing the previous value to avoid flickering
  useEffect(() => {
    const last = assistantMessages[assistantMessages.length - 1];
    if (!last) return;

    // Calculate total cost (always summing all messages)
    const currentCost = assistantMessages.reduce((sum, m) => sum + ("cost" in m ? m.cost : 0), 0);

    const tokens = "tokens" in last ? last.tokens.input + last.tokens.cache.read : 0;
    const contextExceeded = Boolean(lastAssistantError?.isContext) || isContextLengthExceeded(sessionError);

    if (contextExceeded) {
      usageRef.current = { ctxTokens: undefined, contextPct: undefined, costSpent: currentCost, contextExceeded: true };
      return;
    }

    // Only update tokens if this message has them (implies it's at least partially done)
    if (tokens > 0) {
      let pct = usageRef.current?.contextPct;

      if ("providerID" in last && "modelID" in last) {
        const limit = providers?.all.find((p) => p.id === last.providerID)?.models?.[last.modelID]?.limit?.context;
        if (limit) pct = Math.round((tokens / limit) * 100);
      }

      usageRef.current = {
        ctxTokens: tokens,
        contextPct: pct,
        costSpent: currentCost,
      };
    } else if (usageRef.current) {
      // Just update cost if we have a cache but no new tokens yet
      usageRef.current.costSpent = currentCost;
    }
  }, [assistantMessages, providers, lastAssistantError?.isContext, sessionError]);

  const shownTokens = usageRef.current?.ctxTokens;
  const shownPct = usageRef.current?.contextPct;
  const shownCost = usageRef.current?.costSpent ?? 0;
  const contextExceeded = usageRef.current?.contextExceeded;

  return (
    <div className="flex flex-col h-full w-full min-w-0 @container/conversation">
      {/* Header */}
      <header className="flex flex-col border-b bg-muted/30 shrink-0">
        {/* Tabs + Session + Actions */}
        <div className="flex h-10 items-stretch border-b min-w-0">
          <TabButton active={tab === "chat" || !showTerminal} onClick={() => setTab("chat")}>
            <MessagesSquare className="size-4" />
            <span className="hidden @md/conversation:inline">Chat</span>
          </TabButton>
          {showTerminal && (
            <TabButton active={tab === "terminal"} onClick={() => setTab("terminal")}>
              <Terminal className="size-4" />
              <span className="hidden @md/conversation:inline">Terminal</span>
            </TabButton>
          )}

          <div className="flex-1" />

          <button
            onClick={() => setProviderOpen(true)}
            className="flex items-center gap-1 px-2.5 text-sm border-l transition-colors shrink-0 text-brand hover:bg-brand/10 @md/conversation:gap-2 @md/conversation:px-4"
          >
            <Zap className="size-4" />
            <span className="hidden @md/conversation:inline @lg/conversation:hidden">AI</span>
            <span className="hidden @lg/conversation:inline">AI Connect</span>
          </button>

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
              <span className={`size-2 rounded-full ${connected ? "bg-success" : "bg-warning"}`} title={connected ? "Agent connected" : "Reconnecting..."} />
              <span className="font-medium truncate max-w-32 @md/conversation:max-w-64">{sessionName}</span>
              {compacting || session?.time?.compacting ? (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="size-2.5 animate-spin" />
                    Compacting
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground tabular-nums">
                    {shownTokens?.toLocaleString() ?? "—"} tokens
                    {shownPct !== undefined && !contextExceeded && <span className="hidden @md/conversation:inline"> / {shownPct}%</span>}
                  </span>
                  {contextExceeded ? (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-destructive font-medium">Context exceeded</span>
                    </>
                  ) : null}
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium">{Math.round(shownCost * 100)} credits</span>
                </>
              )}
            </>
          ) : projectId ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Connecting...
            </span>
          ) : null}
        </div>

        {(() => {
          if (!sessionError) return null;
          const err = sessionError as any;
          const msg = err.data?.message || err.message || err.name || String(sessionError);
          if (msg.toLowerCase().includes("abort")) return null;
          const isContext = (err.code || err.data?.code) === "context_length_exceeded" || msg.includes("context");
          return (
            <div className={cn("flex items-center gap-2 px-3 py-1.5 text-xs border-t animate-in slide-in-from-top-1", isContext ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive")}>
              <AlertCircle className="size-3.5 shrink-0" />
              <p className="flex-1 min-w-0 font-medium truncate">{isContext ? "Context limit reached. Start a new session." : msg}</p>
              <button onClick={dismissError} className="p-0.5 rounded transition-colors hover:bg-muted"><X className="size-3" /></button>
            </div>
          );
        })()}

      </header>

      {/* Chat */}
      {(tab === "chat" || !showTerminal) && (
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
            {lastAssistantError && (
              <div className={cn("mb-2 px-3 py-2 rounded-lg border text-xs", lastAssistantError.isContext ? "bg-warning/10 border-warning/20 text-warning" : "bg-muted/50 text-muted-foreground")}>
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-3.5 shrink-0" />
                  <p className="flex-1 min-w-0 break-all line-clamp-2">{lastAssistantError.message}</p>
                  <button onClick={handleCreate} disabled={create.isPending} className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors shrink-0 hover:bg-muted">
                    {create.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    <span>New session</span>
                  </button>
                </div>
                {!lastAssistantError.isContext && <p className="text-muted-foreground/50 mt-1 pl-5">or revert your last message</p>}
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
              models={availableModels}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
          </div>
        </div>
      </div>
      )}

      {/* Terminal */}
      {showTerminal && tab === "terminal" && (
      <div className="flex-1 min-h-0 p-3">
        <TerminalWidget sandboxId={sandboxId} className="size-full rounded-lg" />
      </div>
      )}

      <SessionDiffDialog open={diffOpen} onOpenChange={setDiffOpen} diffs={session?.summary?.diffs} />
      <ProviderDialog open={providerOpen} onOpenChange={setProviderOpen} projectId={projectId} />
    </div>
  );
}
