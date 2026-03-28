import { useState, useEffect } from "react";

interface CountdownResult {
  remaining: number; // seconds remaining
  formatted: string; // e.g. "1h 23m 45s"
  progress: number; // 0..1 fraction elapsed
  isExpired: boolean;
}

export function useCountdown(
  expiresAt: string | undefined,
  startedAt: string | undefined,
): CountdownResult {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt));

  useEffect(() => {
    if (!expiresAt) return;

    setRemaining(calcRemaining(expiresAt));

    const id = setInterval(() => {
      const r = calcRemaining(expiresAt);
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [expiresAt]);

  const total = calcTotal(startedAt, expiresAt);
  const elapsed = total - remaining;
  const progress = total > 0 ? Math.min(elapsed / total, 1) : 1;

  return {
    remaining,
    formatted: formatCountdown(remaining),
    progress,
    isExpired: remaining <= 0,
  };
}

function calcRemaining(expiresAt: string | undefined): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function calcTotal(
  startedAt: string | undefined,
  expiresAt: string | undefined,
): number {
  if (!startedAt || !expiresAt) return 0;
  return Math.max(
    0,
    Math.floor(
      (new Date(expiresAt).getTime() - new Date(startedAt).getTime()) / 1000,
    ),
  );
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
