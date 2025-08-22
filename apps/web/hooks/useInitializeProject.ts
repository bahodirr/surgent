"use client";

import { useMutation } from '@tanstack/react-query';

export function useInitializeProject() {
  const mutation = useMutation({
    mutationKey: ['initialize-project'],
    mutationFn: async (projectId: string) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.details || data?.error || 'Failed to initialize');
      return data as any;
    },
  });

  const previewUrl = mutation.data?.previewUrl;

  return {
    initialize: mutation.mutate,
    isInitializing: mutation.status === 'pending',
    isSuccess: mutation.status === 'success',
    isError: mutation.status === 'error',
    previewUrl,
    error: (mutation.error as Error | null) || null,
  } as const;
}


