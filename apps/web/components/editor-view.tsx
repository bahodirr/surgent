"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, Id } from "@repo/backend";
import CodeEditor from "@/components/code-editor";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";

type EditorViewProps = {
  projectId: Id<'projects'>;
};

export default function EditorView({ projectId }: EditorViewProps) {
  const [code, setCode] = useState<string>("");
  const [activeFile, setActiveFile] = useState<string>("");
  const [editingEnabled, setEditingEnabled] = useState<boolean>(true);
  const readFile = useAction(api.files.readFile);

  const handleOpenFile = async (path: string) => {
    setActiveFile(path);
    try {
      const res = await readFile({ projectId, path, as: 'text', maxBytes: 1_000_000 });
      setCode(res.content);
    } catch (e) {
      console.error('Failed to read file:', e);
    }
  };

  // We expose onOpenFile via context or props in parent where needed; for now, this component focuses on layout

  return (
    <SidebarInset>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <div className="flex items-center justify-between w-full">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">components</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">ui</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{activeFile || 'Select a file'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Editing</span>
            <Switch className="cursor-pointer" checked={editingEnabled} onCheckedChange={(v) => setEditingEnabled(v)} aria-label="Toggle editing" />
          </div>
        </div>
      </header>
      <div className="h-[calc(100vh-3rem)]">
        <CodeEditor
          value={code}
          onChange={setCode}
          language="typescript"
          theme="system"
          readOnly={!editingEnabled}
          disableDiagnostics
          options={{
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            hover: { enabled: false },
            parameterHints: { enabled: false },
            contextmenu: false,
            codeLens: false,
            folding: false,
            occurrencesHighlight: false,
            links: false,
            formatOnType: false,
            formatOnPaste: false,
          }}
        />
      </div>
    </SidebarInset>
  );
}


