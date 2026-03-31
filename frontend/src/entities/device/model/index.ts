import { create } from "zustand";
import type { Device } from "@/shared/types";

interface DeviceStore {
  devices: Device[];
  setDevices: (devices: Device[]) => void;
  addDevice: (device: Device) => void;
  removeDevice: (id: number) => void;
  updateDeviceStatus: (deviceId: string, isOnline: boolean) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  setDevices: (devices) => set({ devices }),
  addDevice: (device) =>
    set((state) => ({ devices: [...state.devices, device] })),
  removeDevice: (id) =>
    set((state) => ({ devices: state.devices.filter((d) => d.id !== id) })),
  updateDeviceStatus: (deviceId, isOnline) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.device_id === deviceId ? { ...d, is_online: isOnline } : d
      ),
    })),
}));
