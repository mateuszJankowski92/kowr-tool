import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-4 [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "border-muted-foreground/35 bg-muted/50 text-muted-foreground",
        success: "border-primary/40 bg-primary/5 text-primary",
        warning: "border-warning-foreground/40 bg-warning/50 text-warning-foreground",
        destructive: "border-destructive/40 bg-destructive/5 text-red-800",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}
