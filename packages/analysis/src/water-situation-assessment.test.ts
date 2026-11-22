import { describe, expect, it } from "vitest";
import { assessWaterSituation } from "./water-situation-assessment.js";

const scenarios = (at10Kpa: number | null, at33Kpa: number | null) =>
  [
    {
      id: "capacity-10-kpa",
      fieldCapacity: "10-kpa" as const,
      waterStressCoefficient: at10Kpa,
    },
    {
      id: "capacity-33-kpa",
      fieldCapacity: "33-kpa" as const,
      waterStressCoefficient: at33Kpa,
    },
  ] as const;

describe("water situation assessment", () => {
  it("reports no significant indication when both capacity scenarios show no stress", () => {
    expect(
      assessWaterSituation({
        scenarioResults: scenarios(1, 1),
        satelliteSignal: "neutral",
      }),
    ).toMatchObject({
      balanceClassification: "no-significant-shortage-indications",
      scenarioConsensus: "consistent-no-stress",
    });
  });

  it("reports elevated risk when both scenarios show stress", () => {
    expect(
      assessWaterSituation({
        scenarioResults: scenarios(0.9, 0.7),
        satelliteSignal: "unavailable",
      }),
    ).toMatchObject({
      balanceClassification: "elevated-shortage-risk",
      scenarioConsensus: "consistent-stress",
    });
  });

  it("keeps the strong class reserved and reports Ks=0 as stress without a severity tier", () => {
    expect(
      assessWaterSituation({
        scenarioResults: scenarios(0, 0),
        satelliteSignal: "not-qualified",
      }),
    ).toMatchObject({
      balanceClassification: "elevated-shortage-risk",
      scenarioConsensus: "consistent-stress",
      balanceReason: "core-scenarios-show-stress",
    });
  });

  it("makes scenario disagreement indeterminate rather than elevated risk", () => {
    const assessment = assessWaterSituation({
      scenarioResults: scenarios(1, 0.7),
      satelliteSignal: "unavailable",
    });

    expect(assessment).toMatchObject({
      balanceClassification: "indeterminate",
      scenarioConsensus: "scenario-disagreement",
      balanceReason: "core-scenarios-disagree",
    });
    expect(assessment.balanceClassification).not.toBe("elevated-shortage-risk");
  });

  it("detects disagreement across initial-state scenarios, not only capacity variants", () => {
    expect(
      assessWaterSituation({
        scenarioResults: [
          {
            id: "10-kpa-wet-start",
            fieldCapacity: "10-kpa",
            waterStressCoefficient: 1,
          },
          {
            id: "10-kpa-dry-start",
            fieldCapacity: "10-kpa",
            waterStressCoefficient: 0.9,
          },
          {
            id: "33-kpa-wet-start",
            fieldCapacity: "33-kpa",
            waterStressCoefficient: 1,
          },
          {
            id: "33-kpa-dry-start",
            fieldCapacity: "33-kpa",
            waterStressCoefficient: 0.7,
          },
        ],
        satelliteSignal: "not-qualified",
      }),
    ).toMatchObject({
      balanceClassification: "indeterminate",
      scenarioConsensus: "scenario-disagreement",
    });
  });

  it.each([
    {
      scenarioResults: scenarios(1, 1),
      satelliteSignal: "pattern-compatible-with-shortage" as const,
    },
    {
      scenarioResults: scenarios(0.9, 0.7),
      satelliteSignal: "pattern-incompatible-with-shortage" as const,
    },
  ])("keeps the FAO-56 class and reports conflicting satellite evidence separately", (input) => {
    const assessment = assessWaterSituation(input);

    expect(assessment.balanceClassification).not.toBe("indeterminate");
    expect(assessment.satellite).toEqual({
      signal: input.satelliteSignal,
      consistency: "conflicts-with-balance",
      limitsInterpretation: true,
    });
  });

  it("reports consistent satellite evidence without promoting the balance class", () => {
    expect(
      assessWaterSituation({
        scenarioResults: scenarios(0.9, 0.7),
        satelliteSignal: "pattern-compatible-with-shortage",
      }),
    ).toMatchObject({
      balanceClassification: "elevated-shortage-risk",
      satellite: {
        consistency: "consistent-with-balance",
        limitsInterpretation: false,
      },
    });
  });

  it("distinguishes missing core data from a complete but ambiguous result", () => {
    expect(
      assessWaterSituation({
        scenarioResults: scenarios(null, 0.7),
        satelliteSignal: "pattern-compatible-with-shortage",
      }),
    ).toMatchObject({
      balanceClassification: "insufficient-data",
      scenarioConsensus: "insufficient-data",
      balanceReason: "required-core-scenario-missing",
      satellite: { consistency: "not-comparable" },
    });
  });

  it("treats an omitted field-capacity variant as insufficient core data", () => {
    expect(
      assessWaterSituation({
        scenarioResults: [scenarios(0.8, 0.7)[0]],
        satelliteSignal: "neutral",
      }),
    ).toMatchObject({
      balanceClassification: "insufficient-data",
      balanceReason: "required-core-scenario-missing",
    });
  });

  it("uses numeric tolerance at the physical Ks bounds", () => {
    expect(
      assessWaterSituation({
        scenarioResults: scenarios(1 + 5e-10, 1 - 5e-10),
        satelliteSignal: "neutral",
      }).balanceClassification,
    ).toBe("no-significant-shortage-indications");
    expect(
      assessWaterSituation({
        scenarioResults: scenarios(5e-10, 0),
        satelliteSignal: "neutral",
      }).balanceClassification,
    ).toBe("elevated-shortage-risk");
  });

  it("rejects coefficients outside the FAO-56 Ks range", () => {
    expect(() =>
      assessWaterSituation({
        scenarioResults: scenarios(1.1, 1),
        satelliteSignal: "neutral",
      }),
    ).toThrow(RangeError);
  });
});
