import { useEffect, useState } from "react";
import { Card, CardContent } from "@/shared/ui";
import { sensorApi, useSensorStore } from "@/entities/sensor";
import {
  Thermometer,
  Droplets,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import { cn } from "@/shared/lib";

const trendConfig = {
  rising: {
    icon: TrendingUp,
    label: "Rising",
    color: "text-rose-500",
    bg: "bg-rose-50",
  },
  falling: {
    icon: TrendingDown,
    label: "Falling",
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
  stable: {
    icon: Minus,
    label: "Stable",
    color: "text-emerald-500",
    bg: "bg-emerald-50",
  },
};

function formatPeakTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SensorStatsProps {
  range: string;
}

export function SensorStats({ range }: SensorStatsProps) {
  const stats = useSensorStore((s) => s.stats);
  const setStats = useSensorStore((s) => s.setStats);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sensorApi
      .getStats(range)
      .then(({ data }) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, setStats]);

  if (loading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Analytics
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-16 animate-pulse bg-slate-100 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (!stats) return null;

  const TempTrendIcon = trendConfig[stats.trend_temp].icon;
  const HumTrendIcon = trendConfig[stats.trend_humidity].icon;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Analytics — {range}
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {/* Peak Temperature */}
        <Card className="border-amber-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <ArrowUpRight className="h-3 w-3 text-amber-500" />
              <span>Peak Temp</span>
            </div>
            <p className="text-xl font-bold text-amber-600">
              {stats.temp_max}°C
            </p>
            <p className="text-[10px] text-slate-400 mt-1 truncate">
              {formatPeakTime(stats.peak_temp_at)}
            </p>
          </CardContent>
        </Card>

        {/* Peak Humidity */}
        <Card className="border-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <ArrowUpRight className="h-3 w-3 text-blue-500" />
              <span>Peak Humidity</span>
            </div>
            <p className="text-xl font-bold text-blue-600">
              {stats.humidity_max}%
            </p>
            <p className="text-[10px] text-slate-400 mt-1 truncate">
              {formatPeakTime(stats.peak_humidity_at)}
            </p>
          </CardContent>
        </Card>

        {/* Average Temperature */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <Thermometer className="h-3 w-3 text-amber-400" />
              <span>Avg Temp</span>
            </div>
            <p className="text-xl font-bold text-slate-700">
              {stats.temp_avg}°C
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Low: {stats.temp_min}°C
            </p>
          </CardContent>
        </Card>

        {/* Average Humidity */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <Droplets className="h-3 w-3 text-blue-400" />
              <span>Avg Humidity</span>
            </div>
            <p className="text-xl font-bold text-slate-700">
              {stats.humidity_avg}%
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Low: {stats.humidity_min}%
            </p>
          </CardContent>
        </Card>

        {/* Temperature Trend */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <Thermometer className="h-3 w-3" />
              <span>Temp Trend</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "rounded-full p-1.5",
                  trendConfig[stats.trend_temp].bg,
                )}
              >
                <TempTrendIcon
                  className={cn(
                    "h-4 w-4",
                    trendConfig[stats.trend_temp].color,
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-sm font-semibold",
                  trendConfig[stats.trend_temp].color,
                )}
              >
                {trendConfig[stats.trend_temp].label}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Humidity Trend */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <Droplets className="h-3 w-3" />
              <span>Humidity Trend</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "rounded-full p-1.5",
                  trendConfig[stats.trend_humidity].bg,
                )}
              >
                <HumTrendIcon
                  className={cn(
                    "h-4 w-4",
                    trendConfig[stats.trend_humidity].color,
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-sm font-semibold",
                  trendConfig[stats.trend_humidity].color,
                )}
              >
                {trendConfig[stats.trend_humidity].label}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
