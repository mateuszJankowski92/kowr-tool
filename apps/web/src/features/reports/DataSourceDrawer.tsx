import { Info, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/button";
import { useReportPrint } from "./report-print-context";

export type DataSourceDrawerContent = {
  content: ReactNode;
  description: string;
  title: string;
};

type DataSourceDrawerContextValue = {
  openDrawer: (content: DataSourceDrawerContent) => void;
};

const DataSourceDrawerContext = createContext<DataSourceDrawerContextValue | null>(null);

export function DataSourceDrawerProvider({ children }: { children: ReactNode }) {
  const [drawerContent, setDrawerContent] = useState<DataSourceDrawerContent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openDrawer = useCallback((content: DataSourceDrawerContent) => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawerContent(content);
    setIsOpen(true);
  }, []);
  const contextValue = useMemo(() => ({ openDrawer }), [openDrawer]);

  return (
    <DataSourceDrawerContext.Provider value={contextValue}>
      {children}
      <DialogPrimitive.Root onOpenChange={setIsOpen} open={isOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-xl flex-col bg-background shadow-[-18px_0_48px_rgb(15_37_25_/_18%)] outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocusRef.current?.focus();
            }}
          >
            <div className="flex items-start justify-between shrink-0 gap-4 border-b border-border px-6 py-6 sm:px-8 sm:py-7">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-balance text-xl font-semibold leading-7 tracking-[-0.02em]">
                  {drawerContent?.title ?? "Źródło i jakość danych"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  {drawerContent?.description ?? "Szczegóły danych wykorzystanych w raporcie."}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <Button
                  aria-label="Zamknij informacje o źródle"
                  className="-mr-2 -mt-2 size-11 text-muted-foreground"
                  size="icon"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-5" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="source-drawer-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-7">
              {drawerContent?.content}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </DataSourceDrawerContext.Provider>
  );
}

type DataSourceDrawerTriggerProps = DataSourceDrawerContent & {
  sectionLabel: string;
};

export function DataSourceDrawerTrigger({
  content,
  description,
  sectionLabel,
  title,
}: DataSourceDrawerTriggerProps) {
  const context = useContext(DataSourceDrawerContext);
  const print = useReportPrint();
  if (print) {
    return print.variant === "extended" && print.sourceContainer
      ? createPortal(
          <section className="print-source-entry">
            <h3>{title}</h3>
            <p>{description}</p>
            {content}
          </section>,
          print.sourceContainer,
        )
      : null;
  }
  if (!context) {
    throw new Error("DataSourceDrawerTrigger must be used within DataSourceDrawerProvider.");
  }

  return (
    <button
      aria-haspopup="dialog"
      aria-label={`Pokaż źródło i jakość danych: ${sectionLabel}`}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => context.openDrawer({ content, description, title })}
      type="button"
    >
      <Info aria-hidden="true" className="size-4" />
    </button>
  );
}
