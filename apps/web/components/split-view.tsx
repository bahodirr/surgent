'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api, Id } from '@repo/backend';
import PreviewPanel from './preview-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import Conversation from './conversation';
import ChatInput from './chat-input';
import { cn } from '@/lib/utils';
import { parseMessages } from '@/lib/message-parser';
import { attachCheckpoints } from '@/lib/message-parser';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExternalLink, Rocket } from 'lucide-react';

interface SplitViewProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function SplitView({ projectId, onPreviewUrl }: SplitViewProps) {
  const activateProject = useMutation(api.projects.activateProject);
  const project = useQuery(api.projects.getProject, projectId ? { projectId: projectId as Id<'projects'> } : 'skip');
  const sessions = useQuery(api.sessions.listSessionsByProject, projectId ? { projectId: projectId as Id<'projects'> } : 'skip');
  const deployProject = useMutation(api.projects.deployProject);

  const [sessionId, setSessionId] = useState<Id<'sessions'> | undefined>(undefined);

  const proxyHost = process.env.NEXT_PUBLIC_PROXY_URL;
  const sandboxId = project?.sandboxId;
  const hasSession = Boolean(sessionId);
  const hasSandbox = Boolean(sandboxId && proxyHost);
  const isReady = hasSession && hasSandbox;
  const previewUrl = isReady ? `https://3000-${sandboxId}.${proxyHost}` : undefined;
  const isDeployed = project?.sandbox?.deployed || false;

  useEffect(() => {
    setSessionId(undefined);

    if (!projectId) return;
    activateProject({ projectId: projectId as Id<'projects'> }).catch(() => {});
  }, [projectId, activateProject]);

  const initStatus: 'idle' | 'initializing' | 'ready' | 'error' = isReady ? 'ready' : 'initializing';

  // Load detailed session (timeline, todos)
  const messages = useQuery(api.sessions.listMessagesBySession, sessionId ? { sessionId, limit: 200 } : 'skip');
  const commits = useQuery(api.commits.listBySession, sessionId ? { sessionId } : 'skip');

  // Parse messages using the dedicated parser
  const { timeline, todos } = parseMessages(Array.isArray(messages) ? messages : []);
  const timelineWithCheckpoints = Array.isArray(commits) ? attachCheckpoints(timeline, commits) : timeline;

  // Send handler
  const [isSending, setIsSending] = useState(false);
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
  const createAndRun = useMutation(api.sessions.createMessageAndRunAgent);
  const handleSend = async (text: string) => {
    if (!text.trim() || !projectId || !sessionId || isSending) return;
    setIsSending(true);
    try {
      await createAndRun({
        projectId: projectId as Id<'projects'>,
        prompt: text,
        sessionId,
      });
    } catch (e) {
      // noop
    } finally {
      setIsSending(false);
    }
  };

  // Select the latest session for this project (default session always exists)
  useEffect(() => {
    if (!sessions?.length) return;

    if (!sessionId) {
      setSessionId(sessions[0]!._id as Id<'sessions'>);
      return;
    }

    const currentSessionStillExists = sessions.some((session) => session._id === sessionId);
    if (!currentSessionStillExists) {
      setSessionId(sessions[0]!._id as Id<'sessions'>);
    }
  }, [sessions, sessionId]);

  useEffect(() => {
    if (!onPreviewUrl) return;
    onPreviewUrl(previewUrl ?? null);
  }, [previewUrl, onPreviewUrl]);

  const isProjectSelected = Boolean(projectId);
  const spinner = (
    <span className="inline-flex items-center gap-2">
      <span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Starting...
    </span>
  );

  const workspaceStatus = !isProjectSelected ? 'Select a project' : initStatus === 'initializing' ? spinner : 'Ready';
  const previewStatus = !isProjectSelected ? 'Select a project' : initStatus === 'initializing' ? spinner : 'Live';
  const conversationStatusMessage = !isProjectSelected ? 'Select a project to start' : initStatus === 'ready' ? 'Ready' : 'Initializing project';
  const conversationInitState = initStatus === 'ready' ? 'ready' : 'initializing';
  const shouldShowConversationBadge = !isProjectSelected || initStatus === 'initializing';

  const conversationBadgeClass = cn(
    'text-xs font-medium',
    !isProjectSelected ? 'text-muted-foreground' : initStatus === 'initializing' ? 'text-blue-500' : 'text-green-500',
    { hidden: !shouldShowConversationBadge }
  );

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

  const composer = (
    <ChatInput
      onSubmit={handleSend}
      disabled={initStatus !== 'ready' || isSending || !isProjectSelected}
      placeholder={!isProjectSelected ? 'Select a project to start' : initStatus !== 'ready' ? 'Initializing project environment...' : 'Ask anything...'}
      todos={todos}
      timeline={timelineWithCheckpoints}
    />
  );

  return (
    <>
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="flex items-center justify-between p-2 border-b">
        <div className="text-sm font-medium">Workspace</div>
        <div className="text-xs text-muted-foreground">{workspaceStatus}</div>
      </div>
      <div className="flex-1 min-h-0">
        {/* Desktop / Tablet: Two-column layout */}
        <div className={cn("h-full min-h-0 hidden md:grid md:grid-cols-[420px_1fr]")}> 
        <div className={cn("min-w-0 order-2 flex flex-col h-full bg-background")}> 
          {previewHeader}
          <div className="flex-1 min-h-0">
            <PreviewPanel initStatus={initStatus} previewUrl={previewUrl} onPreviewUrl={onPreviewUrl} />
          </div>
        </div>
        <div className="h-full min-h-0 bg-background order-1 flex flex-col">
          <div className="flex-1 min-h-0 border-r">
            <Conversation
              initStatus={{
                state: conversationInitState,
                message: conversationStatusMessage
              }}
              timeline={timelineWithCheckpoints}
              composer={composer}
            />
          </div>
        </div>
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
              <div className="flex-1 min-h-0">
                <Conversation
                  initStatus={{
                    state: conversationInitState,
                    message: conversationStatusMessage
                  }}
                  timeline={timelineWithCheckpoints}
                  composer={composer}
                />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col">
              {previewHeader}
              <div className="flex-1 min-h-0">
                <PreviewPanel initStatus={initStatus} previewUrl={previewUrl} onPreviewUrl={onPreviewUrl} />
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
