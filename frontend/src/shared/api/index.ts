import axios from "axios";
import { config } from "@/shared/config";

export const api = axios.create({
  baseURL: config.apiBaseUrl,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor: attach JWT
api.interceptors.request.use((reqConfig) => {
  const token = localStorage.getItem("access_token");
  if (token && reqConfig.headers) {
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }
  return reqConfig;
});

// Response interceptor: auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      localStorage.getItem("refresh_token")
    ) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh_token");
        const { data } = await axios.post(
          `${config.apiBaseUrl}/api/auth/token/refresh/`,
          { refresh: refreshToken }
        );
        localStorage.setItem("access_token", data.access);
        if (data.refresh) {
          localStorage.setItem("refresh_token", data.refresh);
        }
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
