"use client"

import { cn } from "@/lib/utils"
import { Streamdown } from "streamdown"
import { memo } from "react"
import type { BundledTheme } from "shiki"
import { MarkdownCodeAttachment } from "@/components/ui/markdown-code-attachment"

const shikiTheme: [BundledTheme, BundledTheme] = ["github-light", "github-dark"]

export type MarkdownProps = {
  children: string
  className?: string
  isAnimating?: boolean
}

function MarkdownComponent({ children, className, isAnimating }: MarkdownProps) {
  return (
    <Streamdown
      className={cn("prose prose-sm dark:prose-invert max-w-none", className)}
      isAnimating={isAnimating}
      shikiTheme={shikiTheme}
      components={{
        code: MarkdownCodeAttachment,
      }}
    >
      {children}
    </Streamdown>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
