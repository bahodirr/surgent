import { create } from "zustand";
import { persist } from "zustand/middleware";

type SandboxState = {
  sandboxId?: string | null;
  setSandboxId: (id: string | null | undefined) => void;
  // Per-project active session
  activeSessionId: Record<string, string>;
  setActiveSession: (projectId: string, sessionId: string) => void;
};

export const useSandbox = create<SandboxState>()(
  persist(
    (set) => ({
      sandboxId: null,
      setSandboxId: (id) => set({ sandboxId: id ?? null }),
      activeSessionId: {},
      setActiveSession: (projectId, sessionId) =>
        set((s) => ({ activeSessionId: { ...s.activeSessionId, [projectId]: sessionId } })),
    }),
    { name: "sandbox-store", partialize: (s) => ({ activeSessionId: s.activeSessionId }) }
  )
);


