import { cn } from "@/shared/lib";
import { Card, CardContent, Badge } from "@/shared/ui";
import type { Relay } from "@/shared/types";
import { Power } from "lucide-react";

interface RelayCardProps {
  relay: Relay;
  actions?: React.ReactNode;
}

export function RelayCard({ relay, actions }: RelayCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-200",
        relay.state && "ring-1 ring-emerald-500/20",
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                relay.state
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              <Power className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{relay.label}</p>
              <p className="text-xs text-slate-400">
                Relay {relay.relay_number}
              </p>
            </div>
          </div>
          <Badge variant={relay.state ? "success" : "secondary"}>
            {relay.state ? "ON" : "OFF"}
          </Badge>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                relay.state
                  ? "bg-emerald-500 animate-glow-pulse"
                  : "bg-slate-300",
              )}
            />
            <span className="text-xs text-slate-400">
              {relay.state ? "Active" : "Standby"}
            </span>
          </div>
          {actions}
        </div>
      </CardContent>
    </Card>
  );
}
