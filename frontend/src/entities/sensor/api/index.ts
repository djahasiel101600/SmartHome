import { api } from "@/shared/api";
import type { SensorAggregate, SensorInsight, SensorReading, SensorStats } from "@/shared/types";

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const sensorApi = {
  getLatest: () => api.get<SensorReading>("/api/sensors/latest/"),
  getHistory: (range: string = "24h") =>
    api.get<PaginatedResponse<SensorReading>>("/api/sensors/history/", {
      params: { range },
    }),
  getAggregatedHistory: (range: string = "7d") =>
    api.get<PaginatedResponse<SensorAggregate>>("/api/sensors/history/aggregated/", {
      params: { range },
    }),
  getStats: (range: string = "24h") =>
    api.get<SensorStats>("/api/sensors/stats/", {
      params: { range },
    }),
  getLatestInsight: () => api.get<SensorInsight>("/api/sensors/insights/latest/"),
};
