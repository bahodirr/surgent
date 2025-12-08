"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import type { FileDiff } from "@opencode-ai/sdk";
import Conversation from './conversation';
import PreviewPanel, { type PreviewTab } from './preview-panel';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useActivateProject, useProjectQuery } from '@/queries/projects';
import { useSandbox } from '@/hooks/use-sandbox';
import { useIsMobile } from '@/hooks/use-mobile';

interface SplitViewProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
  initialPrompt?: string;
}

export default function SplitView({ projectId, onPreviewUrl, initialPrompt }: SplitViewProps) {
  const { mutate: activateProject } = useActivateProject();
  const { data: project } = useProjectQuery(projectId);
  const setSandboxId = useSandbox((state: any) => state.setSandboxId);
  const lastActivatedId = useRef<string | undefined>(undefined);
  const isMobile = useIsMobile();
  
  const [tabs, setTabs] = useState<PreviewTab[]>([
    { id: 'preview', type: 'preview', title: 'Preview' },
  ]);
  const [activeTabId, setActiveTabId] = useState('preview');
  const tabCounter = useRef(0);

  const handleViewChanges = useCallback((diffs: FileDiff[], messageId?: string) => {
    const existingTab = messageId ? tabs.find(t => t.messageId === messageId) : null;
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }
    const id = `changes-${++tabCounter.current}`;
    const title = `Changes ${diffs.length > 1 ? `(${diffs.length})` : diffs[0]?.file.split(/[/\\]/).pop() || ''}`;
    setTabs(t => [...t, { id, type: 'changes', title, diffs, messageId }]);
    setActiveTabId(id);
  }, [tabs]);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(t => t.filter(tab => tab.id !== tabId));
    setActiveTabId(prev => (prev === tabId ? 'preview' : prev));
  }, []);

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
        {isMobile ? (
          <div className="h-full min-h-0 flex flex-col">
            <Tabs defaultValue="chat" className="h-full min-h-0 flex flex-col">
              <div className="px-3 pt-3 pb-2">
                <TabsList className="w-full max-w-sm mx-auto h-10 p-1!">
                  <TabsTrigger value="chat" className="cursor-pointer select-none px-3">Conversation</TabsTrigger>
                  <TabsTrigger value="preview" className="cursor-pointer select-none px-3">Preview</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="chat" className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 px-3 pb-3">
                  <Conversation projectId={projectId} initialPrompt={initialPrompt} onViewChanges={handleViewChanges} />
                </div>
              </TabsContent>
              <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 px-3 pb-3">
                  <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-background">
                    <PreviewPanel projectId={projectId} project={project} onPreviewUrl={onPreviewUrl} tabs={tabs} activeTabId={activeTabId} onTabChange={setActiveTabId} onCloseTab={handleCloseTab} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="h-full min-h-0">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={40} minSize={30}>
                <Conversation projectId={projectId} initialPrompt={initialPrompt} onViewChanges={handleViewChanges} />
              </ResizablePanel>
              <ResizableHandle className="shadow-2xl" />
              <ResizablePanel defaultSize={60} minSize={30}>
                <div className="h-full bg-background">
                  <PreviewPanel projectId={projectId} project={project} onPreviewUrl={onPreviewUrl} tabs={tabs} activeTabId={activeTabId} onTabChange={setActiveTabId} onCloseTab={handleCloseTab} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        )}
      </div>
    </div>
  );
}
