import { useState } from "react";
import { Button } from "@/shared/ui";
import { ScheduleCard, useScheduleStore } from "@/entities/schedule";
import { ManageScheduleActions } from "@/features/manage-schedule";
import { CreateScheduleDialog } from "@/features/create-schedule";
import { useRelayStore } from "@/entities/relay";
import { Plus, Calendar } from "lucide-react";
import type { Schedule } from "@/shared/types";

export function ScheduleList() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const schedules = useScheduleStore((s) => s.schedules);
  const relays = useRelayStore((s) => s.relays);

  const handleEdit = (schedule: Schedule) => {
    setEditSchedule(schedule);
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditSchedule(null);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Schedules
          </h2>
          {schedules.length > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-medium text-indigo-700">
              {schedules.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => { setEditSchedule(null); setDialogOpen(true); }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          New Schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Calendar className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">No schedules yet</p>
          <p className="text-xs mt-1">Create one to automate your relays</p>
        </div>
      ) : (
        <div className="space-y-3 animate-stagger">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              actions={
                <ManageScheduleActions
                  schedule={schedule}
                  onEdit={handleEdit}
                />
              }
            />
          ))}
        </div>
      )}

      <CreateScheduleDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        relays={relays}
        schedule={editSchedule}
      />
    </section>
  );
}
