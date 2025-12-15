import { validateUIMessages, UIMessage } from 'ai';
import { codingAgent } from '@/lib/agent';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  return codingAgent.respond({
    messages: await validateUIMessages({ messages }),
  });
}

  