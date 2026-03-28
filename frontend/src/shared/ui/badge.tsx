import * as React from "react";
import { cn } from "@/shared/lib";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success";
}

const badgeVariants = {
  default: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/10",
  secondary: "bg-slate-100 text-slate-600 ring-1 ring-slate-500/10",
  destructive: "bg-red-50 text-red-700 ring-1 ring-red-600/10",
  outline: "border border-slate-200 text-slate-600",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
