"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { unifiedMergeView, presentableDiff } from "@codemirror/merge";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

type Props = {
  before: string;
  after: string;
  path?: string;
  className?: string;
  // When true, collapse long stretches of unchanged lines
  collapseUnchanged?: boolean;
  // Number of context lines to show around each change when collapsing
  contextLines?: number;
};

export default function DiffView({ before, after, path, className, collapseUnchanged = false, contextLines = 3 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const extensions = useMemo(() => {
    const isJsTs = /\.(tsx?|jsx?)$/i.test(path || "");
    const exts: Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.theme({ "&": { backgroundColor: "transparent" } }),
    ];
    if (isJsTs) exts.push(javascript({ typescript: true, jsx: true }));
    return exts;
  }, [path, before, after]);

  const counts = useMemo(() => {
    try {
      const changes = presentableDiff(before, after);
      let add = 0, del = 0;
      for (const ch of changes) {
        if (ch.toA > ch.fromA) del += before.slice(ch.fromA, ch.toA).split("\n").length;
        if (ch.toB > ch.fromB) add += after.slice(ch.fromB, ch.toB).split("\n").length;
      }
      return { add, del };
    } catch {
      return { add: 0, del: 0 };
    }
  }, [before, after]);

  useEffect(() => {
    if (!containerRef.current) return;
    viewRef.current?.destroy();

    const mergeConfig: any = {
      original: before,
      gutter: true,
      highlightChanges: true,
      allowInlineDiffs: false,
      mergeControls: false,
    };

    if (collapseUnchanged) {
      mergeConfig.collapseUnchanged = {
        margin: Math.max(0, contextLines),
        minSize: 6,
      };
    }

    viewRef.current = new EditorView({
      parent: containerRef.current,
      doc: after,
      extensions: [...extensions, unifiedMergeView(mergeConfig)],
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [before, after, extensions, collapseUnchanged, contextLines]);

  return (
    <div className={className}>
      <div className="rounded-lg border overflow-hidden">
        {path && (
          <div className="px-3 py-1.5 border-b flex items-center justify-between gap-2 bg-muted/20">
            <span className="text-xs text-muted-foreground truncate font-mono">{path}</span>
            {(counts.add > 0 || counts.del > 0) && (
              <div className="flex items-center gap-1.5 text-[10px] tabular-nums">
                {counts.del > 0 && <span className="text-diff-del">-{counts.del}</span>}
                {counts.add > 0 && <span className="text-diff-add">+{counts.add}</span>}
              </div>
            )}
          </div>
        )}
        <div ref={containerRef} className="cm-diff" />
      </div>
      <style jsx>{`
        .cm-diff :global(.cm-editor) { font-size: 13px; line-height: 1.5; }
        .cm-diff :global(.cm-scroller) {
          overflow-x: auto;
          overflow-y: visible;
        }
        .cm-diff :global(.cm-gutters) { background: transparent; border: none; }
        .cm-diff :global(.cm-content) { padding: 12px 0; }
        .cm-diff :global(.cm-changedText),
        .cm-diff :global(ins) { text-decoration: none; background: none; }
        .cm-diff :global(.cm-changedLine) {
          background: rgba(34,197,94,0.1);
          border-left: 2px solid rgba(34,197,94,0.6);
          padding-left: 6px;
        }
        .cm-diff :global(.cm-deletedChunk) {
          background: rgba(239,68,68,0.1);
          border-left: 2px solid rgba(239,68,68,0.6);
          padding: 2px 0 2px 6px;
        }
      `}</style>
    </div>
  );
}
