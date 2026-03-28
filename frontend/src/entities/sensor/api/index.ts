import { api } from "@/shared/api";
import type { SensorReading } from "@/shared/types";

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
};
