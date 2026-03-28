import { create } from "zustand";
import type { Schedule } from "@/shared/types";

interface ScheduleStore {
  schedules: Schedule[];
  setSchedules: (schedules: Schedule[]) => void;
  addSchedule: (schedule: Schedule) => void;
  removeSchedule: (id: number) => void;
  updateSchedule: (schedule: Schedule) => void;
}

export const useScheduleStore = create<ScheduleStore>((set) => ({
  schedules: [],
  setSchedules: (schedules) => set({ schedules }),
  addSchedule: (schedule) =>
    set((s) => ({ schedules: [...s.schedules, schedule] })),
  removeSchedule: (id) =>
    set((s) => ({ schedules: s.schedules.filter((sc) => sc.id !== id) })),
  updateSchedule: (schedule) =>
    set((s) => ({
      schedules: s.schedules.map((sc) => (sc.id === schedule.id ? schedule : sc)),
    })),
}));
