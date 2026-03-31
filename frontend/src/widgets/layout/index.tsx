import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "@/features/auth";
import { useDeviceStore } from "@/entities/device";
import { useWebSocket } from "@/app/providers/websocket-provider";
import {
  LayoutDashboard,
  Cpu,
  Calendar,
  Settings,
  LogOut,
  Wifi,
  WifiOff,
  Zap,
  User,
} from "lucide-react";
import { cn } from "@/shared/lib";
import { Badge } from "@/shared/ui";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/schedules", label: "Schedules", icon: Calendar },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const devices = useDeviceStore((s) => s.devices);
  const { connected: wsConnected } = useWebSocket();
  const location = useLocation();
  const deviceOnline = devices.some((d) => d.is_online);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden md:flex w-65 flex-col bg-slate-900 text-white shrink-0">
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-5 border-b border-white/8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-600/30">
            <Zap className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Smart Home</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Menu
          </p>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location.pathname === href;
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                    : "text-slate-400 hover:bg-white/6 hover:text-slate-200",
                )}
              >
                <Icon className={cn("h-4.5 w-4.5", active && "text-white")} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Device status in sidebar */}
        <div className="px-3 pb-3">
          <div className="rounded-lg bg-white/6 px-3 py-3 space-y-2">
            <div className="flex items-center gap-2">
              {deviceOnline ? (
                <Wifi className="h-4 w-4 text-emerald-400" />
              ) : (
                <WifiOff className="h-4 w-4 text-slate-500" />
              )}
              <span
                className={cn(
                  "text-xs font-medium",
                  deviceOnline ? "text-emerald-400" : "text-slate-500",
                )}
              >
                {deviceOnline ? "Device Online" : "Device Offline"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  wsConnected ? "bg-emerald-400" : "bg-red-400",
                )}
              />
              <span className="text-xs text-slate-500">
                {wsConnected ? "Live Connection" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>

        {/* User section */}
        <div className="border-t border-white/8 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 ring-2 ring-slate-600">
              <User className="h-4 w-4 text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-slate-200">
                {user?.username}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-2 text-slate-500 hover:bg-white/6 hover:text-slate-300 transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">Smart Home</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={deviceOnline ? "success" : "destructive"}
            className="gap-1"
          >
            {deviceOnline ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {deviceOnline ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location.pathname === href;
          return (
            <Link
              key={href}
              to={href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 text-xs font-medium transition-colors",
                active ? "text-indigo-600" : "text-slate-400",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden md:pt-0 pt-14 pb-16 md:pb-0">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
