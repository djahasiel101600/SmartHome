export const config = {
  apiBaseUrl: import.meta.env.VITE_API_URL || "",
  wsBaseUrl: import.meta.env.VITE_WS_URL || `ws://${window.location.host}`,
} as const;
