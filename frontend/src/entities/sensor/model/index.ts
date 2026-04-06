import { create } from "zustand";
import type { SensorAggregate, SensorInsight, SensorReading, SensorStats, BatteryStatus } from "@/shared/types";

interface SensorStore {
  latest: SensorReading | null;
  history: SensorReading[];
  aggregatedHistory: SensorAggregate[];
  stats: SensorStats | null;
  insight: SensorInsight | null;
  battery: BatteryStatus | null;
  setLatest: (reading: SensorReading) => void;
  setHistory: (readings: SensorReading[]) => void;
  setAggregatedHistory: (aggregates: SensorAggregate[]) => void;
  setStats: (stats: SensorStats) => void;
  addReading: (reading: SensorReading) => void;
  setInsight: (insight: SensorInsight) => void;
  setBattery: (battery: BatteryStatus) => void;
}

export const useSensorStore = create<SensorStore>((set) => ({
  latest: null,
  history: [],
  aggregatedHistory: [],
  stats: null,
  insight: null,
  battery: null,
  setLatest: (reading) => set({ latest: reading }),
  setHistory: (readings) => set({ history: readings }),
  setAggregatedHistory: (aggregates) => set({ aggregatedHistory: aggregates }),
  setStats: (stats) => set({ stats }),
  addReading: (reading) =>
    set((state) => ({
      latest: reading,
      history: [...state.history, reading],
    })),
  setInsight: (insight) => set({ insight }),
  setBattery: (battery) => set({ battery }),
}));
