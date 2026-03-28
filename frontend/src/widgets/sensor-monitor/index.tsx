import { SensorDisplay } from "@/entities/sensor";
import { useSensorStore } from "@/entities/sensor";
import { Activity } from "lucide-react";

export function SensorMonitor() {
  const latest = useSensorStore((s) => s.latest);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Environment
        </h2>
      </div>
      <SensorDisplay reading={latest} />
    </section>
  );
}
