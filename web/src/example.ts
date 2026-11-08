/** The Abhur South example (fixtures/base.json). New projects start from it with cost per m² (agreed MVP default). */
import base from "../../fixtures/base.json";
import type { EngineInputs, ScenarioValue } from "../../engine-ts/src";

export const ABHUR: EngineInputs = base.inputs as unknown as EngineInputs;

export function newProjectInputs(): EngineInputs {
  return structuredClone({ ...ABHUR, CostMode: 1 }) as EngineInputs;
}

/** Scenario inputs whose base changed while conservative/optimistic still equal the example (stress tests 15–18). */
export function staleScenarios(i: EngineInputs): string[] {
  const keys = ["PriceRes", "PriceShop", "RentInc", "Absorb", "CostFactor", "IncCap", "MezzUplift", "VATNR"] as const;
  return keys.filter(k => {
    const v = i[k] as ScenarioValue | number, e = ABHUR[k] as ScenarioValue | number;
    if (typeof v === "number" || typeof e === "number") return false;
    return v.base !== e.base && (v.conservative === e.conservative || v.optimistic === e.optimistic);
  });
}
