import { createContext, useContext } from "react";

export type ReportPrintVariant = "simple" | "extended";

export const ReportPrintContext = createContext<{
  variant: ReportPrintVariant;
  sourceContainer: HTMLDivElement | null;
} | null>(null);

export function useReportPrint() {
  return useContext(ReportPrintContext);
}
