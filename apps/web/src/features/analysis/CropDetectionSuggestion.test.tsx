import type { CropDetectionResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCropDetection } from "../../api/crop-detections";
import { CropDetectionSuggestion } from "./CropDetectionSuggestion";

vi.mock("../../api/crop-detections", () => ({ getCropDetection: vi.fn() }));

const parcel = {
  identifier: "141201_1.0001.6509",
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [21.5, 52.1],
        [21.6, 52.1],
        [21.6, 52.2],
        [21.5, 52.1],
      ],
    ] as [[number, number][]],
  },
};

const provenance = {
  provider: "ARiMR GSA" as const,
  dataset: "Deklaracje rolne 2025 - uprawy (GSA)" as const,
  campaign: 2025 as const,
  retrievedAt: "2026-11-21T12:00:00.000Z",
};

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CropDetectionSuggestion", () => {
  it("retries a failed declaration lookup without reselecting the parcel or changing the crop", async () => {
    vi.mocked(getCropDetection)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({ status: "not_found", complete: true, candidates: [], provenance });
    const onSuggestion = vi.fn();
    renderWithQueryClient(
      <CropDetectionSuggestion
        currentCrop="ziemniak"
        onSuggestion={onSuggestion}
        parcel={parcel}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText(/Brak deklaracji ARiMR/)).not.toBeNull();
    expect(getCropDetection).toHaveBeenCalledTimes(2);
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("applies a dominant ARiMR declaration when the crop is empty", async () => {
    const response: CropDetectionResponse = {
      status: "suggested",
      complete: true,
      candidates: [
        {
          crop: "pszenica-zwyczajna-ozima",
          label: "Pszenica zwyczajna ozima",
          overlapAreaSquareMeters: 850,
          overlapPercent: 85,
        },
      ],
      provenance,
    };
    vi.mocked(getCropDetection).mockResolvedValue(response);
    const onSuggestion = vi.fn();

    renderWithQueryClient(
      <CropDetectionSuggestion currentCrop="" onSuggestion={onSuggestion} parcel={parcel} />,
    );

    await waitFor(() => expect(onSuggestion).toHaveBeenCalledWith("pszenica-zwyczajna-ozima"));
    expect(screen.getByText("Uzupełniono z deklaracji ARiMR")).not.toBeNull();
    expect(screen.getByText(/Deklaracja nie potwierdza/)).not.toBeNull();
  });

  it("does not override manual selection when several crops intersect the parcel", async () => {
    const response: CropDetectionResponse = {
      status: "multiple",
      complete: true,
      candidates: [
        {
          crop: "pszenica-zwyczajna-ozima",
          label: "Pszenica zwyczajna ozima",
          overlapAreaSquareMeters: 600,
          overlapPercent: 60,
        },
        {
          crop: "kukurydza-na-ziarno",
          label: "Kukurydza na ziarno",
          overlapAreaSquareMeters: 400,
          overlapPercent: 40,
        },
      ],
      provenance,
    };
    vi.mocked(getCropDetection).mockResolvedValue(response);
    const onSuggestion = vi.fn();

    renderWithQueryClient(
      <CropDetectionSuggestion
        currentCrop="rzepak-ozimy"
        onSuggestion={onSuggestion}
        parcel={parcel}
      />,
    );

    expect(await screen.findByText("Kilka upraw w granicach działki")).not.toBeNull();
    expect(screen.getByText("Pszenica zwyczajna ozima")).not.toBeNull();
    expect(screen.getByText("Kukurydza na ziarno")).not.toBeNull();
    expect(onSuggestion).not.toHaveBeenCalled();
  });
});
