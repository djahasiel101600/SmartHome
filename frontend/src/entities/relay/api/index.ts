import { api } from "@/shared/api";
import type { Relay } from "@/shared/types";

export const relayApi = {
  getByDevice: (deviceId: number) => api.get<Relay[]>(`/api/devices/${deviceId}/relays/`),
  create: (deviceId: number, label: string) =>
    api.post<Relay>(`/api/devices/${deviceId}/relays/create/`, { label }),
  delete: (relayId: number) => api.delete(`/api/relays/${relayId}/delete/`),
  toggle: (relayId: number, state: boolean) =>
    api.post<Relay>(`/api/relays/${relayId}/toggle/`, { state }),
  updateLabel: (relayId: number, label: string) =>
    api.patch<Relay>(`/api/relays/${relayId}/`, { label }),
};
