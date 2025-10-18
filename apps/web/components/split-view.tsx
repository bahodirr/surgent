"use client";

import Conversation from './conversation';
import PreviewPanel from './preview-panel';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface SplitViewProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function SplitView({ projectId, onPreviewUrl }: SplitViewProps) {
  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="flex-1 min-h-0">
        <div className="h-full min-h-0 hidden md:block">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={40} minSize={30}>
              <Conversation projectId={projectId} />
            </ResizablePanel>
            <ResizableHandle className="shadow-2xl" />
            <ResizablePanel defaultSize={60} minSize={30}>
              <div className="h-full bg-background">
                <PreviewPanel projectId={projectId} onPreviewUrl={onPreviewUrl} />
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
                <Conversation projectId={projectId} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 px-3 pb-3">
                <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-background">
                  <PreviewPanel projectId={projectId} onPreviewUrl={onPreviewUrl} />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
