import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

type ReportEvidenceDetailsProps = {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
};

export function ReportEvidenceDetails({
  children,
  description,
  icon: Icon,
  title,
}: ReportEvidenceDetailsProps) {
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <details
      className="report-evidence-details group"
      onToggle={(event) => {
        if (event.currentTarget.open) setHasOpened(true);
      }}
    >
      <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" strokeWidth={1.7} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      {hasOpened && <div className="report-evidence-content pb-5">{children}</div>}
    </details>
  );
}
