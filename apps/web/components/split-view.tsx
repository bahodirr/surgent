'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api, Id } from '@repo/backend';
import PreviewPanel from './preview-panel';
import Conversation from './conversation';
import ChatInput from './chat-input';
import { cn } from '@/lib/utils';
import { parseMessages, ParsedSessionData } from '@/lib/message-parser';
import { attachCheckpoints } from '@/lib/message-parser';

interface SplitViewProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function SplitView({ projectId, onPreviewUrl }: SplitViewProps) {
  const activateProject = useMutation(api.projects.activateProject);
  const project = useQuery(api.projects.getProject, projectId ? { projectId: projectId as Id<'projects'> } : 'skip');
  const sessions = useQuery(api.sessions.listSessionsByProject, projectId ? { projectId: projectId as Id<'projects'> } : 'skip');

  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [isConversationOpen, setIsConversationOpen] = useState(true);

  const previewUrl = project?.sandbox?.preview_url as string | undefined;

  useEffect(() => {
    if (!projectId) return;
    activateProject({ projectId: projectId as Id<'projects'> }).catch(() => {});
  }, [projectId, activateProject]);

  const initStatus: 'idle' | 'initializing' | 'ready' | 'error' = previewUrl ? 'ready' : 'initializing';

  // Load detailed session (timeline, todos)
  const session = useQuery(api.sessions.getSession, sessionId ? { sessionId: sessionId as Id<'sessions'> } : 'skip');
  const messages = useQuery(api.sessions.listMessagesBySession, sessionId ? { sessionId: sessionId as Id<'sessions'>, limit: 200 } : 'skip');
  const commits = useQuery(api.commits.listBySession, sessionId ? { sessionId: sessionId as Id<'sessions'> } : 'skip');

  // Parse messages using the dedicated parser
  const { timeline, todos } = parseMessages(Array.isArray(messages) ? messages : []);
  const timelineWithCheckpoints = Array.isArray(commits) ? attachCheckpoints(timeline, commits) : timeline;

  // Send handler
  const [isSending, setIsSending] = useState(false);
  const createAndRun = useMutation(api.sessions.createMessageAndRunAgent);
  const handleSend = async (text: string) => {
    if (!text.trim() || !projectId || !sessionId || isSending) return;
    setIsSending(true);
    try {
      await createAndRun({
        projectId: projectId as Id<'projects'>,
        prompt: text,
        sessionId: sessionId as Id<'sessions'>,
      });
    } catch (e) {
      // noop
    } finally {
      setIsSending(false);
    }
  };

  // Select the latest session for this project (default session always exists)
  useEffect(() => {
    if (sessions?.[0]?._id) {
      setSessionId(sessions[0]._id as string);
    }
  }, [sessions]);

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="flex items-center justify-between p-2 border-b">
        <div className="text-sm font-medium">Workspace</div>
        <div className="text-xs text-muted-foreground">
          {initStatus === 'initializing' ? (
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Starting…</span>
          ) : 'Ready'}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <div className={cn("h-full min-h-0 grid grid-cols-[420px_1fr]")}> 
        <div className={cn("min-w-0 order-2 flex flex-col h-full bg-background")}> 
          <div className="flex items-center justify-between p-2 border-b">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium">Preview</h3>
              {previewUrl && initStatus === 'ready' && (
                <a
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                  href={previewUrl}
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
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <PreviewPanel initStatus={initStatus} previewUrl={previewUrl} onPreviewUrl={onPreviewUrl} />
          </div>
        </div>
        <div className="h-full min-h-0 bg-background order-1 flex flex-col">
          <div className="flex items-center justify-between p-2 border-b">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-gray-800">Conversation</h3>
              <span className={cn(
                "text-xs font-medium",
                initStatus === 'initializing' ? 'text-blue-500' : 'text-green-500 hidden'
              )}>
                {initStatus === 'ready' ? 'Ready' : 'Initializing project'}
              </span>
            </div>
            <div className="flex items-center gap-2" />
          </div>
          <div className="flex-1 min-h-0 border-r">
            <Conversation
              isOpen={isConversationOpen}
              setIsOpen={setIsConversationOpen}
              initStatus={{
                state: initStatus === 'ready' ? 'ready' : 'initializing',
                message: initStatus === 'ready' ? 'Ready' : 'Initializing project '
              }}
              timeline={timelineWithCheckpoints}
              todos={todos}
              composer={
                <ChatInput
                  onSubmit={handleSend}
                  disabled={initStatus !== 'ready' || isSending || !projectId}
                  placeholder={initStatus !== 'ready' ? 'Initializing project environment...' : 'Ask anything...'}
                  todos={todos}
                  timeline={timelineWithCheckpoints}
                  
                />
              }
            />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}