import { Button } from "@/shared/ui";
import { scheduleApi, useScheduleStore } from "@/entities/schedule";
import { toast } from "sonner";
import { Trash2, Pause, Play } from "lucide-react";

interface ManageScheduleActionsProps {
  scheduleId: number;
  isActive: boolean;
}

export function ManageScheduleActions({
  scheduleId,
  isActive,
}: ManageScheduleActionsProps) {
  const { removeSchedule, updateSchedule } = useScheduleStore();

  const handleToggle = async () => {
    try {
      const { data } = await scheduleApi.toggle(scheduleId);
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
      await scheduleApi.delete(scheduleId);
      removeSchedule(scheduleId);
      toast.success("Schedule deleted");
    } catch {
      toast.error("Failed to delete schedule");
    }
  };

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        title={isActive ? "Pause" : "Resume"}
        className="text-slate-400 hover:text-slate-700"
      >
        {isActive ? (
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
