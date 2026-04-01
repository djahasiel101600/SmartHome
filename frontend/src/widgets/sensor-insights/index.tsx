import { useSensorStore } from "@/entities/sensor";
import { Card, CardContent } from "@/shared/ui";
import { Lightbulb } from "lucide-react";

const severityConfig = {
  info: {
    badge: "bg-blue-100 text-blue-700",
    accent: "from-blue-400 to-blue-500",
    label: "Info",
  },
  warning: {
    badge: "bg-amber-100 text-amber-700",
    accent: "from-amber-400 to-orange-500",
    label: "Warning",
  },
  critical: {
    badge: "bg-red-100 text-red-700",
    accent: "from-red-400 to-red-500",
    label: "Critical",
  },
};

export function SensorInsights() {
  const insight = useSensorStore((s) => s.insight);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Room Insights
        </h2>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {!insight ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Lightbulb className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No insights yet</p>
              <p className="text-xs mt-1">
                Insights will appear when sensor readings indicate noteworthy
                conditions
              </p>
            </div>
          ) : (
            <>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityConfig[insight.severity].badge}`}
                  >
                    {severityConfig[insight.severity].label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(insight.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {insight.insight_text}
                </p>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>
                    Triggered at {insight.temperature.toFixed(1)}°C,{" "}
                    {insight.humidity.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div
                className={`h-1 bg-linear-to-r ${severityConfig[insight.severity].accent}`}
              />
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
