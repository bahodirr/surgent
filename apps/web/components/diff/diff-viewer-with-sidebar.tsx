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
  collapseUnchanged?: boolean;
  contextLines?: number;
};

export default function DiffViewerWithSidebar({ diffs, className, collapseUnchanged = false, contextLines = 3 }: Props) {
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
    <ResizablePanelGroup direction="horizontal" className={cn("h-full", className)}>
      <ResizablePanel defaultSize={24} minSize={15}>
        <div className="h-full overflow-y-auto scroll-smooth border-r">
          <div className="sticky top-0 z-10 bg-background border-b px-3 py-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{diffs.length} file{diffs.length > 1 ? "s" : ""}</span>
              <span className="flex items-center gap-2 text-xs tabular-nums">
                {totalDel > 0 && <span className="text-red-500">-{totalDel}</span>}
                {totalAdd > 0 && <span className="text-green-500">+{totalAdd}</span>}
              </span>
            </div>
          </div>
          <div className="py-1">
            {diffs.map((d, i) => {
              const add = d.additions ?? 0;
              const del = d.deletions ?? 0;
              const selected = selectedIdx === i;
              const filename = d.file.split(/[/\\]/).pop();
              return (
                <button
                  key={i}
                  title={d.file}
                  onClick={() => setSelectedIdx(i)}
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-sm flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors",
                    selected && "bg-muted"
                  )}
                >
                  <span className="truncate flex items-center gap-2 min-w-0">
                    <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{filename}</span>
                  </span>
                  {(add > 0 || del > 0) && (
                    <span className="text-xs tabular-nums shrink-0 flex items-center gap-1.5">
                      {del > 0 && <span className="text-red-500">-{del}</span>}
                      {add > 0 && <span className="text-green-500">+{add}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={76} minSize={40}>
        <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4 scroll-smooth">
          {diffs.map((d, i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) diffRefs.current.set(i, el);
                else diffRefs.current.delete(i);
              }}
            >
              <DiffView before={d.before} after={d.after} path={d.file} collapseUnchanged={collapseUnchanged} contextLines={contextLines} />
            </div>
          ))}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

