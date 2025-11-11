import FullChat from '@/components/chat/full-chat';

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ initial?: string }>;
}) {
  const params = await searchParams;
  const initial = typeof params?.initial === 'string' ? params?.initial : undefined;
  return <FullChat initialPrompt={initial} />;
}


