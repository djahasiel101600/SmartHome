import { cn } from "@/shared/lib";
import { Card, CardContent, Badge } from "@/shared/ui";
import { formatDuration, formatDaysOfWeek } from "@/shared/lib";
import { useCountdown } from "@/shared/hooks/useCountdown";
import type { Schedule } from "@/shared/types";
import { Clock, Repeat, Timer } from "lucide-react";

interface ScheduleCardProps {
  schedule: Schedule;
  actions?: React.ReactNode;
}

function TimerCountdown({ schedule }: { schedule: Schedule }) {
  const { formatted, progress, isExpired } = useCountdown(
    schedule.timer?.expires_at,
    schedule.timer?.started_at,
  );

  if (!schedule.is_active || !schedule.timer?.expires_at) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-amber-600 font-medium">
          <Timer className="h-3 w-3" />
          {isExpired ? "Expired" : formatted}
        </span>
        <span className="text-slate-400">
          {isExpired
            ? "Completed"
            : `${Math.round((1 - progress) * 100)}% left`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000 ease-linear",
            isExpired
              ? "bg-slate-300"
              : progress > 0.9
                ? "bg-red-500"
                : progress > 0.75
                  ? "bg-amber-500"
                  : "bg-emerald-500",
          )}
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function ScheduleCard({ schedule, actions }: ScheduleCardProps) {
  const isTimer = schedule.schedule_type === "timer";

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        !schedule.is_active && "opacity-50",
      )}
    >
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                isTimer
                  ? "bg-amber-50 text-amber-600"
                  : "bg-indigo-50 text-indigo-600",
              )}
            >
              {isTimer ? (
                <Clock className="h-5 w-5" />
              ) : (
                <Repeat className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {schedule.relay_label}
                <span className="text-slate-400 font-normal ml-1.5 text-xs">
                  Relay {schedule.relay_number}
                </span>
              </p>
              <p className="text-sm text-slate-500">
                {isTimer && schedule.timer
                  ? `${formatDuration(schedule.timer.duration_minutes)} → ${schedule.timer.action.toUpperCase()}`
                  : schedule.recurring
                    ? `${schedule.recurring.time} on ${formatDaysOfWeek(schedule.recurring.days_of_week)} → ${schedule.recurring.action.toUpperCase()}`
                    : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Badge variant={schedule.is_active ? "success" : "secondary"}>
              {schedule.is_active ? "Active" : "Inactive"}
            </Badge>
            {actions}
          </div>
        </div>
        {isTimer && <TimerCountdown schedule={schedule} />}
      </CardContent>
    </Card>
  );
}
