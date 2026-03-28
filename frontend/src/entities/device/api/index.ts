import { api } from "@/shared/api";
import type { Device } from "@/shared/types";

export const deviceApi = {
  getAll: () => api.get<Device[]>("/api/devices/"),
  getById: (id: number) => api.get<Device>(`/api/devices/${id}/`),
  create: (name: string) => api.post<Device>("/api/devices/", { name }),
  update: (id: number, name: string) => api.patch<Device>(`/api/devices/${id}/`, { name }),
};
