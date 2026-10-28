import { cloneElement, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** The ARIA attributes a form control must accept for Field to wire it up. */
interface ControlAriaProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

/** Label + control + hint/error, wired for accessibility. */
export function Field({ label, htmlFor, error, hint, required, className, children }: FieldProps) {
  const errorId = error ? `${htmlFor}-error` : null;
  const hintId = !error && hint ? `${htmlFor}-hint` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  // Point the control at its hint/error text and mark it invalid. A non-element
  // child (a composite control) still renders; only the wiring is skipped.
  const control = isValidElement<ControlAriaProps>(children)
    ? cloneElement(children, {
        "aria-describedby":
          [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </label>
      {control}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
