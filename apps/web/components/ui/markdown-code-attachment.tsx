"use client"

import { cn } from "@/lib/utils"
import { FileText, Copy, Download, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { Element } from "hast"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { javascript } from "@codemirror/lang-javascript"
import { python } from "@codemirror/lang-python"
import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"

type Props = React.HTMLAttributes<HTMLElement> & { node?: Element }

const langs: Record<string, { ext: string; lang?: () => ReturnType<typeof javascript> }> = {
  typescript: { ext: "ts", lang: () => javascript({ typescript: true, jsx: true }) },
  tsx: { ext: "tsx", lang: () => javascript({ typescript: true, jsx: true }) },
  javascript: { ext: "js", lang: () => javascript({ jsx: true }) },
  jsx: { ext: "jsx", lang: () => javascript({ jsx: true }) },
  js: { ext: "js", lang: () => javascript({ jsx: true }) },
  ts: { ext: "ts", lang: () => javascript({ typescript: true, jsx: true }) },
  python: { ext: "py", lang: python },
  py: { ext: "py", lang: python },
  css: { ext: "css", lang: css },
  scss: { ext: "scss", lang: css },
  html: { ext: "html", lang: html },
  json: { ext: "json", lang: json },
  md: { ext: "md", lang: markdown },
  markdown: { ext: "md", lang: markdown },
}

function CodeViewer({ code, lang }: { code: string; lang: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!ref.current) return
    viewRef.current?.destroy()

    const extensions = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.theme({
        "&": { backgroundColor: "transparent" },
        ".cm-gutters": { background: "transparent", border: "none" },
        ".cm-content": { padding: "12px 0" },
      }),
    ]

    const langDef = langs[lang]
    if (langDef?.lang) extensions.push(langDef.lang())

    viewRef.current = new EditorView({
      parent: ref.current,
      doc: code,
      extensions,
    })

    return () => {
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [code, lang])

  return <div ref={ref} className="text-[13px] leading-relaxed overflow-x-auto" />
}

export function MarkdownCodeAttachment({ className, children, node, ...props }: Props) {
  const [open, setOpen] = useState(false)

  // Inline code: same line start/end
  const pos = node?.position
  if (pos?.start?.line === pos?.end?.line) {
    return (
      <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm", className)} {...props}>
        {children}
      </code>
    )
  }

  // Block code
  const code = typeof children === "string" ? children : String(children ?? "")
  const lang = className?.replace("language-", "") ?? "text"
  const ext = langs[lang]?.ext ?? lang
  const filename = `snippet.${ext}`

  const copy = () => navigator.clipboard.writeText(code)
  const download = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }))
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="not-prose my-2 flex w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-xs">{filename}</span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); copy() }}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); download() }}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-w-3xl rounded-md p-0 gap-0 overflow-hidden">
          <div className="flex h-10 items-center justify-between border-b bg-muted/30 px-3">
            <span className="font-mono text-sm">{filename}</span>
            <div className="flex items-center gap-1">
              <button onClick={copy} className="flex items-center gap-1.5 px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded">
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <button onClick={download} className="flex items-center gap-1.5 px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded">
                <Download className="h-3.5 w-3.5" /> Download
              </button>
              <button onClick={() => setOpen(false)} className="ml-1 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto px-3">
            <CodeViewer code={code} lang={lang} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
