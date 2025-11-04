"use client";

import { useEffect, useRef } from 'react';
import Conversation from './conversation';
import PreviewPanel from './preview-panel';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useActivateProject, useProjectQuery } from '@/queries/projects';
import { useSandbox } from '@/hooks/use-sandbox';
import { useEnsureSession } from '@/queries/chats';

interface SplitViewProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function SplitView({ projectId, onPreviewUrl }: SplitViewProps) {
  const { mutate: activateProject } = useActivateProject();
  const { data: project } = useProjectQuery(projectId);
  const setSandboxId = useSandbox((state: any) => state.setSandboxId);
  const lastActivatedId = useRef<string | undefined>(undefined);
  const { data: session } = useEnsureSession(projectId);

  // Activate project sandbox on mount
  useEffect(() => {
    if (!projectId) return;
    if (lastActivatedId.current === projectId) return;

    lastActivatedId.current = projectId;
    activateProject({ id: projectId });
  }, [projectId, activateProject]);

  // Set sandbox ID when project data loads
  useEffect(() => {
    const sandboxId = (project as any)?.sandbox?.id;
    setSandboxId(sandboxId || null);
  }, [project, setSandboxId]);

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="flex-1 min-h-0">
        <div className="h-full min-h-0 hidden md:block">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={40} minSize={30}>
              <Conversation projectId={projectId} sessionId={session?.id} />
            </ResizablePanel>
            <ResizableHandle className="shadow-2xl" />
            <ResizablePanel defaultSize={60} minSize={30}>
              <div className="h-full bg-background">
                <PreviewPanel projectId={projectId} project={project} onPreviewUrl={onPreviewUrl} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <div className="h-full min-h-0 flex flex-col md:hidden">
          <Tabs defaultValue="chat" className="h-full min-h-0 flex flex-col">
            <div className="px-3 pt-3 pb-2">
              <TabsList className="w-full max-w-sm mx-auto h-10 !p-1">
                <TabsTrigger value="chat" className="cursor-pointer select-none px-3">Conversation</TabsTrigger>
                <TabsTrigger value="preview" className="cursor-pointer select-none px-3">Preview</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chat" className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 px-3 pb-3">
                <Conversation projectId={projectId} sessionId={session?.id} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 px-3 pb-3">
                <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-background">
                  <PreviewPanel projectId={projectId} project={project} onPreviewUrl={onPreviewUrl} />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
