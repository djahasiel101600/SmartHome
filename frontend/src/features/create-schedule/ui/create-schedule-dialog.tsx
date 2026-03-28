import { useState } from "react";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { cn, DAYS_OF_WEEK } from "@/shared/lib";
import { scheduleApi } from "@/entities/schedule";
import { useScheduleStore } from "@/entities/schedule";
import type { Relay } from "@/shared/types";
import { toast } from "sonner";
import { Clock, Repeat } from "lucide-react";

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relays: Relay[];
}

export function CreateScheduleDialog({
  open,
  onOpenChange,
  relays,
}: CreateScheduleDialogProps) {
  const [mode, setMode] = useState<"timer" | "recurring">("timer");
  const [relayId, setRelayId] = useState<number>(relays[0]?.id ?? 0);
  const [action, setAction] = useState<"on" | "off">("off");
  const [loading, setLoading] = useState(false);

  // Timer fields
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);

  // Recurring fields
  const [time, setTime] = useState("22:00");
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);

  const addSchedule = useScheduleStore((s) => s.addSchedule);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "timer") {
        const duration = hours * 60 + minutes;
        if (duration <= 0) {
          toast.error("Duration must be greater than 0");
          return;
        }
        const { data } = await scheduleApi.createTimer({
          relay_id: relayId,
          duration_minutes: duration,
          action,
        });
        addSchedule(data);
      } else {
        if (selectedDays.length === 0) {
          toast.error("Select at least one day");
          return;
        }
        const { data } = await scheduleApi.createRecurring({
          relay_id: relayId,
          time,
          days_of_week: selectedDays,
          action,
        });
        addSchedule(data);
      }
      toast.success("Schedule created");
      onOpenChange(false);
    } catch {
      toast.error("Failed to create schedule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Create Schedule</DialogTitle>
        <p className="text-sm text-slate-500 mt-1">
          Set up a timer or recurring automation
        </p>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mode selector */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("timer")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
              mode === "timer"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <Clock className="h-4 w-4" />
            Timer
          </button>
          <button
            type="button"
            onClick={() => setMode("recurring")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
              mode === "recurring"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <Repeat className="h-4 w-4" />
            Recurring
          </button>
        </div>

        {/* Relay selector */}
        <div className="space-y-2">
          <Label className="text-slate-600">Relay</Label>
          <select
            value={relayId}
            onChange={(e) => setRelayId(Number(e.target.value))}
            className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
          >
            {relays.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} (Relay {r.relay_number})
              </option>
            ))}
          </select>
        </div>

        {/* Action selector */}
        <div className="space-y-2">
          <Label className="text-slate-600">Action</Label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as "on" | "off")}
            className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
          >
            <option value="off">Turn OFF</option>
            <option value="on">Turn ON</option>
          </select>
        </div>

        {mode === "timer" ? (
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label className="text-slate-600">Hours</Label>
              <Input
                type="number"
                min={0}
                max={24}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label className="text-slate-600">Minutes</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-slate-600">Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-600">Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "h-9 w-11 rounded-lg text-xs font-medium transition-all duration-150",
                      selectedDays.includes(i)
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                    )}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="gap-1.5">
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating...
              </>
            ) : (
              "Create Schedule"
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
