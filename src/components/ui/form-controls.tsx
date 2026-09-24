import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const controlClassName =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClassName, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClassName, "min-h-20", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(controlClassName, "h-9 pr-8", className)} {...props}>
      {children}
    </select>
  );
}
