import { api } from "@/shared/api";
import type { Device, FirmwareVersion } from "@/shared/types";

export const deviceApi = {
  getAll: () => api.get<Device[]>("/api/devices/"),
  getById: (id: number) => api.get<Device>(`/api/devices/${id}/`),
  create: (name: string) => api.post<Device>("/api/devices/", { name }),
  update: (id: number, name: string) => api.patch<Device>(`/api/devices/${id}/`, { name }),
  delete: (id: number) => api.delete(`/api/devices/${id}/`),
  triggerOTA: (deviceId: number, firmwareId: number) =>
    api.post(`/api/devices/${deviceId}/ota/`, { firmware_id: firmwareId }),
};

export const firmwareApi = {
  getAll: () => api.get<FirmwareVersion[]>("/api/firmware/"),
  upload: (file: File, version: string, releaseNotes: string) => {
    const formData = new FormData();
    formData.append("binary", file);
    formData.append("version", version);
    formData.append("release_notes", releaseNotes);
    return api.post<FirmwareVersion>("/api/firmware/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  delete: (id: number) => api.delete(`/api/firmware/${id}/delete/`),
};
