import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Label } from "@/shared/ui";
import { authApi } from "../api";
import { useAuthStore } from "../model";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login(username, password);
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      const { data: user } = await authApi.me();
      setUser(user);
      navigate("/");
      toast.success("Logged in successfully");
    } catch {
      toast.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to your account to continue
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="username" className="text-slate-700">
            Username
          </Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="Enter your username"
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-slate-700">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            className="h-11"
          />
        </div>
        <Button
          type="submit"
          className="w-full h-11 gap-2 text-sm font-semibold"
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing in...
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign In
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
