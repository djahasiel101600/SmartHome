import { useEffect, useState } from "react";
import { deviceApi, firmwareApi, useDeviceStore } from "@/entities/device";
import { relayApi } from "@/entities/relay";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Label,
  Badge,
  Dialog,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Cpu,
  Power,
  Copy,
  Check,
  Pencil,
  Save,
  Tag,
  Wifi,
  WifiOff,
  Clock,
  Upload,
  Download,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/shared/lib";
import type { Device, FirmwareVersion } from "@/shared/types";

export function DevicesPage() {
  const devices = useDeviceStore((s) => s.devices);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const addDevice = useDeviceStore((s) => s.addDevice);
  const removeDevice = useDeviceStore((s) => s.removeDevice);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Relay label editing
  const [editingRelay, setEditingRelay] = useState<{
    id: number;
    label: string;
  } | null>(null);

  // Device name editing
  const [editingDevice, setEditingDevice] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Relay add dialog
  const [addRelayDialog, setAddRelayDialog] = useState<{
    deviceId: number;
    deviceName: string;
  } | null>(null);
  const [newRelayLabel, setNewRelayLabel] = useState("");
  const [addingRelay, setAddingRelay] = useState(false);
  const [deletingRelayId, setDeletingRelayId] = useState<number | null>(null);

  // Firmware state
  const [firmwareVersions, setFirmwareVersions] = useState<FirmwareVersion[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fwFile, setFwFile] = useState<File | null>(null);
  const [fwVersion, setFwVersion] = useState("");
  const [fwNotes, setFwNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [otaDialogDevice, setOtaDialogDevice] = useState<Device | null>(null);
  const [selectedFirmwareId, setSelectedFirmwareId] = useState<number | null>(null);
  const [triggeringOTA, setTriggeringOTA] = useState(false);

  useEffect(() => {
    deviceApi.getAll().then(({ data }) => {
      const list = Array.isArray(data) ? data : ((data as any).results ?? []);
      setDevices(list);
    });
    firmwareApi.getAll().then(({ data }) => {
      const list = Array.isArray(data) ? data : ((data as any).results ?? []);
      setFirmwareVersions(list);
    });
  }, [setDevices]);

  // Listen for OTA WebSocket events
  useEffect(() => {
    const handleOTAProgress = (e: Event) => {
      const { device_id, progress, status: otaStatus } = (e as CustomEvent).detail;
      toast.info(`Device ${device_id.slice(0, 8)}... OTA: ${otaStatus} (${progress}%)`);
    };
    const handleOTAResult = (e: Event) => {
      const { device_id, success, version, error } = (e as CustomEvent).detail;
      if (success) {
        toast.success(`Device ${device_id.slice(0, 8)}... updated to v${version}`);
        // Refresh devices to get updated firmware version
        deviceApi.getAll().then(({ data }) => {
          const list = Array.isArray(data) ? data : ((data as any).results ?? []);
          setDevices(list);
        });
      } else {
        toast.error(`OTA failed for ${device_id.slice(0, 8)}...: ${error}`);
      }
    };
    window.addEventListener("ota_progress", handleOTAProgress);
    window.addEventListener("ota_result", handleOTAResult);
    return () => {
      window.removeEventListener("ota_progress", handleOTAProgress);
      window.removeEventListener("ota_result", handleOTAResult);
    };
  }, [setDevices]);

  const handleAddDevice = async () => {
    if (!newDeviceName.trim()) {
      toast.error("Device name is required");
      return;
    }
    setAdding(true);
    try {
      const { data } = await deviceApi.create(newDeviceName.trim());
      // Fetch the full device with relays
      const { data: fullDevice } = await deviceApi.getById(data.id);
      addDevice(fullDevice);
      toast.success(`Device "${fullDevice.name}" created with ${fullDevice.relays.length} relays`);
      setNewDeviceName("");
      setAddDialogOpen(false);
    } catch {
      toast.error("Failed to create device");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteDevice = async (device: Device) => {
    setDeletingId(device.id);
    try {
      await deviceApi.delete(device.id);
      removeDevice(device.id);
      toast.success(`Device "${device.name}" deleted`);
    } catch {
      toast.error("Failed to delete device");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyDeviceId = (deviceId: string) => {
    navigator.clipboard.writeText(deviceId);
    setCopiedId(deviceId);
    toast.success("Device ID copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveDeviceName = async () => {
    if (!editingDevice) return;
    try {
      await deviceApi.update(editingDevice.id, editingDevice.name);
      setDevices(
        devices.map((d) =>
          d.id === editingDevice.id ? { ...d, name: editingDevice.name } : d,
        ),
      );
      toast.success("Device name updated");
      setEditingDevice(null);
    } catch {
      toast.error("Failed to update device name");
    }
  };

  const handleSaveRelayLabel = async () => {
    if (!editingRelay) return;
    try {
      await relayApi.updateLabel(editingRelay.id, editingRelay.label);
      // Update in local device list
      setDevices(
        devices.map((d) => ({
          ...d,
          relays: d.relays.map((r) =>
            r.id === editingRelay.id
              ? { ...r, label: editingRelay.label }
              : r,
          ),
        })),
      );
      toast.success("Relay label updated");
      setEditingRelay(null);
    } catch {
      toast.error("Failed to update relay label");
    }
  };

  const handleAddRelay = async () => {
    if (!addRelayDialog) return;
    const label = newRelayLabel.trim() || "Relay";
    setAddingRelay(true);
    try {
      const { data: newRelay } = await relayApi.create(
        addRelayDialog.deviceId,
        label,
      );
      setDevices(
        devices.map((d) =>
          d.id === addRelayDialog.deviceId
            ? { ...d, relays: [...d.relays, newRelay] }
            : d,
        ),
      );
      toast.success(`Relay "${newRelay.label}" added`);
      setNewRelayLabel("");
      setAddRelayDialog(null);
    } catch {
      toast.error("Failed to add relay");
    } finally {
      setAddingRelay(false);
    }
  };

  const handleDeleteRelay = async (deviceId: number, relayId: number) => {
    setDeletingRelayId(relayId);
    try {
      await relayApi.delete(relayId);
      setDevices(
        devices.map((d) =>
          d.id === deviceId
            ? { ...d, relays: d.relays.filter((r) => r.id !== relayId) }
            : d,
        ),
      );
      toast.success("Relay deleted");
    } catch {
      toast.error("Failed to delete relay");
    } finally {
      setDeletingRelayId(null);
    }
  };

  const handleUploadFirmware = async () => {
    if (!fwFile || !fwVersion.trim()) {
      toast.error("File and version are required");
      return;
    }
    setUploading(true);
    try {
      const { data } = await firmwareApi.upload(fwFile, fwVersion.trim(), fwNotes.trim());
      setFirmwareVersions((prev) => [data, ...prev]);
      toast.success(`Firmware v${data.version} uploaded`);
      setFwFile(null);
      setFwVersion("");
      setFwNotes("");
      setUploadDialogOpen(false);
    } catch {
      toast.error("Failed to upload firmware");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFirmware = async (fw: FirmwareVersion) => {
    try {
      await firmwareApi.delete(fw.id);
      setFirmwareVersions((prev) => prev.filter((f) => f.id !== fw.id));
      toast.success(`Firmware v${fw.version} deleted`);
    } catch {
      toast.error("Failed to delete firmware");
    }
  };

  const handleTriggerOTA = async () => {
    if (!otaDialogDevice || !selectedFirmwareId) return;
    setTriggeringOTA(true);
    try {
      await deviceApi.triggerOTA(otaDialogDevice.id, selectedFirmwareId);
      toast.success(`OTA update triggered for ${otaDialogDevice.name}`);
      setOtaDialogDevice(null);
      setSelectedFirmwareId(null);
    } catch {
      toast.error("Failed to trigger OTA update");
    } finally {
      setTriggeringOTA(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Devices
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your smart home devices and relays
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Device
        </Button>
      </div>

      {/* Firmware Management */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Firmware Versions</CardTitle>
              <CardDescription>
                Upload firmware binaries and push OTA updates to devices
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setUploadDialogOpen(true)}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Firmware
            </Button>
          </div>
        </CardHeader>
        {firmwareVersions.length > 0 && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              {firmwareVersions.map((fw) => (
                <div
                  key={fw.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono">
                      v{fw.version}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {new Date(fw.created_at).toLocaleDateString()}
                    </span>
                    {fw.release_notes && (
                      <span className="text-xs text-slate-500 truncate max-w-[200px]">
                        {fw.release_notes}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                      MD5: {fw.checksum.slice(0, 12)}...
                    </code>
                    <button
                      onClick={() => handleDeleteFirmware(fw)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
                      title="Delete firmware version"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
        {firmwareVersions.length === 0 && (
          <CardContent className="pt-0">
            <p className="text-sm text-slate-400 text-center py-4">
              No firmware versions uploaded yet
            </p>
          </CardContent>
        )}
      </Card>

      {/* Empty state */}
      {devices.length === 0 && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-slate-400">
              <Cpu className="h-12 w-12 mb-4 opacity-40" />
              <p className="text-lg font-medium text-slate-600">
                No devices yet
              </p>
              <p className="text-sm mt-1 mb-4">
                Add your first device to get started
              </p>
              <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Device
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Device list */}
      {devices.map((device) => (
        <Card key={device.id} className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl",
                    device.is_online
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  {editingDevice?.id === device.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={editingDevice.name}
                        onChange={(e) =>
                          setEditingDevice({
                            ...editingDevice,
                            name: e.target.value,
                          })
                        }
                        className="h-8 w-full sm:w-48"
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSaveDeviceName()
                        }
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveDeviceName}
                        className="h-8 gap-1"
                      >
                        <Save className="h-3 w-3" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingDevice(null)}
                        className="h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{device.name}</CardTitle>
                      <button
                        onClick={() =>
                          setEditingDevice({
                            id: device.id,
                            name: device.name,
                          })
                        }
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        title="Edit device name"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Badge
                      variant={device.is_online ? "success" : "secondary"}
                      className="gap-1"
                    >
                      {device.is_online ? (
                        <Wifi className="h-3 w-3" />
                      ) : (
                        <WifiOff className="h-3 w-3" />
                      )}
                      {device.is_online ? "Online" : "Offline"}
                    </Badge>
                    {device.last_seen && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        Last seen{" "}
                        {new Date(device.last_seen).toLocaleString()}
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteDevice(device)}
                disabled={deletingId === device.id}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 self-start"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          {/* Device ID */}
          <CardContent className="pt-0 pb-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 min-w-0">
                Device ID:{" "}
                <code className="bg-white px-1.5 py-0.5 rounded font-mono text-xs text-slate-600 border border-slate-200 break-all">
                  {device.device_id}
                </code>
              </span>
              <button
                onClick={() => handleCopyDeviceId(device.device_id)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                title="Copy Device ID"
              >
                {copiedId === device.device_id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </CardContent>

          {/* Firmware version + OTA */}
          <CardContent className="pt-0 pb-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                Firmware:{" "}
                <code className="bg-white px-1.5 py-0.5 rounded font-mono text-xs text-slate-600 border border-slate-200">
                  v{device.current_firmware_version || "0.0.0"}
                </code>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!device.is_online || firmwareVersions.length === 0}
                onClick={() => {
                  setOtaDialogDevice(device);
                  setSelectedFirmwareId(firmwareVersions[0]?.id ?? null);
                }}
                className="gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-7 text-xs"
                title={!device.is_online ? "Device must be online for OTA" : ""}
              >
                <Download className="h-3 w-3" />
                OTA Update
              </Button>
            </div>
          </CardContent>

          {/* Relays */}
          <CardContent className="pt-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Power className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                  Relays ({device.relays.length})
                </h3>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setAddRelayDialog({
                    deviceId: device.id,
                    deviceName: device.name,
                  })
                }
                className="gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Relay
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {device.relays.map((relay) => (
                <div
                  key={relay.id}
                  className={cn(
                    "rounded-lg border p-3 flex items-center justify-between transition-colors",
                    relay.state
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        relay.state
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-slate-100 text-slate-400",
                      )}
                    >
                      <Power className="h-4 w-4" />
                    </div>
                    <div>
                      {editingRelay?.id === relay.id ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Input
                            value={editingRelay.label}
                            onChange={(e) =>
                              setEditingRelay({
                                ...editingRelay,
                                label: e.target.value,
                              })
                            }
                            className="h-7 w-full sm:w-32 text-sm"
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleSaveRelayLabel()
                            }
                          />
                          <Button
                            size="sm"
                            onClick={handleSaveRelayLabel}
                            className="h-7 px-2"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingRelay(null)}
                            className="h-7 px-2"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-900">
                            {relay.label}
                          </p>
                          <button
                            onClick={() =>
                              setEditingRelay({
                                id: relay.id,
                                label: relay.label,
                              })
                            }
                            className="text-slate-300 hover:text-slate-500 transition-colors"
                            title="Edit relay label"
                          >
                            <Tag className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-slate-400">
                        Relay #{relay.relay_number}
                      </p>
                    </div>
                  </div>
                  <Badge variant={relay.state ? "success" : "secondary"}>
                    {relay.state ? "ON" : "OFF"}
                  </Badge>
                  <button
                    onClick={() => handleDeleteRelay(device.id, relay.id)}
                    disabled={deletingRelayId === relay.id}
                    className="ml-1 text-slate-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
                    title="Delete relay"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>

          <CardFooter className="bg-slate-50/50 border-t border-slate-100 py-3">
            <p className="text-xs text-slate-400">
              Created {new Date(device.created_at).toLocaleDateString()}
            </p>
          </CardFooter>
        </Card>
      ))}

      {/* Add Device Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Create a new device. 4 relays will be automatically created for it.
          </p>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Device Name</Label>
            <Input
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="e.g. Living Room Controller"
              onKeyDown={(e) => e.key === "Enter" && handleAddDevice()}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAddDialogOpen(false);
                setNewDeviceName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddDevice}
              disabled={adding || !newDeviceName.trim()}
              className="gap-2"
            >
              {adding ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {adding ? "Creating..." : "Create Device"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add Relay Dialog */}
      <Dialog
        open={addRelayDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddRelayDialog(null);
            setNewRelayLabel("");
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add Relay</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Add a new relay to{" "}
            <span className="font-medium text-slate-700">
              {addRelayDialog?.deviceName}
            </span>
          </p>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Relay Label</Label>
            <Input
              value={newRelayLabel}
              onChange={(e) => setNewRelayLabel(e.target.value)}
              placeholder="e.g. Kitchen Light"
              onKeyDown={(e) => e.key === "Enter" && handleAddRelay()}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAddRelayDialog(null);
                setNewRelayLabel("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddRelay}
              disabled={addingRelay}
              className="gap-2"
            >
              {addingRelay ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {addingRelay ? "Adding..." : "Add Relay"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Upload Firmware Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogHeader>
          <DialogTitle>Upload Firmware</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Upload a compiled firmware binary (.bin) for OTA updates
          </p>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Version</Label>
            <Input
              value={fwVersion}
              onChange={(e) => setFwVersion(e.target.value)}
              placeholder="e.g. 1.1.0"
            />
          </div>
          <div className="space-y-2">
            <Label>Firmware Binary (.bin)</Label>
            <Input
              type="file"
              accept=".bin"
              onChange={(e) => setFwFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Release Notes (optional)</Label>
            <Input
              value={fwNotes}
              onChange={(e) => setFwNotes(e.target.value)}
              placeholder="e.g. Fixed WiFi reconnection"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setUploadDialogOpen(false);
                setFwFile(null);
                setFwVersion("");
                setFwNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadFirmware}
              disabled={uploading || !fwFile || !fwVersion.trim()}
              className="gap-2"
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* OTA Update Dialog */}
      <Dialog
        open={otaDialogDevice !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOtaDialogDevice(null);
            setSelectedFirmwareId(null);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>OTA Firmware Update</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Push a firmware update to{" "}
            <span className="font-medium text-slate-700">
              {otaDialogDevice?.name}
            </span>
          </p>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Current version:{" "}
            <code className="font-mono font-medium text-slate-700">
              v{otaDialogDevice?.current_firmware_version || "0.0.0"}
            </code>
          </div>
          <div className="space-y-2">
            <Label>Target Firmware Version</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
              value={selectedFirmwareId ?? ""}
              onChange={(e) =>
                setSelectedFirmwareId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Select a version...</option>
              {firmwareVersions.map((fw) => (
                <option key={fw.id} value={fw.id}>
                  v{fw.version}
                  {fw.release_notes ? ` — ${fw.release_notes}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOtaDialogDevice(null);
                setSelectedFirmwareId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTriggerOTA}
              disabled={triggeringOTA || !selectedFirmwareId}
              className="gap-2"
            >
              {triggeringOTA ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {triggeringOTA ? "Sending..." : "Start OTA Update"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
