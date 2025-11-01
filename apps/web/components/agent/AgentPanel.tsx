"use client";

import React, { useMemo } from "react";
import { useAgentStore } from "@/lib/agent-store";
import type { AssistantMessage as AssistantMessageType, Message, SummaryDiff } from "@/types/opencode";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AssistantMessage } from "./AssistantMessage";

function UserMessageTitle({ message, partsText }: { message: Message; partsText: string }) {
  const title = message.summary?.title;
  return (
    <div>
      <div className="text-sm font-medium text-foreground truncate">{title ?? partsText}</div>
      {title ? (
        <div className="-mt-1 text-xs text-foreground/70 line-clamp-3">{partsText}</div>
      ) : null}
    </div>
  );
}

function SummaryDiffList({ diffs }: { diffs: SummaryDiff[] }) {
  if (!diffs?.length) return null;
  return (
    <div className="w-full flex flex-col gap-3">
      {diffs.map((d) => (
        <div key={d.file} className="border rounded p-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium truncate">{d.file}</div>
            <div className="text-xs text-foreground/60">
              {d.additions ? `+${d.additions} ` : ""}
              {d.deletions ? `-${d.deletions}` : ""}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <pre className="p-2 bg-muted rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap">{d.before}</pre>
            <pre className="p-2 bg-muted rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap">{d.after}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgentPanel({ sessionId }: { sessionId: string }) {
  const getMessages = useAgentStore((s) => s.getMessages);
  const getParts = useAgentStore((s) => s.getParts);

  const messages = getMessages(sessionId);
  const userMessages = useMemo(() => messages.filter((m) => m.role === "user"), [messages]);

  return (
    <div className="flex flex-col gap-8">
      {userMessages.map((userMsg) => {
        const assistantMessages = messages.filter(
          (m) => m.role === "assistant" && m.parentID === userMsg.id
        ) as AssistantMessageType[];

        const working = (() => {
          const last = assistantMessages[assistantMessages.length - 1];
          if (!last) return false;
          return !last.time?.completed;
        })();

        const getMessageText = (m: Message | undefined): string => {
          if (!m) return "";
          const parts = getParts(m.id);
          return parts
            .filter((p) => p.type === "text" && !p.synthetic)
            .map((p) => (p as any).text as string)
            .join(" ");
        };

        const titleText = userMsg.summary?.title;
        const promptText = titleText ? getMessageText(userMsg) : getMessageText(userMsg);
        const summaryBody = userMsg.summary?.body;
        const diffs = userMsg.summary?.diffs ?? [];

        const lastWithContent = assistantMessages.findLast((m) => {
          const parts = getParts(m.id);
          return parts.find((p) => p.type === "text" || p.type === "tool");
        });

        return (
          <div key={userMsg.id} className="flex flex-col gap-5">
            <div className="sticky top-0 bg-background py-2">
              <UserMessageTitle message={userMsg} partsText={promptText} />
            </div>

            <div className="w-full flex flex-col gap-3">
              <Collapsible>
                <CollapsibleTrigger className="text-xs text-foreground/70 hover:text-foreground/90">
                  Show steps
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 flex flex-col gap-4">
                  {assistantMessages.map((am) => {
                    const parts = getParts(am.id);
                    return <AssistantMessage key={am.id} message={am} parts={parts} />;
                  })}
                </CollapsibleContent>
              </Collapsible>

              {working && lastWithContent ? (
                <AssistantMessage message={lastWithContent} parts={getParts(lastWithContent.id)} lastToolOnly />
              ) : null}
            </div>

            {!working ? (
              <div className="flex flex-col gap-4">
                {summaryBody ? (
                  <div>
                    <div className="text-xs text-foreground/70 mb-1">Summary</div>
                    <div className="text-sm text-foreground/90">{summaryBody}</div>
                  </div>
                ) : null}
                {diffs.length ? (
                  <div>
                    <div className="text-xs text-foreground/70 mb-1">Changes</div>
                    <SummaryDiffList diffs={diffs} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}


