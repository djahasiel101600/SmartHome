import { createBrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/app/providers";
import { AppLayout } from "@/widgets/layout";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { SchedulesPage } from "@/pages/schedules";
import { SettingsPage } from "@/pages/settings";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: <AuthProvider />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: "/",
            element: <DashboardPage />,
          },
          {
            path: "/schedules",
            element: <SchedulesPage />,
          },
          {
            path: "/settings",
            element: <SettingsPage />,
          },
        ],
      },
    ],
  },
]);
