import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

type RetryButtonProps = {
  children?: ReactNode;
  className?: string;
  isRetrying: boolean;
  onRetry: () => void;
};

export function RetryButton({
  children = "Spróbuj ponownie",
  className,
  isRetrying,
  onRetry,
}: RetryButtonProps) {
  return (
    <Button
      aria-busy={isRetrying}
      aria-label={isRetrying ? "Pobieranie danych…" : undefined}
      className={`relative min-h-11 h-auto max-w-full whitespace-normal text-left ${className ?? ""}`}
      disabled={isRetrying}
      onClick={onRetry}
      type="button"
      variant="outline"
    >
      {isRetrying && <Spinner className="absolute inset-0" label="Pobieranie danych…" />}
      <span
        aria-hidden={isRetrying || undefined}
        className={`inline-flex items-center gap-2 ${isRetrying ? "invisible" : ""}`}
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {children}
      </span>
    </Button>
  );
}
