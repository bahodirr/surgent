import { create } from "zustand";

type SandboxState = {
  sandboxId?: string | null;
  setSandboxId: (id: string | null | undefined) => void;
  connected: boolean;
  setConnected: (connected: boolean) => void;
};

export const useSandbox = create<SandboxState>((set) => ({
  sandboxId: null,
  setSandboxId: (id) => set({ sandboxId: id ?? null }),
  connected: false,
  setConnected: (connected) => set({ connected }),
}));


