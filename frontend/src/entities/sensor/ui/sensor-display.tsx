import { Card, CardContent } from "@/shared/ui";
import type { SensorReading } from "@/shared/types";
import { Thermometer, Droplets } from "lucide-react";

interface SensorDisplayProps {
  reading: SensorReading | null;
}

export function SensorDisplay({ reading }: SensorDisplayProps) {
  if (!reading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Thermometer className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">No sensor data available</p>
          <p className="text-xs mt-1">Waiting for device to report...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
              <Thermometer className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Temperature
              </p>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {reading.temperature.toFixed(1)}
                <span className="text-lg font-medium text-slate-400 ml-0.5">
                  °C
                </span>
              </p>
            </div>
          </div>
          <div className="h-1 bg-linear-to-r from-amber-400 to-orange-500" />
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-500">
              <Droplets className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Humidity
              </p>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {reading.humidity.toFixed(1)}
                <span className="text-lg font-medium text-slate-400 ml-0.5">
                  %
                </span>
              </p>
            </div>
          </div>
          <div className="h-1 bg-linear-to-r from-sky-400 to-blue-500" />
        </CardContent>
      </Card>
    </div>
  );
}
