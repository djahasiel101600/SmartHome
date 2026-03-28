import { useState } from "react";
import { Switch } from "@/shared/ui";
import { relayApi } from "@/entities/relay";
import { useRelayStore } from "@/entities/relay";
import { toast } from "sonner";

interface ToggleRelayButtonProps {
  relayId: number;
  currentState: boolean;
}

export function ToggleRelayButton({
  relayId,
  currentState,
}: ToggleRelayButtonProps) {
  const [loading, setLoading] = useState(false);
  const updateRelayState = useRelayStore((s) => s.updateRelayState);

  const handleToggle = async (newState: boolean) => {
    setLoading(true);
    try {
      await relayApi.toggle(relayId, newState);
      updateRelayState(relayId, newState);
    } catch {
      toast.error("Failed to toggle relay");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Switch
      checked={currentState}
      onCheckedChange={handleToggle}
      disabled={loading}
    />
  );
}
