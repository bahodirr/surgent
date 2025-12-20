"use client";

import React from "react";
import type { FileDiff } from "@opencode-ai/sdk";
import { cn } from "@/lib/utils";

type Props = {
  diffs?: FileDiff[];
  variant?: "compact" | "list";
  className?: string;
  maxFiles?: number;
  showBars?: boolean;
};

function aggregate(diffs: FileDiff[] | undefined) {
  let additions = 0;
  let deletions = 0;
  for (const d of diffs ?? []) {
    additions += d.additions ?? 0;
    deletions += d.deletions ?? 0;
  }
  return { files: diffs?.length ?? 0, additions, deletions };
}

function Bars({ add, del }: { add: number; del: number }) {
  const total = Math.max(1, add + del);
  const addPct = Math.round((add / total) * 100);
  const delPct = 100 - addPct;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded overflow-hidden bg-muted/60 flex">
        <span className="h-full bg-diff-add" style={{ width: `${addPct}%` }} />
        <span className="h-full bg-diff-del" style={{ width: `${delPct}%` }} />
      </div>
      <div className="text-[11px] tabular-nums text-foreground/70">
        <span className="text-diff-add">+{add}</span>
        <span className="mx-1" />
        <span className="text-diff-del">-{del}</span>
      </div>
    </div>
  );
}

export default function DiffSummary({ diffs, variant = "compact", className, maxFiles = 5, showBars = true }: Props) {
  const { files, additions, deletions } = aggregate(diffs);
  if (!files) return null;

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="text-[11px] text-foreground/70">{files} file{files !== 1 ? "s" : ""} changed</div>
        {showBars ? (
          <Bars add={additions} del={deletions} />
        ) : (
          <div className="text-[11px] tabular-nums text-foreground/60">
            <span className="text-diff-add">+{additions}</span>
            <span className="mx-1" />
            <span className="text-diff-del">-{deletions}</span>
          </div>
        )}
      </div>
    );
  }

  const items = (diffs ?? []).slice(0, maxFiles);
  const remaining = Math.max(0, (diffs?.length ?? 0) - items.length);
  return (
    <div className={cn("rounded-md border bg-muted/10", className)}>
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="text-[12px] text-foreground/80">Changes</div>
        <Bars add={additions} del={deletions} />
      </div>
      <div className="px-3 pb-2">
        <ul className="space-y-1">
          {items.map((d) => (
            <li key={d.file} className="flex items-center justify-between text-[12px]">
              <span className="truncate max-w-[60%] text-foreground/80">{d.file}</span>
              <span className="tabular-nums text-foreground/70">
                <span className="text-diff-add mr-2">+{d.additions ?? 0}</span>
                <span className="text-diff-del">-{d.deletions ?? 0}</span>
              </span>
            </li>
          ))}
          {remaining > 0 && (
            <li className="text-[12px] text-foreground/60">… and {remaining} more</li>
          )}
        </ul>
      </div>
    </div>
  );
}
