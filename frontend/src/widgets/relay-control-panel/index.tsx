import { RelayCard } from "@/entities/relay";
import { ToggleRelayButton } from "@/features/toggle-relay";
import { useRelayStore } from "@/entities/relay";
import { Power } from "lucide-react";

export function RelayControlPanel() {
  const relays = useRelayStore((s) => s.relays);

  if (relays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Power className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No relays found</p>
        <p className="text-xs mt-1">Add a device to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-stagger">
      {relays.map((relay) => (
        <RelayCard
          key={relay.id}
          relay={relay}
          actions={
            <ToggleRelayButton relayId={relay.id} currentState={relay.state} />
          }
        />
      ))}
    </div>
  );
}
