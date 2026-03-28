import { api } from "@/shared/api";
import type { Relay } from "@/shared/types";

export const relayApi = {
  getByDevice: (deviceId: number) => api.get<Relay[]>(`/api/devices/${deviceId}/relays/`),
  toggle: (relayId: number, state: boolean) =>
    api.post<Relay>(`/api/relays/${relayId}/toggle/`, { state }),
  updateLabel: (relayId: number, label: string) =>
    api.patch<Relay>(`/api/relays/${relayId}/`, { label }),
};
