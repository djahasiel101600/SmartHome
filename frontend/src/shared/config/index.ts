const backendPort = "8000";

export const config = {
  apiBaseUrl:
    import.meta.env.VITE_API_URL ||
    `${window.location.protocol}//${window.location.hostname}:${backendPort}`,
  wsBaseUrl:
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${backendPort}`,
} as const;
