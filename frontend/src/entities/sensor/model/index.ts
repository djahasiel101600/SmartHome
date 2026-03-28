import { create } from "zustand";
import type { SensorReading } from "@/shared/types";

interface SensorStore {
  latest: SensorReading | null;
  history: SensorReading[];
  setLatest: (reading: SensorReading) => void;
  setHistory: (readings: SensorReading[]) => void;
  addReading: (reading: SensorReading) => void;
}

export const useSensorStore = create<SensorStore>((set) => ({
  latest: null,
  history: [],
  setLatest: (reading) => set({ latest: reading }),
  setHistory: (readings) => set({ history: readings }),
  addReading: (reading) =>
    set((state) => ({
      latest: reading,
      history: [...state.history, reading],
    })),
}));
