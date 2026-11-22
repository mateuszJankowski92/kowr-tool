import type { ParcelResponse } from "@kowr/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportResultsSection } from "./ReportPanel";

vi.mock("./WaterSituationSummary", () => ({
  WaterSituationSummary: () => <section data-testid="water-situation">Water situation</section>,
}));
vi.mock("./HistoricalSusceptibilitySection", () => ({
  HistoricalSusceptibilitySection: () => <section data-testid="history">History</section>,
}));
vi.mock("./RecommendationsSection", () => ({
  RecommendationsSection: () => <section data-testid="recommendations">Recommendations</section>,
}));
vi.mock("../terrain-context/TerrainContextSection", () => ({
  TerrainContextSection: () => <section data-testid="terrain">Terrain</section>,
}));
vi.mock("../weather-conditions/WeatherConditionsSection", () => ({
  WeatherConditionsSection: () => <section data-testid="weather">Weather</section>,
}));
vi.mock("./SoilProfileCard", () => ({
  SoilProfileSection: () => <section data-testid="soil">Soil</section>,
}));
vi.mock("../satellite-history/SatelliteObservationsCard", () => ({
  SatelliteObservationsCard: () => <section data-testid="satellite">Satellite</section>,
}));

const parcel: ParcelResponse = {
  identifier: "141201_1.0001.6509",
  parcelNumber: "6509",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.5, 52.1],
        [21.6, 52.1],
        [21.6, 52.2],
        [21.5, 52.1],
      ],
    ],
  },
  administrativeArea: {
    voivodeship: "mazowieckie",
    county: "powiat miński",
    commune: "Mińsk Mazowiecki",
    cadastralDistrict: "Mińsk Mazowiecki",
  },
  provenance: {
    provider: "GUGiK EGiB WFS",
    datasource: "Zbiorcza usługa WFS EGiB",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
};

afterEach(cleanup);

describe("ReportResultsSection", () => {
  it("puts the assessment and actions before history and loads evidence only when requested", async () => {
    render(
      <MemoryRouter
        initialEntries={["/?crop=pszenica-zwyczajna-jara&dateMode=day&analysisDate=2025-06-30"]}
      >
        <ReportResultsSection parcel={parcel} />
      </MemoryRouter>,
    );
    const central = screen.getByTestId("water-situation");
    const recommendations = screen.getByTestId("recommendations");
    const history = screen.getByTestId("history");
    expect(
      central.compareDocumentPosition(recommendations) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      recommendations.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const name of ["terrain", "weather", "soil", "satellite"]) {
      expect(screen.queryByTestId(name)).toBeNull();
    }
    const disclosures = [
      ["Teren i woda w okolicy", "terrain"],
      ["Opady i pogoda", "weather"],
      ["Roślinność z satelity", "satellite"],
      ["Gleba i zatrzymywanie wody", "soil"],
    ];
    for (const [label, testId] of disclosures) {
      fireEvent.click(screen.getByText(label ?? ""));
      await waitFor(() => expect(screen.getByTestId(testId ?? "")).not.toBeNull());
    }
    const soil = screen.getByTestId("soil");
    const soilSummary = screen.getByText("Gleba i zatrzymywanie wody");
    fireEvent.click(soilSummary);
    expect(soilSummary.closest("details")?.open).toBe(false);
    fireEvent.click(soilSummary);
    expect(soilSummary.closest("details")?.open).toBe(true);
    expect(screen.getByTestId("soil")).toBe(soil);
  });
});
