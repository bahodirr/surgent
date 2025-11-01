"use client";

import React from "react";
import type { ToolPart } from "@/types/opencode";
import { BasicTool } from "./BasicTool";

export type ToolProps = {
  part: ToolPart;
};

type ToolRenderer = React.ComponentType<ToolProps>;

const registry: Record<string, { name: string; render?: ToolRenderer }> = {};

export function registerTool(name: string, render?: ToolRenderer) {
  registry[name] = { name, render };
}

export function getToolRenderer(name: string): ToolRenderer | undefined {
  return registry[name]?.render;
}

// Default generic tool
function GenericTool({ part }: ToolProps) {
  const isPending = part.state.status === "pending";
  const error = part.state.status === "error" ? part.state.error : undefined;
  return <BasicTool trigger={{ title: part.tool }} pending={isPending} error={error} />;
}

export function ToolPartView({ part }: ToolProps) {
  const Cmp = getToolRenderer(part.tool) ?? GenericTool;
  return <Cmp part={part} />;
}

// Built-in tool renderers
registerTool("read", ({ part }) => {
  const filePath = String(part.state.input?.["filePath"] ?? "");
  return <BasicTool trigger={{ title: "Read", subtitle: filePath }} pending={part.state.status === "pending"} />;
});

registerTool("list", ({ part }) => {
  const path = String(part.state.input?.["path"] ?? "/");
  return <BasicTool trigger={{ title: "List", subtitle: path }} pending={part.state.status === "pending"} />;
});

registerTool("glob", ({ part }) => {
  const path = String(part.state.input?.["path"] ?? "/");
  const pattern = String(part.state.input?.["pattern"] ?? "");
  const args = pattern ? ["pattern=" + pattern] : [];
  return (
    <BasicTool trigger={{ title: "Glob", subtitle: path, args }} pending={part.state.status === "pending"} />
  );
});

registerTool("grep", ({ part }) => {
  const path = String(part.state.input?.["path"] ?? "/");
  const pattern = String(part.state.input?.["pattern"] ?? "");
  const include = String(part.state.input?.["include"] ?? "");
  const args = [pattern ? "pattern=" + pattern : undefined, include ? "include=" + include : undefined].filter(
    Boolean
  ) as string[];
  return (
    <BasicTool trigger={{ title: "Grep", subtitle: path, args }} pending={part.state.status === "pending"} />
  );
});

registerTool("webfetch", ({ part }) => {
  const url = String(part.state.input?.["url"] ?? "");
  const format = String(part.state.input?.["format"] ?? "");
  const args = format ? ["format=" + format] : [];
  return (
    <BasicTool trigger={{ title: "Webfetch", subtitle: url, args }} pending={part.state.status === "pending"} />
  );
});

registerTool("task", ({ part }) => {
  const subagent = String(part.state.input?.["subagent_type"] ?? part.tool);
  const description = String(part.state.input?.["description"] ?? "");
  return (
    <BasicTool trigger={{ title: `${subagent} Agent`, subtitle: description }} pending={part.state.status === "pending"} />
  );
});

registerTool("bash", ({ part }) => {
  const cmd = String(part.state.input?.["command"] ?? "");
  return (
    <BasicTool trigger={{ title: "Shell", subtitle: cmd }} pending={part.state.status === "pending"}>
      {part.state.output ? (
        <pre className="whitespace-pre-wrap text-xs text-foreground/80">{part.state.output}</pre>
      ) : null}
    </BasicTool>
  );
});

registerTool("edit", ({ part }) => {
  const filePath = String(part.state.input?.["filePath"] ?? "");
  const diff = part.state.metadata?.["filediff"] as
    | { path: string; before: string; after: string; additions?: number; deletions?: number }
    | undefined;
  return (
    <BasicTool trigger={{ title: "Edit", subtitle: filePath }} pending={part.state.status === "pending"}>
      {diff ? (
        <div className="border-t pt-2">
          <div className="text-xs text-foreground/60 mb-2">
            {diff.additions ? `+${diff.additions} ` : ""}
            {diff.deletions ? `-${diff.deletions}` : ""}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-medium mb-1">Before</div>
              <pre className="p-2 bg-muted rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                {diff.before}
              </pre>
            </div>
            <div>
              <div className="text-xs font-medium mb-1">After</div>
              <pre className="p-2 bg-muted rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                {diff.after}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </BasicTool>
  );
});

registerTool("write", ({ part }) => {
  const filePath = String(part.state.input?.["filePath"] ?? "");
  return <BasicTool trigger={{ title: "Write", subtitle: filePath }} pending={part.state.status === "pending"} />;
});

registerTool("todowrite", ({ part }) => {
  const todos = (part.state.input?.["todos"] as Array<{ content: string; status: string }>) ?? [];
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <BasicTool trigger={{ title: "To-dos", subtitle: `${done}/${todos.length}` }} pending={part.state.status === "pending"}>
      {todos.length ? (
        <ul className="mt-2 space-y-1">
          {todos.map((t, i) => (
            <li key={i} className="text-sm">
              <span className={t.status === "completed" ? "line-through text-foreground/50" : ""}>{t.content}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </BasicTool>
  );
});


