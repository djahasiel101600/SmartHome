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
  update: (id: number, data: Record<string, unknown>) =>
    api.patch<Schedule>(`/api/schedules/${id}/update/`, data),
  createTimer: (data: {
    relay_id: number;
    duration_minutes: number;
    action: string;
    counter_action_minutes?: number | null;
  }) => api.post<Schedule>("/api/schedules/timer/", data),
  createRecurring: (data: {
    relay_id: number;
    time: string;
    days_of_week: number[];
    action: string;
    counter_action_minutes?: number | null;
  }) => api.post<Schedule>("/api/schedules/recurring/", data),
  createAutomation: (data: {
    relay_id: number;
    sensor_field: string;
    operator: string;
    threshold_value: number;
    action: string;
    cooldown_minutes: number;
    counter_action_minutes?: number | null;
    source_device_id?: string;
  }) => api.post<Schedule>("/api/schedules/automation/", data),
};
