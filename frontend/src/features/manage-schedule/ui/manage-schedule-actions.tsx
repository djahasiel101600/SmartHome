import { Button } from "@/shared/ui";
import { scheduleApi, useScheduleStore } from "@/entities/schedule";
import { toast } from "sonner";
import { Trash2, Pause, Play, Pencil } from "lucide-react";
import type { Schedule } from "@/shared/types";

interface ManageScheduleActionsProps {
  schedule: Schedule;
  onEdit?: (schedule: Schedule) => void;
}

export function ManageScheduleActions({
  schedule,
  onEdit,
}: ManageScheduleActionsProps) {
  const { removeSchedule, updateSchedule } = useScheduleStore();

  const handleToggle = async () => {
    try {
      const { data } = await scheduleApi.toggle(schedule.id);
      updateSchedule(data);
      toast.success(
        data.is_active ? "Schedule activated" : "Schedule deactivated",
      );
    } catch {
      toast.error("Failed to toggle schedule");
    }
  };

  const handleDelete = async () => {
    try {
      await scheduleApi.delete(schedule.id);
      removeSchedule(schedule.id);
      toast.success("Schedule deleted");
    } catch {
      toast.error("Failed to delete schedule");
    }
  };

  return (
    <div className="flex gap-1">
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(schedule)}
          title="Edit"
          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        title={schedule.is_active ? "Pause" : "Resume"}
        className="text-slate-400 hover:text-slate-700"
      >
        {schedule.is_active ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        title="Delete"
        className="text-slate-400 hover:text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
