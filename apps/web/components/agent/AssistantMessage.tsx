"use client";

import React, { useMemo } from "react";
import type { AssistantMessage as AssistantMessageType, Part, TextPart, ToolPart } from "@/types/opencode";
import { Markdown } from "./Markdown";
import { ToolPartView } from "./ToolRegistry";

export function AssistantMessage({
  message,
  parts,
  lastToolOnly,
}: {
  message: AssistantMessageType;
  parts: Part[];
  lastToolOnly?: boolean;
}) {
  const filtered = useMemo(() => {
    let seenTool = false;
    const xs = (parts ?? []).filter((p) => {
      if (p.type === "reasoning") return false; // hide chain-of-thought
      if (p.type === "tool") {
        if (lastToolOnly) {
          if (seenTool) return false;
          seenTool = true;
        }
        return p.tool !== "todoread"; // hide internal-only tool
      }
      return true;
    });
    if (lastToolOnly) {
      // keep only the last tool part if present
      const lastIndex = xs.findLastIndex((p) => p.type === "tool");
      if (lastIndex >= 0) return [xs[lastIndex]];
    }
    return xs;
  }, [parts, lastToolOnly]);

  return (
    <div className="w-full flex flex-col gap-3">
      {filtered.map((part) => {
        if (part.type === "text") {
          const text = (part as TextPart).text?.trim();
          if (!text) return null;
          return <Markdown key={part.id} text={text} />;
        }
        if (part.type === "tool") {
          return <ToolPartView key={part.id} part={part as ToolPart} />;
        }
        return null;
      })}
    </div>
  );
}


