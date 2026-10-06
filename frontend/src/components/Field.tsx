import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  trailing?: ReactNode;
  error?: string;
  label?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ icon, trailing, error, label, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex items-center gap-2 rounded-icon border border-transparent bg-bg-muted px-3 py-2.5 transition-colors",
            "focus-within:border-accent-brand focus-within:ring-2 focus-within:ring-accent-brand/20",
            error && "border-accent-red focus-within:border-accent-red focus-within:ring-accent-red/20",
          )}
        >
          {icon && <span className="text-text-secondary">{icon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none",
              className,
            )}
            {...props}
          />
          {trailing}
        </div>
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>
    );
  },
);
Field.displayName = "Field";
