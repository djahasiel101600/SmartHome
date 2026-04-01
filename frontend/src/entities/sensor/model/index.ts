import { create } from "zustand";
import type { SensorInsight, SensorReading } from "@/shared/types";

interface SensorStore {
  latest: SensorReading | null;
  history: SensorReading[];
  insight: SensorInsight | null;
  setLatest: (reading: SensorReading) => void;
  setHistory: (readings: SensorReading[]) => void;
  addReading: (reading: SensorReading) => void;
  setInsight: (insight: SensorInsight) => void;
}

export const useSensorStore = create<SensorStore>((set) => ({
  latest: null,
  history: [],
  insight: null,
  setLatest: (reading) => set({ latest: reading }),
  setHistory: (readings) => set({ history: readings }),
  addReading: (reading) =>
    set((state) => ({
      latest: reading,
      history: [...state.history, reading],
    })),
  setInsight: (insight) => set({ insight }),
}));
