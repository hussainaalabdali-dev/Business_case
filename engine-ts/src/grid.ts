/** Sensitivity grids — ENGINE_SPEC §11.1. Every cell is a full re-run. */

import { run } from "./core";
import { roundMillionsHalfEven } from "./round";
import type { EngineInputs, ScenInput } from "./types";

export const PRICE_RES_VALUES = [11500, 12500, 13000, 14000, 15000, 16000] as const;
export const COST_FACTOR_VALUES = [0.9, 1.0, 1.1, 1.2, 1.3] as const;
export const LAND_FACTORS = [0.75, 0.83, 0.88, 0.92, 1.0] as const;
const SCEN_KEYS = ["conservative", "base", "optimistic"] as const;

export interface Grid { metric: string; row_name: string; rows: number[]; col_name: string; cols: number[]; values: number[][] }

/** Replace the active scenario's value; shocks are applied afterwards by the engine. */
function setScen(inp: EngineInputs, cur: ScenInput, value: number): ScenInput {
  return typeof cur === "number" ? value : { ...cur, [SCEN_KEYS[inp.Scen - 1]!]: value };
}

export const defaultLandValues = (inp: EngineInputs): number[] => LAND_FACTORS.map(f => roundMillionsHalfEven(inp.LandValue * f));

export function gridA(inp: EngineInputs, prices: readonly number[] = PRICE_RES_VALUES,
  costFactors: readonly number[] = COST_FACTOR_VALUES): Grid {
  const values = prices.map(p => costFactors.map(c =>
    run({ ...inp, PriceRes: setScen(inp, inp.PriceRes, p), CostFactor: setScen(inp, inp.CostFactor, c) }).Profit));
  return { metric: "Profit", row_name: "PriceRes", rows: [...prices], col_name: "CostFactor", cols: [...costFactors], values };
}

export function gridB(inp: EngineInputs, prices: readonly number[] = PRICE_RES_VALUES, landValues?: readonly number[]): Grid {
  const lands = landValues ? [...landValues] : defaultLandValues(inp);
  const values = prices.map(p => lands.map(lv => run({ ...inp, PriceRes: setScen(inp, inp.PriceRes, p), LandValue: lv }).Margin));
  return { metric: "Margin", row_name: "PriceRes", rows: [...prices], col_name: "LandValue", cols: lands, values };
}
