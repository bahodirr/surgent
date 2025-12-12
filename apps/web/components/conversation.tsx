"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FileDiff } from "@opencode-ai/sdk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageCircle, Loader2, RotateCcw, MessagesSquare, Terminal, Plus, ChevronDown, WifiOff, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

export default function Conversation({ projectId, initialPrompt, onViewChanges }: ConversationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const stickRef = useRef(true);
  const seededRef = useRef(false);

  const [tab, setTab] = useState<"chat" | "terminal">("chat");
  const [mode, setMode] = useState<"plan" | "build">("build");
  const [diffOpen, setDiffOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [revertingId, setRevertingId] = useState<string>();
  const [aborted, setAborted] = useState(false);

  // Queries & mutations
  const sandboxId = useSandbox(s => s.sandboxId || undefined);
  const setConnected = useSandbox(s => s.setConnected);
  const { data: sessions = [] } = useSessionsQuery(projectId);
  const create = useCreateSession(projectId);
  const send = useSendMessage(projectId);
  const abort = useAbortSession();
  const revert = useRevertMessage(projectId);
  const unrevert = useUnrevert(projectId);

  const activeId = sessionId || sessions[0]?.id;
  const busy = revert.isPending || unrevert.isPending;
  const { messages, parts, session, lastAt, connected } = useAgentStream({ projectId, sessionId: activeId });

  const working = useMemo(() => {
    if (aborted) return false;
    const last = messages[messages.length - 1];
    return last?.role === "assistant" && !last.time?.completed && Date.now() - (lastAt || 0) <= 15000;
  }, [messages, lastAt, aborted]);

  // Sync connected state to store for preview panel
  useEffect(() => {
    setConnected(connected);
  }, [connected, setConnected]);

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
  }, [messages.length]);

  // Seed initial prompt
  useEffect(() => {
    if (!initialPrompt || seededRef.current || !activeId || messages.length) return;
    const text = initialPrompt.trim();
    if (!text) return;
    seededRef.current = true;
    send.mutate({ sessionId: activeId, text, agent: "build" });
    try {
      const params = new URLSearchParams(searchParams?.toString?.() || "");
      if (params.has("initial")) {
        params.delete("initial");
        router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
      }
    } catch {}
  }, [initialPrompt, activeId, messages.length, pathname, router, searchParams, send]);

  const handleSend = (text: string, files?: FilePart[], model?: string, providerID?: string) => {
    if (!activeId || (!text.trim() && !files?.length)) return;
    setAborted(false);
    send.mutate({ sessionId: activeId, text: text.trim(), agent: mode, files, model, providerID });
  };

  const handleAbort = () => {
    if (!activeId || !projectId) return;
    abort.mutate({ projectId, sessionId: activeId }, { onSuccess: () => setAborted(true) });
  };

  const handleRevert = async (messageId: string) => {
    if (!activeId || busy) return;
    setRevertingId(messageId);
    try { await revert.mutateAsync({ sessionId: activeId, messageId }); }
    finally { setRevertingId(undefined); }
  };

  const handleCreate = () => create.mutateAsync().then(s => s?.id && setSessionId(s.id));

  const activeSession = sessions.find(s => s.id === activeId);

  return (
    <div className="flex flex-col h-svh w-full">
      {/* Header */}
      <header className="flex h-10 items-stretch border-b bg-muted/30 shrink-0">
        {/* Session dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-4 text-sm border-r hover:bg-muted/50 transition-colors">
              <span className="truncate max-w-40">{activeSession?.title || "Untitled"}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
              New Session
            </DropdownMenuItem>
            {sessions.length > 0 && <DropdownMenuSeparator />}
            <ScrollArea className={sessions.length > 8 ? "h-64" : ""}>
              {sessions.map(s => (
                <DropdownMenuItem key={s.id} onClick={() => setSessionId(s.id)} className="justify-between">
                  <span className="truncate">{s.title || "Untitled"}</span>
                  {s.id === activeId && <Check className="size-4 text-muted-foreground" />}
                </DropdownMenuItem>
              ))}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tabs */}
        <div className="flex flex-1 overflow-x-auto">
          <button
            onClick={() => setTab("chat")}
            className={cn(
              "flex items-center gap-2 px-4 text-sm border-r transition-colors",
              tab === "chat" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <MessagesSquare className="size-4" />Chat
          </button>
          <button
            onClick={() => setTab("terminal")}
            className={cn(
              "flex items-center gap-2 px-4 text-sm border-r transition-colors",
              tab === "terminal" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <Terminal className="size-4" />Terminal
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-4">
          {!connected && projectId && (
            <div className="flex items-center gap-2 text-sm text-amber-500">
              <WifiOff className="size-4" />
              <span className="hidden sm:inline">Reconnecting...</span>
            </div>
          )}
          {session?.summary?.diffs?.length ? (
            <Button size="sm" variant="outline" onClick={() => setDiffOpen(true)}>View Diff</Button>
          ) : null}
        </div>
      </header>

      {/* Chat */}
      {tab === "chat" && (
      <div className="flex flex-col flex-1 min-h-0">
        <div ref={scrollRef} className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.length ? (
                <AgentThread
                  sessionId={activeId!}
                  messages={messages}
                  partsMap={parts}
                  onRevert={handleRevert}
                  revertMessageId={session?.revert?.messageID}
                  reverting={busy}
                  revertingMessageId={revertingId}
                  onViewChanges={onViewChanges}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <MessageCircle className="size-8 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <p className="font-medium">No messages yet</p>
                  <p className="text-sm text-muted-foreground">Start a conversation</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input */}
        <div className="px-4 py-4 shrink-0 relative">
          {session?.revert?.messageID && (
            <div className="absolute -top-10 right-4 z-10">
              <Button size="sm" variant="outline" onClick={() => unrevert.mutate({ sessionId: activeId! })} disabled={unrevert.isPending} className="bg-background/90 backdrop-blur-sm shadow-sm">
                {unrevert.isPending ? <><Loader2 className="size-3.5 mr-2 animate-spin" />Restoring...</> : <><RotateCcw className="size-3.5 mr-2" />Restore</>}
              </Button>
            </div>
          )}
          <div className="max-w-3xl mx-auto">
            <ChatInput
              onSubmit={handleSend}
              disabled={send.isPending || working || busy || !connected}
              placeholder={!connected ? "Connecting..." : working ? "Working..." : "Ask anything..."}
              mode={mode}
              onToggleMode={() => setMode(m => m === "plan" ? "build" : "plan")}
              isWorking={working}
              onStop={handleAbort}
              isStopping={abort.isPending}
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
