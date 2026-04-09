export const config = {
  apiBaseUrl: import.meta.env.VITE_API_URL || "",
  wsBaseUrl:
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`,
} as const;
