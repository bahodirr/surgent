"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Plus, MessageCircle } from "lucide-react";
import ChatInput from "./chat-input";
import TerminalWidget from "./terminal/terminal-widget";
import { useSandbox } from "@/hooks/use-sandbox";
import useAgentStream from "@/lib/use-agent-stream";
import { AgentThread } from "@/components/agent/agent-thread";
import { useSessionsQuery, useCreateSession, useSendMessage } from "@/queries/chats";
import SessionDiffDialog from "@/components/diff/session-diff-dialog";

interface ConversationProps {
  projectId?: string;
  sessionId?: string;
}

export default function Conversation({ projectId, sessionId }: ConversationProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const shouldStickRef = useRef(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'agent'>('chat');
  const [mode, setMode] = useState<'plan' | 'build'>('build');
  const [diffOpen, setDiffOpen] = useState(false);
  const sandboxId = useSandbox((s: { sandboxId?: string | null }) => s.sandboxId || undefined);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(sessionId);

  const { messages, parts: partsByMessage, session: currentSession, lastAt } = useAgentStream({ projectId, sessionId: selectedSessionId });
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessionsQuery(projectId);
  const createSession = useCreateSession(projectId);
  const sendMessage = useSendMessage(projectId);

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

  useEffect(() => {
    setSelectedSessionId(sessionId);
  }, [sessionId]);
  
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


  const handleSend = (text: string) => {
    if (!selectedSessionId || !text.trim()) return;
    sendMessage.mutate({ sessionId: selectedSessionId, text: text.trim(), agent: mode });
  };

  const placeholder = activeTab === 'chat' ? "Ask anything..." : "Agent actions coming soon";

  return (
    <>
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'agent')} className="h-full flex flex-col">
      {/* Header with session selector */}
      <div className="border-b px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
            <Select value={selectedSessionId} onValueChange={handleSessionChange} disabled={isLoadingSessions}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder={isLoadingSessions ? "Loading..." : "Select session"} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingSessions ? (
                  <SelectItem value="loading" disabled className="text-xs">
                    Loading sessions...
                  </SelectItem>
                ) : sessions.length === 0 ? (
                  <SelectItem value="empty" disabled className="text-xs">
                    No sessions yet
                  </SelectItem>
                ) : (
                  sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.title || 'Untitled session'}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCreateSession}
              disabled={createSession.isPending || isLoadingSessions}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-2">
              {isWorking && (
                <div className="flex items-center gap-1 text-xs text-foreground/60">
                  <div className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
                  <span>Working</span>
                </div>
              )}
              {currentSession?.summary?.diffs && currentSession.summary.diffs.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs rounded-full px-3"
                  onClick={() => setDiffOpen(true)}
                >
                  Diff
                </Button>
              )}
            </div>
          </div>
          <TabsList className="h-8">
            <TabsTrigger value="chat" className="text-xs">Chat</TabsTrigger>
            <TabsTrigger value="agent" className="text-xs">Terminal</TabsTrigger>
          </TabsList>
        </div>
      </div>

      {/* Main content area */}
      <TabsContent value="chat" className="flex-1 min-h-0 relative m-0">
        <div ref={scrollRef} className="h-full">
          <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:scroll-smooth">
            <div className="max-w-4xl mx-auto px-6 py-8 scroll-py-4">
            {messages.length > 0 ? (
              <>
                <AgentThread sessionId={selectedSessionId!} messages={messages} partsMap={partsByMessage} />
                <div ref={bottomRef} className="h-px" />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[500px] text-center">
                <div className="flex flex-col items-center gap-3">
                  <MessageCircle className="h-12 w-12 text-foreground/20" strokeWidth={1.5} />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground/80">No messages yet</p>
                    <p className="text-xs text-foreground/50">Start a conversation to get started</p>
                  </div>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>
        </div>
        
      </TabsContent>
      
      <TabsContent value="agent" className="flex-1 min-h-0 m-0">
        <div className="w-full h-full px-3 py-3">
          <TerminalWidget sandboxId={sandboxId} className="w-full h-full" />
        </div>
      </TabsContent>

      {/* Chat input - only show when on chat tab */}
      {activeTab === 'chat' && (
        <div className="px-1 py-1">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              onSubmit={handleSend}
              disabled={sendMessage.isPending || isWorking}
              placeholder={isWorking ? "Assistant is working..." : placeholder}
              mode={mode}
              onToggleMode={() => setMode((m) => (m === 'plan' ? 'build' : 'plan'))}
            />
          </div>
        </div>
      )}
    </Tabs>
    <SessionDiffDialog
      open={diffOpen}
      onOpenChange={setDiffOpen}
      diffs={currentSession?.summary?.diffs}
    />
    </>
  );
}
