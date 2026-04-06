import {
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  useState,
} from "react";
import { config } from "@/shared/config";
import { api } from "@/shared/api";
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
  const setInsight = useSensorStore((s) => s.setInsight);
  const updateDeviceStatus = useDeviceStore((s) => s.updateDeviceStatus);

  // Keep store actions in refs so the connect callback is stable
  const storeRefs = useRef({ updateRelayState, addReading, setInsight, updateDeviceStatus });
  storeRefs.current = { updateRelayState, addReading, setInsight, updateDeviceStatus };

  const connect = useCallback(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    // Close any existing connection before creating a new one
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${config.wsBaseUrl}/ws/dashboard/?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptRef.current = 0;
      // Send application-level keepalive every 25s
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        const { updateRelayState, addReading, setInsight, updateDeviceStatus } = storeRefs.current;

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
          case "insight_update":
            setInsight({
              id: message.data.id,
              device: 0,
              insight_text: message.data.insight_text,
              severity: message.data.severity,
              temperature: message.data.temperature,
              humidity: message.data.humidity,
              created_at: message.data.created_at,
            });
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      if (pingInterval) clearInterval(pingInterval);
      setConnected(false);

      // Auth rejected — try refreshing the token before reconnecting
      if (event.code === 4003) {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          api
            .post("/api/auth/token/refresh/", { refresh: refreshToken })
            .then(({ data }) => {
              localStorage.setItem("access_token", data.access);
              if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
              // Retry immediately with fresh token
              reconnectAttemptRef.current = 0;
              reconnectTimeoutRef.current = setTimeout(connect, 500);
            })
            .catch(() => {
              // Refresh failed — stop retrying
              localStorage.removeItem("access_token");
              localStorage.removeItem("refresh_token");
            });
          return;
        }
      }

      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
      reconnectAttemptRef.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}
