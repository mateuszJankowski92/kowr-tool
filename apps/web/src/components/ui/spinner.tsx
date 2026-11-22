import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center", className)} role="status">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
