import { cn } from "cn";
import type { ComponentProps } from "react";

export function Alert({
  className,
  variant = "info",
  ...props
}: ComponentProps<"div"> & { variant?: "info" | "warning" }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 rounded-xl border px-4 py-3 text-sm leading-6 [&>svg]:mt-1 [&>svg]:size-4 [&>svg]:shrink-0",
        variant === "warning"
          ? "border-warning-foreground/30 bg-warning text-warning-foreground"
          : "border-info-border bg-info text-info-foreground",
        className,
      )}
      data-slot="alert"
      role="note"
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("col-start-2 min-w-0 break-words", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}
