import { useEffect } from "react";
import { scheduleApi, useScheduleStore } from "@/entities/schedule";
import { useRelayStore } from "@/entities/relay";
import { deviceApi, useDeviceStore } from "@/entities/device";
import { ScheduleList } from "@/widgets/schedule-list";

export function SchedulesPage() {
  const setSchedules = useScheduleStore((s) => s.setSchedules);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const setRelays = useRelayStore((s) => s.setRelays);

  useEffect(() => {
    scheduleApi.getAll().then(({ data }) => {
      const list = Array.isArray(data) ? data : ((data as any).results ?? []);
      setSchedules(list);
    });

    deviceApi.getAll().then(({ data }) => {
      const deviceList = Array.isArray(data)
        ? data
        : ((data as any).results ?? []);
      setDevices(deviceList);
      if (deviceList.length > 0) {
        const allRelays = deviceList.flatMap((d: any) => d.relays ?? []);
        setRelays(allRelays);
      }
    });
  }, [setSchedules, setDevices, setRelays]);

  return (
    <div className="px-6 lg:px-8 py-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Schedules
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Automate your relays with timers and recurring schedules
        </p>
      </div>
      <ScheduleList />
    </div>
  );
}
