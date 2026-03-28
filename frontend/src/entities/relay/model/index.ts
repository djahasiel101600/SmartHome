import { create } from "zustand";
import type { Relay } from "@/shared/types";

interface RelayStore {
  relays: Relay[];
  setRelays: (relays: Relay[]) => void;
  updateRelayState: (relayId: number, state: boolean) => void;
  updateRelayLabel: (relayId: number, label: string) => void;
}

export const useRelayStore = create<RelayStore>((set) => ({
  relays: [],
  setRelays: (relays) => set({ relays }),
  updateRelayState: (relayId, state) =>
    set((s) => ({
      relays: s.relays.map((r) => (r.id === relayId ? { ...r, state } : r)),
    })),
  updateRelayLabel: (relayId, label) =>
    set((s) => ({
      relays: s.relays.map((r) => (r.id === relayId ? { ...r, label } : r)),
    })),
}));
