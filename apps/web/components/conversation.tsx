"use client";

import { useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import ChatInput from "./chat-input";
import TerminalWidget from "./terminal/terminal-widget";
import { useSandbox } from "@/hooks/use-sandbox";

interface ConversationProps {
  projectId?: string;
}

export default function Conversation({ projectId }: ConversationProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'agent'>('agent');
  const [isSending, setIsSending] = useState(false);
  const sandboxId = useSandbox((s: { sandboxId?: string | null }) => s.sandboxId || undefined);

  console.log("sandboxId", sandboxId);

  const handleSend = async (text: string) => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    try {
      console.debug("send:", { text, projectId });
    } finally {
    setIsSending(false);
    }
  };

  const placeholder = activeTab === 'chat' ? "Ask anything..." : "Agent actions coming soon";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-6 pt-3 pb-2">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white/70 p-1 backdrop-blur">
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 text-[13px] rounded-full cursor-pointer select-none transition-colors min-w-[68px]",
              activeTab === 'chat' ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
            )}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 text-[13px] rounded-full cursor-pointer select-none transition-colors min-w-[68px]",
              activeTab === 'agent' ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
            )}
            onClick={() => setActiveTab('agent')}
          >
            Agent
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-5 pb-3 relative">
        <div className={activeTab === 'chat' ? 'block h-full' : 'hidden'}>
          <ScrollArea className={cn(
            "h-full",
            "[&_[data-slot='scroll-area-scrollbar']]:w-1.5 [&_[data-slot='scroll-area-scrollbar']]:border-l-0",
            "[&_[data-slot='scroll-area-scrollbar'][data-orientation='horizontal']]:h-1.5"
          )}>
            <div ref={contentRef} className="p-2 min-h-[120px]">
              <div className="text-xs text-muted-foreground">Start a conversation.</div>
            </div>
          </ScrollArea>
        </div>
        <div className={activeTab === 'agent' ? 'block h-full' : 'hidden'}>
          <TerminalWidget sandboxId={sandboxId} className="w-full h-full" />
        </div>
      </div>

      {activeTab === 'chat' && (
        <ChatInput
          onSubmit={handleSend}
          disabled={isSending}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
