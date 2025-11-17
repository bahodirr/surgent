'use client';

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AutumnProvider } from 'autumn-js/react';

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <AutumnProvider betterAuthUrl={process.env.NEXT_PUBLIC_BACKEND_URL!}>
        {children}
      </AutumnProvider>
    </QueryClientProvider>
  );
}


