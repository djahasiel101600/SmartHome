import {
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  useState,
} from "react";
import { config } from "@/shared/config";
import { useRelayStore } from "@/entities/relay";
import { useSensorStore } from "@/entities/sensor";
import { useDeviceStore } from "@/entities/device";
import type { WsMessage } from "@/shared/types";

interface WebSocketContextType {
  connected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
});

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptRef = useRef(0);

  const updateRelayState = useRelayStore((s) => s.updateRelayState);
  const addReading = useSensorStore((s) => s.addReading);
  const updateDeviceStatus = useDeviceStore((s) => s.updateDeviceStatus);

  const connect = useCallback(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const wsUrl = `${config.wsBaseUrl}/ws/dashboard/?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);

        switch (message.type) {
          case "relay_update":
            updateRelayState(message.data.relay_id, message.data.state);
            break;
          case "sensor_update":
            addReading({
              id: Date.now(),
              device: 0,
              temperature: message.data.temperature,
              humidity: message.data.humidity,
              recorded_at: message.data.recorded_at,
            });
            break;
          case "device_status":
            updateDeviceStatus(message.data.device_id, message.data.is_online);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
      reconnectAttemptRef.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [updateRelayState, addReading, updateDeviceStatus]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}
