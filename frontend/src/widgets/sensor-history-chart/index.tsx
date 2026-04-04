import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Brush,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui";
import { sensorApi, useSensorStore } from "@/entities/sensor";
import type { SensorReading, SensorAggregate } from "@/shared/types";
import { BarChart3 } from "lucide-react";
import { cn } from "@/shared/lib";

const TIME_RANGES = ["1h", "6h", "24h", "7d", "30d", "90d", "1y"] as const;

// Ranges that use aggregated (hourly/daily) data instead of raw readings
const AGGREGATED_RANGES = new Set(["7d", "30d", "90d", "1y"]);

interface RawChartDataPoint {
  time: string;
  timestamp: number;
  temperature: number;
  humidity: number;
}

interface AggregatedChartDataPoint {
  time: string;
  timestamp: number;
  temp_avg: number;
  temp_min: number;
  temp_max: number;
  humidity_avg: number;
  humidity_min: number;
  humidity_max: number;
  // For Area range rendering [min, max]
  tempRange: [number, number];
  humidityRange: [number, number];
}

function formatTimeLabel(date: Date, range: string): string {
  if (["1h", "6h", "24h"].includes(range)) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (["7d", "30d"].includes(range)) {
    return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  // 90d, 1y
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function toRawChartData(readings: SensorReading[], range: string): RawChartDataPoint[] {
  return readings
    .slice()
    .sort(
      (a, b) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    )
    .map((r) => {
      const d = new Date(r.recorded_at);
      return {
        time: formatTimeLabel(d, range),
        timestamp: d.getTime(),
        temperature: Number(r.temperature.toFixed(1)),
        humidity: Number(r.humidity.toFixed(1)),
      };
    });
}

function toAggregatedChartData(
  aggregates: SensorAggregate[],
  range: string,
): AggregatedChartDataPoint[] {
  return aggregates
    .slice()
    .sort(
      (a, b) =>
        new Date(a.period_start).getTime() - new Date(b.period_start).getTime(),
    )
    .map((a) => {
      const d = new Date(a.period_start);
      return {
        time: formatTimeLabel(d, range),
        timestamp: d.getTime(),
        temp_avg: Number(a.temp_avg.toFixed(1)),
        temp_min: Number(a.temp_min.toFixed(1)),
        temp_max: Number(a.temp_max.toFixed(1)),
        humidity_avg: Number(a.humidity_avg.toFixed(1)),
        humidity_min: Number(a.humidity_min.toFixed(1)),
        humidity_max: Number(a.humidity_max.toFixed(1)),
        tempRange: [Number(a.temp_min.toFixed(1)), Number(a.temp_max.toFixed(1))],
        humidityRange: [
          Number(a.humidity_min.toFixed(1)),
          Number(a.humidity_max.toFixed(1)),
        ],
      };
    });
}

interface SensorHistoryChartProps {
  range: string;
  onRangeChange: (range: string) => void;
}

export function SensorHistoryChart({ range, onRangeChange }: SensorHistoryChartProps) {
  const [loading, setLoading] = useState(false);
  const history = useSensorStore((s) => s.history);
  const aggregatedHistory = useSensorStore((s) => s.aggregatedHistory);
  const setHistory = useSensorStore((s) => s.setHistory);
  const setAggregatedHistory = useSensorStore((s) => s.setAggregatedHistory);

  const isAggregated = AGGREGATED_RANGES.has(range);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (isAggregated) {
      sensorApi
        .getAggregatedHistory(range)
        .then(({ data }) => {
          if (!cancelled) setAggregatedHistory(data.results);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      sensorApi
        .getHistory(range)
        .then(({ data }) => {
          if (!cancelled) setHistory(data.results);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [range, isAggregated, setHistory, setAggregatedHistory]);

  const rawChartData = isAggregated ? [] : toRawChartData(history, range);
  const aggChartData = isAggregated
    ? toAggregatedChartData(aggregatedHistory, range)
    : [];

  const chartData = isAggregated ? aggChartData : rawChartData;
  const showBrush = chartData.length > 30;

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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle>Temperature &amp; Humidity</CardTitle>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => onRangeChange(r)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150",
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
          {isAggregated && (
            <p className="text-xs text-slate-400 mt-1">
              Showing {range === "1y" ? "daily" : "hourly"} averages with min/max bands
            </p>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-80 text-slate-400">
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
                <span className="text-xs">Loading chart data...</span>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-slate-400">
              <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No data for this time range</p>
              {isAggregated && (
                <p className="text-xs mt-1 text-slate-300">
                  Aggregated data is computed hourly. Check back later.
                </p>
              )}
            </div>
          ) : isAggregated ? (
            /* Aggregated view: area bands (min-max) + avg line */
            <div className="h-[260px] sm:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={aggChartData}>
                <defs>
                  <linearGradient id="tempBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="humBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8" }}
                  interval="preserveStartEnd"
                  minTickGap={40}
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
                    fontSize: "12px",
                  }}
                  formatter={(value: any, name: string) => {
                    if (name === "Temperature Range")
                      return [`${value[0]}°C – ${value[1]}°C`, name];
                    if (name === "Humidity Range")
                      return [`${value[0]}% – ${value[1]}%`, name];
                    const unit = name.includes("Temp") ? "°C" : "%";
                    return [`${value}${unit}`, name];
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                />
                {/* Temperature min-max band */}
                <Area
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempRange"
                  fill="url(#tempBand)"
                  stroke="none"
                  name="Temperature Range"
                  isAnimationActive={false}
                />
                {/* Humidity min-max band */}
                <Area
                  yAxisId="hum"
                  type="monotone"
                  dataKey="humidityRange"
                  fill="url(#humBand)"
                  stroke="none"
                  name="Humidity Range"
                  isAnimationActive={false}
                />
                {/* Average lines */}
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp_avg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="Avg Temperature (°C)"
                />
                <Line
                  yAxisId="hum"
                  type="monotone"
                  dataKey="humidity_avg"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Avg Humidity (%)"
                />
                {showBrush && (
                  <Brush
                    dataKey="time"
                    height={28}
                    stroke="#94a3b8"
                    fill="#f8fafc"
                    tickFormatter={() => ""}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          ) : (
            /* Raw data view: simple line chart */
            <div className="h-[260px] sm:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rawChartData}>
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
                {showBrush && (
                  <Brush
                    dataKey="time"
                    height={28}
                    stroke="#94a3b8"
                    fill="#f8fafc"
                    tickFormatter={() => ""}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
