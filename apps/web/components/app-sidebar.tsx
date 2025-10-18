"use client"

import * as React from "react"
import { useState, useCallback, useEffect } from "react"
import { ChevronRight, File, Folder, Loader2 } from "lucide-react"
import { useAction } from "convex/react"
import { api, Id } from "@repo/backend"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from "@/components/ui/sidebar"

type FsNode = { name: string; path: string; isDir: boolean; children?: FsNode[] }

export function AppSidebar({ projectId, onOpenFile, ...props }: React.ComponentProps<typeof Sidebar> & { projectId?: Id<'projects'>; onOpenFile?: (path: string) => void }) {
  const getTree = useAction(api.files.getFileTree)
  const [nodes, setNodes] = useState<FsNode[]>()

  useEffect(() => {
    if (!projectId) { setNodes([]); return }
    getTree({ projectId, depth: 1, maxEntries: 500 })
      .then((res) => setNodes(res as FsNode[]))
      .catch(() => setNodes([]))
  }, [projectId, getTree])

  return (
    <Sidebar {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Files</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nodes && nodes.length > 0 ? (
                nodes.map((n) => <FsTree key={n.path} item={n} projectId={projectId} onOpenFile={onOpenFile} />)
              ) : (
                <div className="p-2 text-sm text-muted-foreground">No files yet</div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

function FsTree({ item, projectId, onOpenFile }: { item: FsNode; projectId?: Id<'projects'>; onOpenFile?: (path: string) => void }) {
  const listFiles = useAction(api.files.listFiles)
  const [isOpen, setIsOpen] = useState(false)
  const [children, setChildren] = useState<FsNode[]>()

  const loadChildren = useCallback(async () => {
    if (!projectId || !item.isDir || children) return;
    const res = await listFiles({ projectId, path: item.path });
    setChildren(res as FsNode[]);
  }, [projectId, item.isDir, item.path]);

  const handleToggle = useCallback(() => {
    if (!isOpen && !children) loadChildren();
    setIsOpen(!isOpen);
  }, [isOpen, children]);

  if (!item.isDir) return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => onOpenFile?.(item.path)} className="cursor-pointer">
        <File className="size-4" />
        {item.name}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <SidebarMenuItem>
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <Folder className="size-4" />
              {item.name}
            </div>
              <ChevronRight className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        {children && children.length > 0 && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {children.map((sub) => <FsTree key={sub.path} item={sub} projectId={projectId} onOpenFile={onOpenFile} />)}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </Collapsible>
    </SidebarMenuItem>
  )
}

export default AppSidebar
