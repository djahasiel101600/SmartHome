import { Link, useLocation } from "react-router-dom";
import { Button, Badge } from "@/shared/ui";
import { useAuthStore } from "@/features/auth";
import { useDeviceStore } from "@/entities/device";
import { Home, Cpu, Calendar, Settings, LogOut, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/shared/lib";

interface HeaderProps {
  wsConnected: boolean;
}

export function Header({ wsConnected }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const devices = useDeviceStore((s) => s.devices);
  const location = useLocation();

  const navLinks = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/devices", label: "Devices", icon: Cpu },
    { href: "/schedules", label: "Schedules", icon: Calendar },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const deviceOnline = devices.some((d) => d.is_online);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-gray-900">Smart Home</h1>
            <nav className="flex gap-1">
              {navLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} to={href}>
                  <Button
                    variant={location.pathname === href ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("gap-2")}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {/* Device status */}
            <Badge
              variant={deviceOnline ? "success" : "destructive"}
              className="gap-1"
            >
              {deviceOnline ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {deviceOnline ? "Device Online" : "Device Offline"}
            </Badge>

            {/* WebSocket connection status */}
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                wsConnected ? "bg-green-500" : "bg-red-500",
              )}
              title={
                wsConnected ? "WebSocket connected" : "WebSocket disconnected"
              }
            />

            <span className="text-sm text-gray-600">{user?.username}</span>
            <Button variant="ghost" size="icon" onClick={logout} title="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
