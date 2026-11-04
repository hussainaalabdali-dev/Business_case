/** Decision conditions — ENGINE_SPEC §13. Mirrors engine/feasibility_engine/decision.py. */

import { scen } from "./core";
import { roundMillionsHalfEven } from "./round";
import type { EngineInputs, EngineResult } from "./types";

export type Verdict = "GO" | "CONDITIONAL GO" | "RENEGOTIATE" | "HOLD" | "NO GO";

export interface Thresholds {
  licence: number; price_res_min: number; land_value_max: number | null; early_rec: number;
  hard_max: number; vat_nr_max: number; margin_min: number | null;
}
export const DEFAULT_THRESHOLDS: Thresholds = {
  licence: 1, price_res_min: 14_500, land_value_max: null, early_rec: 0, hard_max: 70_000_000, vat_nr_max: 0, margin_min: null,
};

export interface Condition { key: string; value: number; threshold: number; met: boolean }
export interface Decision { conditions: Condition[]; decision: Verdict; quick_verdict: Verdict }

export function quickVerdict(margin: number, tgtMargin: number): Verdict {
  if (margin >= tgtMargin) return "GO";
  if (margin >= 0.1) return "CONDITIONAL GO";
  if (margin >= 0) return "RENEGOTIATE";
  return "NO GO";
}

export function decide(inp: EngineInputs, res: EngineResult, licence: number, th: Thresholds = DEFAULT_THRESHOLDS): Decision {
  const landMax = th.land_value_max ?? roundMillionsHalfEven(inp.LandMkt * inp.LandArea);
  const mMin = th.margin_min ?? inp.TgtMargin;
  const vat = scen(inp, inp.VATNR);
  const conditions: Condition[] = [
    { key: "licence", value: licence, threshold: th.licence, met: licence >= th.licence },
    { key: "price_res", value: res.PriceRes, threshold: th.price_res_min, met: res.PriceRes >= th.price_res_min },
    { key: "land_value", value: inp.LandValue, threshold: landMax, met: inp.LandValue <= landMax },
    { key: "early_rec", value: inp.EarlyRec, threshold: th.early_rec, met: inp.EarlyRec === th.early_rec },
    { key: "hard", value: res.Hard, threshold: th.hard_max, met: res.Hard <= th.hard_max },
    { key: "vat_nr", value: vat, threshold: th.vat_nr_max, met: vat <= th.vat_nr_max },
    { key: "margin", value: res.Margin, threshold: mMin, met: res.Margin >= mMin },
  ];
  const met = Object.fromEntries(conditions.map(c => [c.key, c.met]));
  let decision: Verdict;
  if (conditions.every(c => c.met)) decision = "GO";
  else if (met.licence && met.margin) decision = "CONDITIONAL GO";
  else if (licence === 0) decision = "HOLD";
  else decision = "RENEGOTIATE";
  return { conditions, decision, quick_verdict: quickVerdict(res.Margin, inp.TgtMargin) };
}
