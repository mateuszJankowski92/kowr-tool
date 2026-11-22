import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WaterScenarioComparison } from "./WaterScenarioComparison";
import {
  assumptionDependentAssessment,
  waterScenario,
} from "./water-scenario-comparison.test-fixture";

afterEach(cleanup);

describe("WaterScenarioComparison", () => {
  it("shows every comparison together with exact ranges and full outcomes on demand", () => {
    render(<WaterScenarioComparison result={assumptionDependentAssessment} />);

    const initial = screen.getByRole("figure", { name: "Zapas wody na początku okresu" });
    const soil = screen.getByRole("figure", { name: "Ilość wody zatrzymywanej przez glebę" });
    expect(within(initial).getByText("Mokry początek")).not.toBeNull();
    expect(within(initial).getByText("14–32 dni")).not.toBeNull();
    expect(within(initial).getByText("80–97 dni")).not.toBeNull();
    expect(within(soil).getByText("14–80 dni")).not.toBeNull();
    expect(within(soil).getByText("32–97 dni")).not.toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText(/To nie jest przedział ufności ani pomiar wilgotności/)).not.toBeNull();

    const summary = screen.getByText("Pełne wyniki i założenia");
    const details = summary.closest("details");
    if (!details) throw new Error("Missing scenario details disclosure");
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getAllByText(/Na końcu okresu: ograniczenie w 1 z 2/)).toHaveLength(2);
  });

  it("distinguishes missing calculations from a calculated zero", () => {
    const missing = waterScenario({
      id: "missing",
      initialCondition: "wilting-point",
      stressDays: 0,
      stressOnFinalDay: false,
      incomplete: true,
    });
    const zero = waterScenario({
      id: "zero",
      initialCondition: "field-capacity",
      stressDays: 0,
      stressOnFinalDay: false,
    });
    render(
      <WaterScenarioComparison
        result={{
          ...assumptionDependentAssessment,
          scenarios: {
            ...assumptionDependentAssessment.scenarios,
            totalCount: 2,
            completeCount: 1,
            results: [zero, missing],
          },
        }}
      />,
    );
    const chart = screen.getByRole("figure", { name: "Zapas wody na początku okresu" });
    const [zeroRow, missingRow] = within(chart).getAllByRole("listitem");
    if (!zeroRow || !missingRow) throw new Error("Missing scenario range rows");
    expect(within(zeroRow).getByText("0 dni")).not.toBeNull();
    expect(within(missingRow).getByText("Brak wyniku")).not.toBeNull();
    expect(within(missingRow).queryByText("0 dni")).toBeNull();
    expect(within(missingRow).getByText(/Obliczono 0 z 1 wariantów/)).not.toBeNull();
  });
});
