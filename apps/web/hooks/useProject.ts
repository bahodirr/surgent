"use client";

import { useQuery } from '@tanstack/react-query';

export interface Project {
  id: string;
  name: string;
  sandbox_metadata?: { preview_url?: string } | null;
}

export function useProject(projectId?: string) {
  const query = useQuery<{ project: Project }>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Missing project id');
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load project');
      return res.json();
    },
    enabled: Boolean(projectId),
  });

  return {
    project: query.data?.project,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) || null,
    refetch: query.refetch,
  } as const;
}


