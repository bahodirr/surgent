"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, Loader2, RotateCcw, MessagesSquare, Terminal, MessageSquarePlus, WifiOff } from "lucide-react";
import ChatInput from "./chat-input";
import TerminalWidget from "./terminal/terminal-widget";
import { useSandbox } from "@/hooks/use-sandbox";
import useAgentStream from "@/lib/use-agent-stream";
import { AgentThread } from "@/components/agent/agent-thread";
import { useSessionsQuery, useCreateSession, useSendMessage, useAbortSession, useRevertMessage, useUnrevert } from "@/queries/chats";
import SessionDiffDialog from "@/components/diff/session-diff-dialog";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton, SidebarTrigger, SidebarInset,
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
} from "@/components/ui/sidebar";

export interface ConversationProps {
  projectId?: string;
  initialPrompt?: string;
}

export default function Conversation({ projectId, initialPrompt }: ConversationProps) {
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

  // Queries & mutations
  const sandboxId = useSandbox(s => s.sandboxId || undefined);
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
    const last = messages[messages.length - 1];
    return last?.role === "assistant" && !last.time?.completed && Date.now() - (lastAt || 0) <= 15000;
  }, [messages, lastAt]);

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

  // Handlers
  const handleSend = (text: string, model?: string, providerID?: string) => {
    if (!activeId || !text.trim()) return;
    send.mutate({ sessionId: activeId, text: text.trim(), agent: mode, model, providerID });
  };

  const handleRevert = async (messageId: string) => {
    if (!activeId || busy) return;
    setRevertingId(messageId);
    try { await revert.mutateAsync({ sessionId: activeId, messageId }); }
    finally { setRevertingId(undefined); }
  };

  const handleCreate = () => create.mutateAsync().then(s => s?.id && setSessionId(s.id));

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-svh w-full">
        {/* Sidebar */}
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center justify-between px-3 py-2">
              <h2 className="text-sm font-medium group-data-[collapsible=icon]:hidden">Sessions</h2>
              <Button variant="ghost" size="icon" onClick={handleCreate} disabled={create.isPending} className="size-8 group-data-[collapsible=icon]:w-full">
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquarePlus className="size-4" />}
              </Button>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Recent</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="group-data-[collapsible=icon]:hidden">
                  {sessions.length ? sessions.map(s => (
                    <SidebarMenuItem key={s.id}>
                      <SidebarMenuButton isActive={activeId === s.id} onClick={() => setSessionId(s.id)} tooltip={s.title || "Untitled"}>
                        <span className="truncate">{s.title || "Untitled"}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )) : <p className="px-3 py-6 text-sm text-muted-foreground">No sessions</p>}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        {/* Main */}
        <SidebarInset className="flex flex-col min-h-0">
          <Tabs value={tab} onValueChange={v => setTab(v as "chat" | "terminal")} className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <header className="flex h-12 items-center justify-between px-4 shrink-0 border-b">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <TabsList className="h-9">
                  <TabsTrigger value="chat" className="gap-2 px-3"><MessagesSquare className="size-4" />Chat</TabsTrigger>
                  <TabsTrigger value="terminal" className="gap-2 px-3"><Terminal className="size-4" />Terminal</TabsTrigger>
                </TabsList>
              </div>
              <div className="flex items-center gap-3">
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
            <TabsContent value="chat" className="flex flex-col flex-1 min-h-0 m-0">
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
                    onStop={() => activeId && abort.mutate({ projectId: projectId!, sessionId: activeId })}
                    isStopping={abort.isPending}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Terminal */}
            <TabsContent value="terminal" className="flex-1 min-h-0 m-0 p-3">
              <TerminalWidget sandboxId={sandboxId} className="size-full rounded-lg" />
            </TabsContent>
          </Tabs>
        </SidebarInset>
      </div>

      <SessionDiffDialog open={diffOpen} onOpenChange={setDiffOpen} diffs={session?.summary?.diffs} />
    </SidebarProvider>
  );
}
