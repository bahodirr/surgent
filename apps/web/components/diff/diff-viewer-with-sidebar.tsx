"use client";

import React, { useState, useRef, useEffect } from "react";
import type { FileDiff } from "@opencode-ai/sdk";
import DiffView from "@/components/diff/diff-view";
import { cn } from "@/lib/utils";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { File as FileIcon } from "lucide-react";

type Props = {
  diffs: FileDiff[];
  className?: string;
};

export default function DiffViewerWithSidebar({ diffs, className }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const diffRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const el = diffRefs.current.get(selectedIdx);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedIdx]);

  if (!diffs.length) return null;

  const totalAdd = diffs.reduce((acc, d) => acc + (d.additions ?? 0), 0);
  const totalDel = diffs.reduce((acc, d) => acc + (d.deletions ?? 0), 0);

  return (
    <ResizablePanelGroup direction="horizontal" className={cn("h-full rounded-md border", className)}>
      <ResizablePanel defaultSize={24} minSize={15}>
        {/* Sidebar */}
        <div className="h-full overflow-y-auto scroll-smooth">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-b">
            <div className="px-2 py-1.5 flex items-center justify-between text-[10px] tabular-nums">
              <span className="text-[11px]">{diffs.length} files</span>
              <span className="space-x-2">
                {totalDel > 0 && <span className="text-red-600 dark:text-red-400">-{totalDel}</span>}
                {totalAdd > 0 && <span className="text-green-600 dark:text-green-400">+{totalAdd}</span>}
              </span>
            </div>
          </div>
          <div>
            {diffs.map((d, i) => {
              const add = d.additions ?? 0;
              const del = d.deletions ?? 0;
              const selected = selectedIdx === i;
              return (
                <button
                  key={i}
                  title={d.file}
                  onClick={() => setSelectedIdx(i)}
                  className={cn(
                    "w-full px-2 py-1 text-left text-[11px] font-mono flex items-center justify-between gap-2 truncate hover:bg-muted/50 hover:cursor-pointer",
                    selected && "bg-muted"
                  )}
                >
                  <span className="truncate flex items-center gap-2 min-w-0">
                    <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.file}</span>
                  </span>
                  {(add > 0 || del > 0) && (
                    <span className="text-[10px] tabular-nums shrink-0 space-x-2">
                      {del > 0 && <span className="text-red-600 dark:text-red-400">-{del}</span>}
                      {add > 0 && <span className="text-green-600 dark:text-green-400">+{add}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle className="mx-1" />
      <ResizablePanel defaultSize={76} minSize={40}>
        <div ref={scrollRef} className="h-full overflow-y-auto p-3 space-y-3 scroll-smooth scroll-pt-3">
          {diffs.map((d, i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) diffRefs.current.set(i, el);
                else diffRefs.current.delete(i);
              }}
            >
              <DiffView before={d.before} after={d.after} path={d.file} />
            </div>
          ))}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

