import type { CropModelCapabilitiesResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getCropModelCapabilities } from "../../api/crop-model-capabilities";
import { cropModelCapabilitiesFixture } from "../../api/crop-model-capabilities.test-fixture";
import { CropCombobox } from "./CropCombobox";

vi.mock("../../api/crop-model-capabilities", () => ({ getCropModelCapabilities: vi.fn() }));

const clients: QueryClient[] = [];
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
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
  vi.resetAllMocks();
});

function renderPicker(
  value: "" | "pszenica-zwyczajna-jara" | "truskawka" | "tuz" = "",
  preloaded = false,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (preloaded) client.setQueryData(["crop-model-capabilities"], cropModelCapabilitiesFixture);
  clients.push(client);
  const onValueChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <label htmlFor="crop-test">Uprawa</label>
      <CropCombobox id="crop-test" value={value} onValueChange={onValueChange} />
    </QueryClientProvider>,
  );
  return { onValueChange };
}

describe("crop model availability at selection", () => {
  it("shows each model category before choosing and keeps keyboard selection working", async () => {
    vi.mocked(getCropModelCapabilities).mockResolvedValue(cropModelCapabilitiesFixture);
    const { onValueChange } = renderPicker("", true);
    fireEvent.click(screen.getByRole("combobox", { name: "Uprawa" }));
    expect(
      await screen.findByLabelText(/^Pszenica zwyczajna jara, Zboża, Model gatunkowy$/),
    ).not.toBeNull();
    expect(screen.getByLabelText(/^Truskawka, .*Model przybliżony$/)).not.toBeNull();
    expect(screen.getByLabelText(/^TUZ, .*Tylko warunki środowiskowe$/)).not.toBeNull();
    const search = screen.getByPlaceholderText("Wyszukaj uprawę lub grupę…");
    fireEvent.change(search, { target: { value: "pszenica zwyczajna jara" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith("pszenica-zwyczajna-jara");
  });

  it.each([
    ["pszenica-zwyczajna-jara", /Model gatunkowy/, /Nie są to pomiary/],
    ["truskawka", /Model przybliżony/, /przybliżonego kalendarza/],
    ["tuz", /Tylko warunki środowiskowe/, /bez obliczenia niedoboru/],
  ] as const)(
    "explains the result scope for a preselected crop %s",
    async (crop, label, description) => {
      vi.mocked(getCropModelCapabilities).mockResolvedValue(cropModelCapabilitiesFixture);
      renderPicker(crop);
      expect(await screen.findByText(label)).not.toBeNull();
      expect(screen.getByText(description)).not.toBeNull();
      expect(
        screen.getByRole("combobox", { name: "Uprawa" }).getAttribute("aria-describedby"),
      ).toContain("crop-test-model");
    },
  );

  it("announces pending metadata without claiming the crop lacks a model", () => {
    vi.mocked(getCropModelCapabilities).mockReturnValue(
      new Promise<CropModelCapabilitiesResponse>(() => {}),
    );
    renderPicker("truskawka");
    expect(screen.getByRole("status").textContent).toContain("Sprawdzam dostępność modelu");
    expect(screen.queryByText(/Tylko warunki środowiskowe/)).toBeNull();
  });

  it("keeps a failed lookup distinct from unavailable calculations and allows retry", async () => {
    vi.mocked(getCropModelCapabilities)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue(cropModelCapabilitiesFixture);
    renderPicker("truskawka");
    fireEvent.click(await screen.findByRole("button", { name: "Sprawdź modele ponownie" }));
    expect(await screen.findByText(/Model przybliżony/)).not.toBeNull();
    expect(screen.queryByText(/Tylko warunki środowiskowe/)).toBeNull();
  });
});
