'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api, Id } from '@repo/backend';
import PreviewPanel from './preview-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import Conversation from './conversation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExternalLink, Rocket } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

interface SplitViewProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function SplitView({ projectId, onPreviewUrl }: SplitViewProps) {
  const activateProject = useMutation(api.projects.activateProject);
  const project = useQuery(api.projects.getProject, projectId ? { projectId: projectId as Id<'projects'> } : 'skip');
  const deployProject = useMutation(api.projects.deployProject);

  const proxyHost = process.env.NEXT_PUBLIC_PROXY_URL;
  const sandboxId = project?.sandboxId;
  const hasSandbox = Boolean(sandboxId && proxyHost);
  const isReady = hasSandbox;
  const previewUrl = isReady ? `https://3000-${sandboxId}.${proxyHost}` : undefined;
  const isDeployed = project?.sandbox?.deployed || false;

  useEffect(() => {
    if (!projectId) return;
    activateProject({ projectId: projectId as Id<'projects'> }).catch(() => {});
  }, [projectId, activateProject]);

  const initStatus: 'idle' | 'initializing' | 'ready' | 'error' = isReady ? 'ready' : 'initializing';

  // Deploy dialog state
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deployName, setDeployName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const sanitize = (value: string) => {
    const lower = value.toLowerCase();
    const replaced = lower.replace(/[^a-z0-9-]+/g, '-');
    const collapsed = replaced.replace(/-+/g, '-');
    const trimmed = collapsed.replace(/^-+|-+$/g, '');
    return trimmed.slice(0, 63);
  };

  const previewDomain = deployName ? `${sanitize(deployName)}.surgent.dev` : 'your-app.surgent.dev';

  const handleConfirmDeploy = async () => {
    if (!projectId || isDeploying) return;
    const sanitized = sanitize(deployName);
    if (!sanitized) {
      setNameError('Please enter a valid name.');
      return;
    }
    setNameError(null);
    setIsDeploying(true);
    try {
      await deployProject({ projectId: projectId as Id<'projects'>, deployName: sanitized });
      setIsDialogOpen(false);
    } catch {}
    setIsDeploying(false);
  };
  // Conversation now owns sessions/messages and send flow

  useEffect(() => {
    if (!onPreviewUrl) return;
    onPreviewUrl(previewUrl ?? null);
  }, [previewUrl, onPreviewUrl]);



  const previewHeader = (
    <div className="flex items-center justify-between p-2 border-b">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium">Preview</h3>
        
      </div>
      <div className="flex items-center gap-3">
        {(project as any)?.deployment?.status ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
            <span
              className={`h-2 w-2 rounded-full ${
                String((project as any)?.deployment?.status || '') === 'deployed'
                  ? 'bg-green-500'
                  : ['build_failed','deploy_failed'].includes(String((project as any)?.deployment?.status || ''))
                  ? 'bg-red-500'
                  : ['queued','starting','resuming','building','uploading'].includes(String((project as any)?.deployment?.status || ''))
                  ? 'bg-blue-500 animate-pulse'
                  : 'bg-muted-foreground/50'
              }`}
            />
            {String((project as any)?.deployment?.status).replace('_', ' ')}
          </span>
        ) : null}
        {String((project as any)?.deployment?.status || '') === 'deployed' ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                if ((project as any)?.deployment?.name) setDeployName((project as any)?.deployment?.name);
                setIsDialogOpen(true);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Rocket className="h-4 w-4" /> Redeploy
              </span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              disabled={!previewUrl}
              onClick={() => {
                if (!previewUrl) return;
                window.open(previewUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="h-4 w-4" /> Open
            </Button>
          </div>
        ) : ['queued','starting','resuming','building','uploading'].includes(String((project as any)?.deployment?.status || '')) ? (
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer"
            disabled={!previewUrl}
            onClick={() => {
              if (!previewUrl) return;
              window.open(previewUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            <ExternalLink className="h-4 w-4" /> Open
          </Button>
        ) : (
          <Button
            size="sm"
            className="cursor-pointer"
            disabled={!projectId || isDeploying}
            onClick={() => setIsDialogOpen(true)}
          >
            <span className="inline-flex items-center gap-1">
              <Rocket className="h-4 w-4" /> Deploy
            </span>
          </Button>
        )}
      </div>
    </div>
  );

  // ChatInput is rendered inside Conversation now

  return (
    <>
     <div className="h-screen w-full bg-background flex flex-col">
      <div className="flex-1 min-h-0">
        {/* Desktop / Tablet: Two-column layout */}
        <div className="h-full min-h-0 hidden md:block">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={40} minSize={30}>
              <Conversation projectId={projectId} />
            </ResizablePanel>
            <ResizableHandle className="shadow-2xl" />
            <ResizablePanel defaultSize={60} minSize={30}>
              <div className="h-full bg-background">
                  {previewHeader}
                    <PreviewPanel initStatus={initStatus} previewUrl={previewUrl} onPreviewUrl={onPreviewUrl} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Mobile: Tabbed layout for Conversation and Preview */}
        <div className="h-full min-h-0 flex flex-col md:hidden">
          <Tabs defaultValue="chat" className="h-full min-h-0 flex flex-col">
            <div className="p-2 border-b">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="chat">Conversation</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chat" className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 p-2">
                <Conversation projectId={projectId} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 p-2">
                <div className="h-full min-h-0 rounded-2xl border shadow-sm overflow-hidden bg-background">
                  {previewHeader}
                  <div className="flex-1 min-h-0">
                    <PreviewPanel initStatus={initStatus} previewUrl={previewUrl} onPreviewUrl={onPreviewUrl} />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish your app</DialogTitle>
          <DialogDescription>
            Choose a unique subdomain. Your app will be available at this URL.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center">
            <Input
              className="rounded-r-none"
              placeholder="my-app"
              value={deployName}
              onChange={(e) => setDeployName(e.target.value)}
              onBlur={() => setDeployName(sanitize(deployName))}
              disabled={isDeploying}
            />
            <div className="h-9 px-3 flex items-center border border-input border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground whitespace-nowrap">.surgent.dev</div>
          </div>
          <div className="text-xs text-muted-foreground">Will be published as: {previewDomain}</div>
          {nameError ? (
            <div className="text-xs text-red-500">{nameError}</div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setIsDialogOpen(false)} disabled={isDeploying}>Cancel</Button>
          <Button className="cursor-pointer" onClick={handleConfirmDeploy} disabled={isDeploying}>
            {isDeploying ? 'Deploying…' : 'Deploy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
