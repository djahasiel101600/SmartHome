import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Label,
} from "@/shared/ui";
import { deviceApi, useDeviceStore } from "@/entities/device";
import { relayApi, useRelayStore } from "@/entities/relay";
import { toast } from "sonner";
import { Save, Cpu, Tag } from "lucide-react";

export function SettingsPage() {
  const devices = useDeviceStore((s) => s.devices);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const relays = useRelayStore((s) => s.relays);
  const setRelays = useRelayStore((s) => s.setRelays);
  const updateRelayLabel = useRelayStore((s) => s.updateRelayLabel);

  const [deviceName, setDeviceName] = useState("");
  const [labels, setLabels] = useState<Record<number, string>>({});

  useEffect(() => {
    deviceApi.getAll().then(({ data }) => {
      const list = Array.isArray(data) ? data : ((data as any).results ?? []);
      setDevices(list);
      if (list.length > 0) {
        setDeviceName(list[0].name);
        const allRelays = list.flatMap((d: any) => d.relays ?? []);
        setRelays(allRelays);
        const labelMap: Record<number, string> = {};
        allRelays.forEach((r: any) => {
          labelMap[r.id] = r.label;
        });
        setLabels(labelMap);
      }
    });
  }, [setDevices, setRelays]);

  const handleSaveDeviceName = async () => {
    if (!devices[0]) return;
    try {
      await deviceApi.update(devices[0].id, deviceName);
      toast.success("Device name updated");
    } catch {
      toast.error("Failed to update device name");
    }
  };

  const handleSaveLabel = async (relayId: number) => {
    try {
      await relayApi.updateLabel(relayId, labels[relayId]);
      updateRelayLabel(relayId, labels[relayId]);
      toast.success("Relay label updated");
    } catch {
      toast.error("Failed to update label");
    }
  };

  return (
    <div className="px-6 lg:px-8 py-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your device and relay configuration
        </p>
      </div>

      {/* Device settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Device</CardTitle>
              <CardDescription>Configure your device name</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {devices[0] && (
            <>
              <div className="space-y-2">
                <Label className="text-slate-600">Device Name</Label>
                <div className="flex gap-2">
                  <Input
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="My Smart Home"
                  />
                  <Button
                    onClick={handleSaveDeviceName}
                    className="gap-1.5 shrink-0"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                Device ID:{" "}
                <code className="bg-white px-1.5 py-0.5 rounded text-xs font-mono text-slate-600 border border-slate-200">
                  {devices[0].device_id}
                </code>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Relay labels */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Relay Labels</CardTitle>
              <CardDescription>
                Give your relays meaningful names
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {relays.map((relay) => (
            <div key={relay.id} className="space-y-2">
              <Label className="text-slate-600">
                Relay {relay.relay_number}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={labels[relay.id] ?? relay.label}
                  onChange={(e) =>
                    setLabels((prev) => ({
                      ...prev,
                      [relay.id]: e.target.value,
                    }))
                  }
                  placeholder={`Relay ${relay.relay_number} label`}
                />
                <Button
                  onClick={() => handleSaveLabel(relay.id)}
                  className="gap-1.5 shrink-0"
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
