import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render as renderWithTestingLibrary,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cropModelCapabilitiesFixture } from "../../api/crop-model-capabilities.test-fixture";
import { AnalysisSetupForm } from "./AnalysisSetupForm";

vi.mock("../../api/crop-model-capabilities", () => ({
  getCropModelCapabilities: vi.fn(async () => cropModelCapabilitiesFixture),
}));

const clients: QueryClient[] = [];
function render(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["crop-model-capabilities"], cropModelCapabilitiesFixture);
  clients.push(client);
  return renderWithTestingLibrary(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  vi.unstubAllGlobals();
  if (originalScrollIntoView) Element.prototype.scrollIntoView = originalScrollIntoView;
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => {
    client.clear();
  });
});

describe("AnalysisSetupForm", () => {
  it("blocks report submission until invalid link settings are resolved", () => {
    const onContinue = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?crop=ziemniak&analysisDate=2026-11-10&unknown=value"]}>
        <AnalysisSetupForm
          hasInvalidLinkSettings
          onContinue={onContinue}
          today={new Date(2026, 10, 21)}
        />
      </MemoryRouter>,
    );

    const submit = screen.getByRole("button", { name: "Sprawdź warunki wodne" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it.each([
    "dateMode=day&analysisDate=invalid",
    "dateMode=day&analysisDate=2026-02-30",
    "dateMode=range&dateFrom=invalid&dateTo=2026-11-10",
    "dateMode=range&dateFrom=2026-11-10&dateTo=invalid",
  ])("allows invalid URL dates to be repaired in the calendar: %s", (parameters) => {
    const onContinue = vi.fn();
    render(
      <MemoryRouter initialEntries={[`/?crop=ziemniak&${parameters}`]}>
        <AnalysisSetupForm onContinue={onContinue} today={new Date(2026, 10, 21)} />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toContain("kalendarzu");
    const submit = screen.getByRole("button", {
      name: "Sprawdź warunki wodne",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Dzień lub zakres dat Wybierz/ }));
    fireEvent.click(screen.getByRole("button", { name: /10 listopada 2026/i }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit.disabled).toBe(false);
    expect(screen.getByTestId("location-search").textContent).toContain("analysisDate=2026-11-10");
  });

  it("selects a day and then an inclusive range from one calendar", () => {
    const onContinue = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?parcel=test"]}>
        <AnalysisSetupForm onContinue={onContinue} today={new Date(2026, 10, 21)} />
        <LocationProbe />
      </MemoryRouter>,
    );

    const picker = screen.getByRole("button", {
      name: "Dzień lub zakres dat 21 listopada 2026",
    });
    expect(screen.queryByRole("button", { name: "Zakres dat" })).toBeNull();
    fireEvent.click(picker);

    const currentDay = screen.getByRole("button", {
      name: /^sobota, 21 listopada 2026/i,
    }) as HTMLButtonElement;
    expect(currentDay.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /10 listopada 2026/i }));

    let locationSearch = screen.getByTestId("location-search").textContent ?? "";
    expect(locationSearch).toContain("dateMode=day");
    expect(locationSearch).toContain("analysisDate=2026-11-10");

    fireEvent.click(screen.getByRole("button", { name: /15 listopada 2026/i }));

    fireEvent.click(screen.getByRole("combobox", { name: "Uprawa" }));
    fireEvent.change(screen.getByPlaceholderText("Wyszukaj uprawę lub grupę…"), {
      target: { value: "pszenica zwyczajna ozima" },
    });
    fireEvent.click(screen.getByRole("option", { name: /Pszenica zwyczajna ozima/i }));

    locationSearch = screen.getByTestId("location-search").textContent ?? "";
    expect(locationSearch).toContain("dateMode=range");
    expect(locationSearch).toContain("dateFrom=2026-11-10");
    expect(locationSearch).toContain("dateTo=2026-11-15");
    expect(locationSearch).toContain("crop=pszenica-zwyczajna-ozima");

    fireEvent.click(screen.getByRole("button", { name: "Sprawdź warunki wodne" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("searches the ARiMR crop catalog by crop name, group, and unaccented text", () => {
    render(
      <MemoryRouter>
        <AnalysisSetupForm onContinue={vi.fn()} today={new Date(2026, 10, 21)} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Uprawa" }));
    const searchInput = screen.getByPlaceholderText("Wyszukaj uprawę lub grupę…");

    fireEvent.change(searchInput, { target: { value: "kukurydza ziarno" } });
    expect(screen.getByRole("option", { name: /Kukurydza na ziarno/i })).not.toBeNull();

    fireEvent.change(searchInput, { target: { value: "uzytki zielone" } });
    expect(screen.getByRole("option", { name: /^TUZ, Użytki zielone,/ })).not.toBeNull();
  });

  it("keeps crop selection working without additional planting settings", () => {
    render(
      <MemoryRouter
        initialEntries={["/?crop=pszenica-zwyczajna-jara&dateMode=day&analysisDate=2025-03-25"]}
      >
        <AnalysisSetupForm onContinue={vi.fn()} today={new Date(2026, 10, 21)} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Dodatkowe ustawienia uprawy")).toBeNull();
    expect(screen.queryByLabelText("Znana data siewu lub sadzenia")).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Uprawa" }));
    fireEvent.change(screen.getByPlaceholderText("Wyszukaj uprawę lub grupę…"), {
      target: { value: "ziemniak" },
    });
    fireEvent.click(screen.getByRole("option", { name: /^Ziemniak,/i }));

    const locationSearch = screen.getByTestId("location-search").textContent;
    expect(locationSearch).toContain("crop=ziemniak");
    expect(locationSearch).toContain("analysisDate=2025-03-25");
    expect(locationSearch).not.toContain("seasonStartDate");
  });

  it("continues to the report with only a crop and analysis date", () => {
    const onContinue = vi.fn();
    render(
      <MemoryRouter
        initialEntries={["/?crop=pszenica-zwyczajna-jara&dateMode=day&analysisDate=2025-06-30"]}
      >
        <AnalysisSetupForm onContinue={onContinue} today={new Date(2026, 10, 21)} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sprawdź warunki wodne" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location-search").textContent).not.toContain("seasonStartDate");
  });
});

describe("current-day configuration", () => {
  it("accepts today's date from the URL and explains incomplete daily data", () => {
    const onContinue = vi.fn();
    render(
      <MemoryRouter
        initialEntries={["/?crop=pszenica-zwyczajna-ozima&dateMode=day&analysisDate=2026-11-22"]}
      >
        <AnalysisSetupForm onContinue={onContinue} today={new Date(2026, 10, 22)} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Dzisiejsza doba jeszcze trwa/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sprawdź warunki wodne" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
