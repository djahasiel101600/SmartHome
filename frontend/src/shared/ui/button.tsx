import * as React from "react";
import { cn } from "@/shared/lib";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const buttonVariants = {
  default:
    "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  outline:
    "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  link: "text-indigo-600 underline-offset-4 hover:underline",
};

const sizeVariants = {
  default: "h-10 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-11 rounded-md px-8",
  icon: "h-9 w-9",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          buttonVariants[variant],
          sizeVariants[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
