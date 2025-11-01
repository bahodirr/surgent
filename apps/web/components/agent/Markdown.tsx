"use client";

import React from "react";
import ReactMarkdown from "react-markdown";

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}


