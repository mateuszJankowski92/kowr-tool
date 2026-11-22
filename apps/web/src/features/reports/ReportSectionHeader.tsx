import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type DataSourceDrawerContent, DataSourceDrawerTrigger } from "./DataSourceDrawer";

type ReportSectionHeaderProps = {
  description?: string;
  headingLevel?: "h1" | "h2";
  icon: LucideIcon;
  id: string;
  source?: DataSourceDrawerContent;
  status?: ReactNode;
  title: string;
};

export function ReportSectionHeader({
  description,
  headingLevel = "h2",
  icon: Icon,
  id,
  source,
  status,
  title,
}: ReportSectionHeaderProps) {
  const Heading = headingLevel;

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <Heading className="text-balance text-xl font-semibold tracking-[-0.025em]" id={id}>
            {title}
          </Heading>
          {source && (
            <DataSourceDrawerTrigger
              content={source.content}
              description={source.description}
              sectionLabel={title}
              title={source.title}
            />
          )}
        </div>
        {description && (
          <p className="col-start-2 max-w-[70ch] text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {status}
    </header>
  );
}
