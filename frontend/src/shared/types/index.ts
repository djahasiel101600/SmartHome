export interface Device {
  id: number;
  name: string;
  device_id: string;
  is_online: boolean;
  last_seen: string | null;
  relays: Relay[];
  created_at: string;
}

export interface Relay {
  id: number;
  relay_number: number;
  label: string;
  state: boolean;
  created_at: string;
}

export interface SensorReading {
  id: number;
  device: number;
  temperature: number;
  humidity: number;
  recorded_at: string;
}

export interface SensorInsight {
  id: number;
  device: number;
  insight_text: string;
  temperature: number;
  humidity: number;
  severity: "info" | "warning" | "critical";
  created_at: string;
}

export interface Schedule {
  id: number;
  relay: number;
  relay_label: string;
  relay_number: number;
  schedule_type: "timer" | "recurring";
  is_active: boolean;
  timer: TimerSchedule | null;
  recurring: RecurringSchedule | null;
  created_at: string;
}

export interface TimerSchedule {
  duration_minutes: number;
  action: "on" | "off";
  started_at: string;
  expires_at: string;
  celery_task_id: string;
}

export interface RecurringSchedule {
  time: string;
  days_of_week: number[];
  action: "on" | "off";
}

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

// WebSocket message types
export interface WsRelayUpdate {
  type: "relay_update";
  data: {
    relay_id: number;
    relay_number: number;
    state: boolean;
    device_id: string;
    label: string;
  };
}

export interface WsSensorUpdate {
  type: "sensor_update";
  data: {
    device_id: string;
    temperature: number;
    humidity: number;
    recorded_at: string;
  };
}

export interface WsDeviceStatus {
  type: "device_status";
  data: {
    device_id: string;
    is_online: boolean;
  };
}

export interface WsInsightUpdate {
  type: "insight_update";
  data: {
    id: number;
    insight_text: string;
    severity: "info" | "warning" | "critical";
    temperature: number;
    humidity: number;
    created_at: string;
  };
}

export type WsMessage = WsRelayUpdate | WsSensorUpdate | WsDeviceStatus | WsInsightUpdate;
