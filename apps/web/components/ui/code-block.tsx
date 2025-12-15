"use client"

import { cn } from "@/lib/utils"
import React, { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full min-w-0 flex-col overflow-hidden border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  theme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlockCode({
  code,
  language = "tsx",
  theme = "github-light",
  className,
  style,
  ...props
}: CodeBlockCodeProps) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return setHtml("<pre><code></code></pre>")
    codeToHtml(code, { lang: language, theme }).then(setHtml)
  }, [code, language, theme])

  return (
    <div
      className={cn(
        "w-full overflow-x-auto font-mono",
        "[&>pre]:p-3 [&_pre]:font-mono [&_pre]:!text-[inherit] [&_code]:!text-[inherit]",
        className
      )}
      style={{
        ...style,
        fontSize: "clamp(10px, 1.8vw, 13px)",
        lineHeight: 1.5,
      }}
      dangerouslySetInnerHTML={html ? { __html: html } : undefined}
      {...props}
    >
      {!html && <pre><code>{code}</code></pre>}
    </div>
  )
}

export { CodeBlock, CodeBlockCode }
