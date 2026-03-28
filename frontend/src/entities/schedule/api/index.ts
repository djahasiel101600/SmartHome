import { api } from "@/shared/api";
import type { Schedule } from "@/shared/types";

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const scheduleApi = {
  getAll: () => api.get<PaginatedResponse<Schedule>>("/api/schedules/"),
  getByRelay: (relayId: number) =>
    api.get<PaginatedResponse<Schedule>>(`/api/relays/${relayId}/schedules/`),
  delete: (id: number) => api.delete(`/api/schedules/${id}/`),
  toggle: (id: number) => api.post<Schedule>(`/api/schedules/${id}/toggle/`),
  createTimer: (data: { relay_id: number; duration_minutes: number; action: string }) =>
    api.post<Schedule>("/api/schedules/timer/", data),
  createRecurring: (data: {
    relay_id: number;
    time: string;
    days_of_week: number[];
    action: string;
  }) => api.post<Schedule>("/api/schedules/recurring/", data),
};
