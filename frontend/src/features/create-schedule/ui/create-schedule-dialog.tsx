import { useState, useEffect } from "react";
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
import type { Relay, Schedule } from "@/shared/types";
import { toast } from "sonner";
import { Clock, Repeat, Zap } from "lucide-react";

const OPERATOR_LABELS: Record<string, string> = {
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
};

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relays: Relay[];
  schedule?: Schedule | null;
}

export function CreateScheduleDialog({
  open,
  onOpenChange,
  relays,
  schedule: editSchedule,
}: ScheduleDialogProps) {
  const isEdit = !!editSchedule;

  const [mode, setMode] = useState<"timer" | "recurring" | "automation">("timer");
  const [relayId, setRelayId] = useState<number>(relays[0]?.id ?? 0);
  const [action, setAction] = useState<"on" | "off">("off");
  const [loading, setLoading] = useState(false);

  // Counter action
  const [counterEnabled, setCounterEnabled] = useState(false);
  const [counterMinutes, setCounterMinutes] = useState(30);

  // Timer fields
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);

  // Recurring fields
  const [time, setTime] = useState("22:00");
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);

  // Automation fields
  const [sensorField, setSensorField] = useState<"temperature" | "humidity" | "battery">("temperature");
  const [operator, setOperator] = useState<"gt" | "lt" | "gte" | "lte">("gt");
  const [thresholdValue, setThresholdValue] = useState(30);
  const [cooldownMinutes, setCooldownMinutes] = useState(5);

  const { addSchedule, updateSchedule } = useScheduleStore();

  // Pre-populate fields when editing
  useEffect(() => {
    if (!editSchedule) {
      // Reset to defaults when creating
      setCounterEnabled(false);
      setCounterMinutes(30);
      return;
    }
    setMode(editSchedule.schedule_type);
    setRelayId(editSchedule.relay);
    if (editSchedule.schedule_type === "timer" && editSchedule.timer) {
      const t = editSchedule.timer;
      setAction(t.action);
      setHours(Math.floor(t.duration_minutes / 60));
      setMinutes(t.duration_minutes % 60);
      setCounterEnabled(t.counter_action_minutes != null);
      setCounterMinutes(t.counter_action_minutes ?? 30);
    } else if (editSchedule.schedule_type === "recurring" && editSchedule.recurring) {
      const r = editSchedule.recurring;
      setAction(r.action);
      setTime(r.time);
      setSelectedDays(r.days_of_week);
      setCounterEnabled(r.counter_action_minutes != null);
      setCounterMinutes(r.counter_action_minutes ?? 30);
    } else if (editSchedule.schedule_type === "automation" && editSchedule.automation) {
      const a = editSchedule.automation;
      setAction(a.action);
      setSensorField(a.sensor_field);
      setOperator(a.operator);
      setThresholdValue(a.threshold_value);
      setCooldownMinutes(a.cooldown_minutes);
      setCounterEnabled(a.counter_action_minutes != null);
      setCounterMinutes(a.counter_action_minutes ?? 30);
    }
  }, [editSchedule]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const counterValue = counterEnabled ? counterMinutes : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit && editSchedule) {
        // Edit mode
        let payload: Record<string, unknown> = {};
        if (mode === "timer") {
          const duration = hours * 60 + minutes;
          if (duration <= 0) { toast.error("Duration must be greater than 0"); return; }
          payload = { relay_id: relayId, duration_minutes: duration, action, counter_action_minutes: counterValue };
        } else if (mode === "recurring") {
          if (selectedDays.length === 0) { toast.error("Select at least one day"); return; }
          payload = { relay_id: relayId, time, days_of_week: selectedDays, action, counter_action_minutes: counterValue };
        } else {
          payload = {
            relay_id: relayId, sensor_field: sensorField, operator, threshold_value: thresholdValue,
            action, cooldown_minutes: cooldownMinutes, counter_action_minutes: counterValue,
          };
        }
        const { data } = await scheduleApi.update(editSchedule.id, payload);
        updateSchedule(data);
        toast.success("Schedule updated");
      } else {
        // Create mode
        if (mode === "timer") {
          const duration = hours * 60 + minutes;
          if (duration <= 0) { toast.error("Duration must be greater than 0"); return; }
          const { data } = await scheduleApi.createTimer({
            relay_id: relayId, duration_minutes: duration, action, counter_action_minutes: counterValue,
          });
          addSchedule(data);
        } else if (mode === "recurring") {
          if (selectedDays.length === 0) { toast.error("Select at least one day"); return; }
          const { data } = await scheduleApi.createRecurring({
            relay_id: relayId, time, days_of_week: selectedDays, action, counter_action_minutes: counterValue,
          });
          addSchedule(data);
        } else {
          const { data } = await scheduleApi.createAutomation({
            relay_id: relayId, sensor_field: sensorField, operator, threshold_value: thresholdValue,
            action, cooldown_minutes: cooldownMinutes, counter_action_minutes: counterValue,
          });
          addSchedule(data);
        }
        toast.success("Schedule created");
      }
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? "Failed to update schedule" : "Failed to create schedule");
    } finally {
      setLoading(false);
    }
  };

  const oppositeAction = action === "on" ? "OFF" : "ON";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Schedule" : "Create Schedule"}</DialogTitle>
        <p className="text-sm text-slate-500 mt-1">
          {isEdit ? "Update schedule settings" : "Set up a timer or recurring automation"}
        </p>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mode selector */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => !isEdit && setMode("timer")}
            disabled={isEdit}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
              mode === "timer"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
              isEdit && mode !== "timer" && "opacity-40 cursor-not-allowed",
            )}
          >
            <Clock className="h-4 w-4" />
            Timer
          </button>
          <button
            type="button"
            onClick={() => !isEdit && setMode("recurring")}
            disabled={isEdit}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
              mode === "recurring"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
              isEdit && mode !== "recurring" && "opacity-40 cursor-not-allowed",
            )}
          >
            <Repeat className="h-4 w-4" />
            Recurring
          </button>
          <button
            type="button"
            onClick={() => !isEdit && setMode("automation")}
            disabled={isEdit}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
              mode === "automation"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
              isEdit && mode !== "automation" && "opacity-40 cursor-not-allowed",
            )}
          >
            <Zap className="h-4 w-4" />
            Automation
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

        {/* Counter action (all modes) */}
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={counterEnabled}
              onChange={(e) => setCounterEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-600">
              Auto turn {oppositeAction} after
            </span>
          </label>
          {counterEnabled && (
            <div className="flex items-center gap-2 ml-6">
              <Input
                type="number"
                min={1}
                max={1440}
                value={counterMinutes}
                onChange={(e) => setCounterMinutes(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-sm text-slate-500">minutes</span>
            </div>
          )}
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
        ) : mode === "recurring" ? (
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
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "h-10 w-12 rounded-lg text-xs font-medium transition-all duration-150",
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
        ) : (
          <>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label className="text-slate-600">Sensor</Label>
                <select
                  value={sensorField}
                  onChange={(e) => setSensorField(e.target.value as "temperature" | "humidity" | "battery")}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                >
                  <option value="temperature">Temperature</option>
                  <option value="humidity">Humidity</option>
                  <option value="battery">Battery (%)</option>
                </select>
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-slate-600">Condition</Label>
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as "gt" | "lt" | "gte" | "lte")}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                >
                  {Object.entries(OPERATOR_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label} ({value})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label className="text-slate-600">
                  Threshold {sensorField === "temperature" ? "(°C)" : "(%)"}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min={sensorField === "temperature" ? -40 : 0}
                  max={sensorField === "temperature" ? 80 : 100}
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(Number(e.target.value))}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-slate-600">Cooldown (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                />
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
                {isEdit ? "Saving..." : "Creating..."}
              </>
            ) : (
              isEdit ? "Save Changes" : "Create Schedule"
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
