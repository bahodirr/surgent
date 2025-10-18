"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, Id } from "@repo/backend";
import CodeEditor from "@/components/code-editor";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, File as FileIcon, Folder as FolderIcon } from "lucide-react";

type EditorViewProps = {
  projectId: Id<'projects'>;
};

export default function EditorView({ projectId }: EditorViewProps) {
  const [code, setCode] = useState<string>("");
  const [activeFile, setActiveFile] = useState<string>("");
  const readFile = useAction(api.files.readFile);
  const getTree = useAction(api.files.getFileTree);
  const listFiles = useAction(api.files.listFiles);

  type FsNode = { name: string; path: string; isDir: boolean; children?: FsNode[] };
  const [nodes, setNodes] = useState<FsNode[] | undefined>(undefined);

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
  // Load root file tree (shallow) for performance, expand lazily
  useState(() => {
    (async () => {
      try {
        if (!projectId) { setNodes([]); return; }
        const root = await getTree({ projectId, depth: 1, maxEntries: 500 });
        setNodes(root as unknown as FsNode[]);
      } catch {
        setNodes([]);
      }
    })();
  });

  const loadChildren = async (dirPath: string): Promise<FsNode[] | undefined> => {
    try {
      const children = await listFiles({ projectId, path: dirPath });
      return children as unknown as FsNode[];
    } catch {
      return [];
    }
  };

  function FileTreeItem({ item }: { item: FsNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FsNode[] | undefined>(item.children);

    const onToggle = async (open: boolean) => {
      if (open && item.isDir && !children) {
        const loaded = await loadChildren(item.path);
        setChildren(loaded);
      }
      setIsOpen(open);
    };

    if (!item.isDir) {
      return (
        <button
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
          onClick={() => handleOpenFile(item.path)}
        >
          <FileIcon className="size-4" />
          <span className="truncate">{item.name}</span>
        </button>
      );
    }

    return (
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between rounded px-2 py-1 text-sm hover:bg-accent">
            <span className="flex items-center gap-2">
              <FolderIcon className="size-4" />
              <span className="truncate">{item.name}</span>
            </span>
            <ChevronRight className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
        </CollapsibleTrigger>
        {children && children.length > 0 && (
          <CollapsibleContent className="pl-4">
            <div className="flex flex-col">
              {children.map((c) => (
                <FileTreeItem key={c.path} item={c} />
              ))}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    );
  }

  return (
      <div className="h-full min-h-0 flex flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
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
          </div>
        </header>
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
          <ResizablePanel defaultSize={24} minSize={16} maxSize={40} className="min-w-[180px]">
            <div className="h-full overflow-auto p-2">
              <div className="text-xs text-muted-foreground px-1 pb-2">Files</div>
              <div className="flex flex-col">
                {nodes && nodes.length > 0 ? (
                  nodes.map((n) => <FileTreeItem key={n.path} item={n} />)
                ) : (
                  <div className="px-2 py-1 text-sm text-muted-foreground">No files yet</div>
                )}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle className="shadow-2xl" />
          <ResizablePanel defaultSize={76} minSize={40}>
            <div className="h-full">
              <CodeEditor
                value={code}
                onChange={setCode}
                language="typescript"
                theme="system"
                
                readOnly={true}
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
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
  );
}


