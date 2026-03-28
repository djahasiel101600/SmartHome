import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { WebSocketProvider } from "@/app/providers";
import { router } from "@/app/router";

export function App() {
  return (
    <WebSocketProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </WebSocketProvider>
  );
}
