import Conversation from '@/components/conversation';

export default function ChatSection({ projectId }: { projectId: string }) {
  return (
    <div className="h-full min-h-0 flex flex-col p-2">
      <div className="flex-1 min-h-0">
        <Conversation projectId={projectId} />
      </div>
    </div>
  );
}


