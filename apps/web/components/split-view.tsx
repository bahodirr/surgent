'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInitializeProject } from '@/hooks/useInitializeProject';
import { useProject } from '@/hooks/useProject';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import TerminalWrapper from './terminal-wrapper';
import Conversation from './conversation';

interface SplitViewProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function SplitView({ projectId, onPreviewUrl }: SplitViewProps) {
  const [showTerminal, setShowTerminal] = useState(false);
  const { initialize, isInitializing, isSuccess, isError, previewUrl } = useInitializeProject();
  const { project } = useProject(projectId);

  useEffect(() => {
    if (projectId) {
      initialize(projectId, {
        onSuccess: (data: any) => onPreviewUrl?.(data?.previewUrl || data?.devServerUrl || null),
      } as any);
    }
  }, [projectId]);

  const initStatus: 'idle' | 'initializing' | 'ready' | 'error' = isInitializing ? 'initializing' : isSuccess ? 'ready' : isError ? 'error' : 'idle';
  const isChatDisabled = useMemo(() => initStatus !== 'ready', [initStatus]);
  const chatInitStatus = useMemo(() => {
    if (initStatus === 'initializing') return { state: 'initializing', message: 'Initializing project...' } as const;
    if (initStatus === 'error') return { state: 'error', message: 'Initialization failed' } as const;
    return null;
  }, [initStatus]);
  

  return (
    <div className="h-screen w-full bg-background">
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full rounded-lg border"
      >
        <ResizablePanel defaultSize={30} minSize={30}>
          <div className="h-full flex flex-col">
            <div className="border-b bg-muted/50 px-4 py-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Workspace</h3>
              <div className="flex items-center gap-2">
                <Label htmlFor="view-switch" className="text-xs text-muted-foreground cursor-pointer">
                  Terminal
                </Label>
                <Switch
                  id="view-switch"
                  checked={!showTerminal}
                  onCheckedChange={(checked) => setShowTerminal(!checked)}
                  className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor="view-switch" className="text-xs text-muted-foreground cursor-pointer">
                  Chat
                </Label>
              </div>
            </div>
            
            {showTerminal ? (
              <div className="flex-1 overflow-hidden">
                <TerminalWrapper />
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <Conversation disabled={isChatDisabled} initStatus={chatInitStatus as any} projectId={projectId} />
              </div>
            )}
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={70} minSize={50}>
          <div className="h-full flex flex-col">
            <div className="border-b bg-muted px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium">Preview</h3>
                {project?.name && (
                  <span className="text-xs text-muted-foreground">{project.name}</span>
                )}
                {(previewUrl || project?.sandbox_metadata?.preview_url) && initStatus === 'ready' && (
                  <a
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                    href={(previewUrl || project?.sandbox_metadata?.preview_url) as string}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {initStatus === 'initializing' && (
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Starting...</span>
                )}
                {initStatus === 'ready' && 'Live'}
                {initStatus === 'error' && <span className="text-destructive">Failed</span>}
              </div>
            </div>
            <div className="flex-1 bg-background">
              {initStatus !== 'ready' ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                    <div className="h-8 w-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                    <span>Preparing preview...</span>
                  </div>
                </div>
              ) : (
                <iframe
                  src={previewUrl || project?.sandbox_metadata?.preview_url || 'about:blank'}
                  className="w-full h-full border-0"
                  title="Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}