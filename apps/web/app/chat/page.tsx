import FullChat from '@/components/chat/full-chat';

export default function ChatPage({
  searchParams,
}: {
  searchParams?: { initial?: string };
}) {
  const initial = typeof searchParams?.initial === 'string' ? searchParams?.initial : undefined;
  return <FullChat initialPrompt={initial} />;
}


