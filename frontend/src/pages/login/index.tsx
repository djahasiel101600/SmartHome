import { LoginForm } from "@/features/auth";
import { Zap } from "lucide-react";

export function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-linear-to-br from-indigo-600 via-indigo-700 to-purple-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm shadow-lg">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">
              Smart Home
            </span>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Control your home,
            <br />
            from anywhere.
          </h2>
          <p className="text-lg text-indigo-200 max-w-md">
            Monitor sensors, manage relays, schedule automations — all from a
            single, beautiful dashboard.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-4">
            {[
              { label: "Relays", value: "4" },
              { label: "Sensors", value: "2" },
              { label: "Schedules", value: "∞" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-3"
              >
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-sm text-indigo-200">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/30">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-slate-900">
              Smart Home
            </span>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
