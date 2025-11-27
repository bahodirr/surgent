"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, MessageCircle, Loader2, RotateCcw, MessagesSquare, Terminal, Trash2, Sparkles, MessageSquarePlus, Wifi, WifiOff } from "lucide-react";
import ChatInput from "./chat-input";
import TerminalWidget from "./terminal/terminal-widget";
import { useSandbox } from "@/hooks/use-sandbox";
import useAgentStream from "@/lib/use-agent-stream";
import { AgentThread } from "@/components/agent/agent-thread";
import { useSessionsQuery, useCreateSession, useSendMessage, useAbortSession, useRevertMessage, useUnrevert } from "@/queries/chats";
import SessionDiffDialog from "@/components/diff/session-diff-dialog";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
  const shouldStickRef = useRef(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'terminal'>('chat');
  const [mode, setMode] = useState<'plan' | 'build'>('build');
  const [diffOpen, setDiffOpen] = useState(false);
  const sandboxId = useSandbox((s: { sandboxId?: string | null }) => s.sandboxId || undefined);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [revertingId, setRevertingId] = useState<string | undefined>();
  const seededRef = useRef(false);

  const { data: sessions = [] } = useSessionsQuery(projectId);
  const createSession = useCreateSession(projectId);
  const sendMessage = useSendMessage(projectId);
  const abortSession = useAbortSession();
  const revertMutation = useRevertMessage(projectId);
  const unrevertMutation = useUnrevert(projectId);
  const busy = revertMutation.isPending || unrevertMutation.isPending;

  // Derive selected session: use state if set, otherwise first session
  const activeSessionId = selectedSessionId || sessions[0]?.id;

  const { messages, parts: partsByMessage, session: currentSession, lastAt, connected } = useAgentStream({ projectId, sessionId: activeSessionId });

  const isWorking = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return false;
    if (last.time?.completed) return false;
    if (Date.now() - (lastAt || 0) > 15000) return false;
    return true;
  }, [messages, lastAt]);

  const handleCreateSession = async () => {
    const newSession = await createSession.mutateAsync();
    if (newSession?.id) {
      setSelectedSessionId(newSession.id);
    }
  };

  const handleSessionChange = (newSessionId: string) => {
    setSelectedSessionId(newSessionId);
  };

  // Seed initial prompt once if provided
  useEffect(() => {
    if (!initialPrompt || seededRef.current || !activeSessionId) return;
    if (messages.length > 0) return;
    const text = initialPrompt.trim();
    if (!text) return;
    seededRef.current = true;
    sendMessage.mutate({ sessionId: activeSessionId, text, agent: 'build' });
    // Clean up the URL by removing the 'initial' query after seeding
    try {
      const params = new URLSearchParams(searchParams?.toString?.() || "");
      if (params.has("initial")) {
        params.delete("initial");
        const next = params.toString();
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      }
    } catch {
      // no-op: if URL manipulation fails, we still avoid reseeding via seededRef
    }
  }, [initialPrompt, activeSessionId, messages.length]);
  
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const viewport = root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    viewportRef.current = viewport;
    const onScroll = () => {
      shouldStickRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!shouldStickRef.current || !viewportRef.current) return;
    viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);


  const handleSend = (text: string, model?: string, providerID?: string) => {
    if (!activeSessionId || !text.trim()) return;
    sendMessage.mutate({
      sessionId: activeSessionId,
      text: text.trim(),
      agent: mode,
      model,  
      providerID,
    });
  };

  const handleAbort = () => {
    if (!activeSessionId) return;
    abortSession.mutate({ projectId: projectId!, sessionId: activeSessionId });
  };

  const handleRevert = async (messageId: string) => {
    if (!activeSessionId || busy) return;
    setRevertingId(messageId);
    try {
      await revertMutation.mutateAsync({ sessionId: activeSessionId, messageId });
    } finally {
      setRevertingId(undefined);
    }
  };

  const handleUnrevert = () => {
    if (!activeSessionId) return;
    unrevertMutation.mutate({ sessionId: activeSessionId });
  };

  const placeholder = activeTab === 'chat' ? "Ask anything..." : "Terminal actions";

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-svh w-full">
        {/* Sidebar for session management */}
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center justify-between px-2 py-1">
              <h2 className="text-sm font-semibold group-data-[collapsible=icon]:hidden">Sessions</h2>
                <Button 
                variant="ghost" 
                size="sm"
                onClick={handleCreateSession}
                disabled={createSession.isPending}
                className="h-7 w-7 p-0 group-data-[collapsible=icon]:w-full"
                title="New Session"
              >
                {createSession.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquarePlus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                Recent Chats
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="group-data-[collapsible=icon]:hidden">
                  {sessions.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      No sessions yet
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <SidebarMenuItem key={session.id}>
                        <SidebarMenuButton
                          isActive={activeSessionId === session.id}
                          onClick={() => handleSessionChange(session.id)}
                          tooltip={session.title || 'Untitled session'}
                          className="group"
                        >
                          <span className="truncate">{session.title || 'Untitled session'}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        {/* Main content area */}
        <SidebarInset className="flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'terminal')} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Header with tabs and controls */}
            <header className="flex h-14 items-center justify-between px-4 gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <TabsList>
                  <TabsTrigger value="chat">
                    <MessagesSquare className="h-3.5 w-3.5 mr-1.5" />
                    Chat
                  </TabsTrigger>
                  <TabsTrigger value="terminal">
                    <Terminal className="h-3.5 w-3.5 mr-1.5" />
                    Terminal
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <div className="flex items-center gap-2">
                {!connected && projectId && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500" title="Reconnecting to server...">
                    <WifiOff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Reconnecting...</span>
                  </div>
                )}
                {currentSession?.summary?.diffs && currentSession.summary.diffs.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setDiffOpen(true)}
                  >
                    View Diff
                  </Button>
                )}
              </div>
            </header>

            {/* Chat Tab Content */}
            <TabsContent value="chat" className="flex flex-col flex-1 min-h-0 m-0 overflow-hidden relative">
              <div ref={scrollRef} className="flex-1 min-h-0">
                <ScrollArea className="h-full w-full">
                  <div className="max-w-4xl mx-auto px-6 py-8">
                    {messages.length > 0 ? (
                      <AgentThread
                        sessionId={activeSessionId!}
                        messages={messages}
                        partsMap={partsByMessage}
                        onRevert={handleRevert}
                        revertMessageId={currentSession?.revert?.messageID}
                        reverting={busy}
                        revertingMessageId={revertingId}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center min-h-[500px] text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="rounded-full bg-muted p-4">
                            <MessageCircle className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                          </div>
                          <div className="space-y-2">
                            <p className="text-base font-medium">No messages yet</p>
                            <p className="text-sm text-muted-foreground">Start a conversation to get started</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Chat input */}
              <div className=" px-4 py-3 shrink-0 relative">
                {/* Floating Revert Button */}
                {currentSession?.revert?.messageID && (
                  <div className="absolute -top-11 right-4 z-10">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleUnrevert} 
                      disabled={unrevertMutation.isPending}
                      className="cursor-pointer h-8 text-xs bg-background/80 backdrop-blur-sm shadow-sm"
                    >
                      {unrevertMutation.isPending ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Restoring…
                        </>
                      ) : (
                        <>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Revert back messages
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
                <div className="max-w-4xl mx-auto">
                  <ChatInput
                    onSubmit={handleSend}
                    disabled={sendMessage.isPending || isWorking || busy || !connected}
                    placeholder={!connected ? "Connecting to server..." : isWorking ? "Assistant is working..." : placeholder}
                    mode={mode}
                    onToggleMode={() => setMode((m) => (m === 'plan' ? 'build' : 'plan'))}
                    isWorking={isWorking}
                    onStop={handleAbort}
                    isStopping={abortSession.isPending}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Terminal Tab Content */}
            <TabsContent value="terminal" className="flex flex-col flex-1 min-h-0 m-0 p-2 overflow-hidden">
              <TerminalWidget sandboxId={sandboxId} className="w-full h-full rounded-lg" />
            </TabsContent>
          </Tabs>
        </SidebarInset>
      </div>

      <SessionDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diffs={currentSession?.summary?.diffs}
      />
    </SidebarProvider>
  );
}
