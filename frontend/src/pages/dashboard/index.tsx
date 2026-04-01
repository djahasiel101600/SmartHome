import { useEffect } from "react";
import { deviceApi, useDeviceStore } from "@/entities/device";
import { useRelayStore } from "@/entities/relay";
import { sensorApi, useSensorStore } from "@/entities/sensor";
import { scheduleApi, useScheduleStore } from "@/entities/schedule";
import { RelayControlPanel } from "@/widgets/relay-control-panel";
import { SensorMonitor } from "@/widgets/sensor-monitor";
import { SensorInsights } from "@/widgets/sensor-insights";
import { SensorHistoryChart } from "@/widgets/sensor-history-chart";
import { ScheduleList } from "@/widgets/schedule-list";
import { Badge } from "@/shared/ui";
import { Cpu, Clock } from "lucide-react";

export function DashboardPage() {
  const setDevices = useDeviceStore((s) => s.setDevices);
  const setRelays = useRelayStore((s) => s.setRelays);
  const setLatest = useSensorStore((s) => s.setLatest);
  const setInsight = useSensorStore((s) => s.setInsight);
  const setSchedules = useScheduleStore((s) => s.setSchedules);
  const devices = useDeviceStore((s) => s.devices);

  useEffect(() => {
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

    sensorApi
      .getLatest()
      .then(({ data }) => setLatest(data))
      .catch(() => {});

    sensorApi
      .getLatestInsight()
      .then(({ data }) => setInsight(data))
      .catch(() => {});

    scheduleApi.getAll().then(({ data }) => {
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setSchedules(list);
    });
  }, [setDevices, setRelays, setLatest, setInsight, setSchedules]);

  return (
    <div className="px-6 lg:px-8 py-6 space-y-8 max-w-6xl mx-auto animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Dashboard
        </h1>
        {devices.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <Cpu className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">
              {devices[0].name}
            </span>
            <Badge variant={devices[0].is_online ? "success" : "destructive"}>
              {devices[0].is_online ? "Online" : "Offline"}
            </Badge>
            {devices[0].last_seen && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                Last seen {new Date(devices[0].last_seen).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sensor readings */}
      <SensorMonitor />

      {/* AI insights */}
      <SensorInsights />

      {/* Relay controls */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Relay Controls
          </h2>
        </div>
        <RelayControlPanel />
      </section>

      {/* Sensor history chart */}
      <SensorHistoryChart />

      {/* Schedules */}
      <ScheduleList />
    </div>
  );
}
