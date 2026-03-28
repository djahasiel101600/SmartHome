import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui";
import { sensorApi, useSensorStore } from "@/entities/sensor";
import type { SensorReading } from "@/shared/types";
import { BarChart3 } from "lucide-react";
import { cn } from "@/shared/lib";

const TIME_RANGES = ["1h", "6h", "24h", "7d"] as const;

interface ChartDataPoint {
  time: string;
  temperature: number;
  humidity: number;
}

function toChartData(readings: SensorReading[]): ChartDataPoint[] {
  return readings
    .slice()
    .sort(
      (a, b) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    )
    .map((r) => ({
      time: new Date(r.recorded_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      temperature: Number(r.temperature.toFixed(1)),
      humidity: Number(r.humidity.toFixed(1)),
    }));
}

export function SensorHistoryChart() {
  const [range, setRange] = useState<string>("24h");
  const [loading, setLoading] = useState(false);
  const history = useSensorStore((s) => s.history);
  const setHistory = useSensorStore((s) => s.setHistory);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sensorApi
      .getHistory(range)
      .then(({ data }) => {
        if (!cancelled) setHistory(data.results);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, setHistory]);

  const chartData = toChartData(history);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Sensor History
        </h2>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Temperature &amp; Humidity</CardTitle>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                    range === r
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-72 text-slate-400">
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
                <span className="text-xs">Loading chart data...</span>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-slate-400">
              <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No data for this time range</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8" }}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="left"
                  unit="°C"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8" }}
                />
                <YAxis
                  yAxisId="hum"
                  orientation="right"
                  unit="%"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    fontSize: "13px",
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temperature"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="Temperature (°C)"
                />
                <Line
                  yAxisId="hum"
                  type="monotone"
                  dataKey="humidity"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Humidity (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
