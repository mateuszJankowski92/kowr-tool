import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  arePrintQueriesReady,
  getPrintQueryKeys,
  type PrintReportSelection,
} from "./print-report-data";
import { completeWaterAssessment } from "./water-assessment.test-fixture";

const selection: PrintReportSelection = {
  parcelIdentifier: "141201_1.0001.6509",
  crop: "pszenica-zwyczajna-jara",
  dateSelection: { type: "range", startDate: "2025-06-01", endDate: "2025-06-30" },
  weatherPreset: "90-days",
};

describe("print report readiness", () => {
  it("waits for an active map background after the report sources have settled", async () => {
    const client = new QueryClient();
    let finish: (value: string) => void = () => {};
    const observer = new QueryObserver(client, {
      queryKey: ["print-map-background", [0, 0, 100, 50]],
      queryFn: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    const unsubscribe = observer.subscribe(() => {});
    expect(arePrintQueriesReady(client, [])).toBe(false);
    const pending = observer.refetch();
    finish("data:image/jpeg;base64,dGVzdA==");
    await pending;
    expect(arePrintQueriesReady(client, [])).toBe(true);
    unsubscribe();
    client.clear();
  });
  it("requires the selected weather period and recommendations, and waits for active requests", async () => {
    const client = new QueryClient();
    const keys = getPrintQueryKeys(client, selection, "simple", null);
    for (const key of keys.slice(0, -1)) client.setQueryData(key, {});
    expect(arePrintQueriesReady(client, keys)).toBe(false);
    client.setQueryData(keys.at(-1) ?? [], {});
    expect(arePrintQueriesReady(client, keys)).toBe(true);
    let finish: (value: unknown) => void = () => {};
    const request = client.fetchQuery({
      queryKey: keys.at(-1) ?? [],
      staleTime: 0,
      queryFn: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    expect(arePrintQueriesReady(client, keys)).toBe(false);
    finish({});
    await request;
    expect(arePrintQueriesReady(client, keys)).toBe(true);
    expect(keys).toContainEqual([
      "weather-conditions",
      selection.parcelIdentifier,
      selection.crop,
      selection.dateSelection,
      "90-days",
    ]);
    client.clear();
  });

  it("accepts failed sources as settled and only requires satellite details for extended printing", async () => {
    const client = new QueryClient();
    const keys = getPrintQueryKeys(client, selection, "simple", null);
    for (const key of keys) {
      await client
        .fetchQuery({
          queryKey: key,
          retry: false,
          queryFn: () => Promise.reject(new Error("Unavailable")),
        })
        .catch(() => {});
    }
    expect(arePrintQueriesReady(client, keys)).toBe(true);
    expect(
      arePrintQueriesReady(client, getPrintQueryKeys(client, selection, "extended", null)),
    ).toBe(false);
    client.clear();
  });

  it("waits for recommendations calculated from the current result rather than an earlier empty context", () => {
    const client = new QueryClient();
    const before = getPrintQueryKeys(client, selection, "simple", null);
    client.setQueryData(before[4] ?? [], { status: "partial", items: [] });
    client.setQueryData(before[0] ?? [], completeWaterAssessment);
    const after = getPrintQueryKeys(client, selection, "simple", null);
    expect(after[4]).not.toEqual(before[4]);
    expect(arePrintQueriesReady(client, after)).toBe(false);
    client.clear();
  });
});
