/** Stress set — ENGINE_SPEC §11.2 (exactly 22 tests, fixed order). Mirrors engine/feasibility_engine/stress.py. */

import { run } from "./core";
import { roundMillionsHalfEven } from "./round";
import type { EngineInputs } from "./types";

export interface StressTest { label: string; changes: Partial<Record<keyof EngineInputs, number>>; landFactor?: number }
export interface StressRow {
  n: number; label: string; changes: Record<string, number>;
  Profit: number; Margin: number; project_irr: number | null; project_npv: number; InvE: number;
  dev_partner_net_after_fin: number; dev_partner_irr: number | null; owner_multiple: number | null;
  equity_multiple: number;
}

const COMBINED = { RevShock: -0.1, CostShock: 0.1, DelayM: 6 };

export const STRESS_TESTS: readonly StressTest[] = [
  { label: "الأساسي", changes: {} },
  { label: "الإيراد −10%", changes: { RevShock: -0.1 } },
  { label: "الإيراد −20%", changes: { RevShock: -0.2 } },
  { label: "الإيراد −30%", changes: { RevShock: -0.3 } },
  { label: "التكلفة +10%", changes: { CostShock: 0.1 } },
  { label: "التكلفة +20%", changes: { CostShock: 0.2 } },
  { label: "التكلفة +30%", changes: { CostShock: 0.3 } },
  { label: "تأخير 6 أشهر", changes: { DelayM: 6 } },
  { label: "تأخير 12 شهر", changes: { DelayM: 12 } },
  { label: "تأخير 18 شهر", changes: { DelayM: 18 } },
  { label: "تمويل 7%", changes: { FinRate: 0.07 } },
  { label: "تمويل 9%", changes: { FinRate: 0.09 } },
  { label: "تمويل 11%", changes: { FinRate: 0.11 } },
  { label: "مركّب: إيراد −10%، تكلفة +10%، تأخير 6", changes: { ...COMBINED } },
  { label: "السيناريو المتحفظ", changes: { Scen: 1 } },
  { label: "السيناريو المتفائل", changes: { Scen: 3 } },
  { label: "المتحفظ بدون استرداد مبكر", changes: { Scen: 1, EarlyRec: 0 } },
  { label: "المتحفظ بدون استرداد مبكر + معارض عينية", changes: { Scen: 1, EarlyRec: 0, ShopsInKind: 1 } },
  { label: "المركّب بدون استرداد مبكر", changes: { ...COMBINED, EarlyRec: 0 } },
  { label: "الأرض × 0.83", changes: {}, landFactor: 0.83 },
  { label: "الأرض × 0.87", changes: {}, landFactor: 0.87 },
  { label: "الأرض × 0.92", changes: {}, landFactor: 0.92 },
];

export function applyTest(base: EngineInputs, test: StressTest): { inputs: EngineInputs; changes: Record<string, number> } {
  const changes: Record<string, number> = { ...(test.changes as Record<string, number>) };
  if (test.landFactor !== undefined) changes.LandValue = roundMillionsHalfEven(base.LandValue * test.landFactor);
  return { inputs: { ...base, ...changes } as EngineInputs, changes };
}

export function runStress(base: EngineInputs): StressRow[] {
  return STRESS_TESTS.map((test, i) => {
    const { inputs, changes } = applyTest(base, test);
    const r = run(inputs);
    return {
      n: i + 1, label: test.label, changes, Profit: r.Profit, Margin: r.Margin, project_irr: r.project_irr,
      project_npv: r.project_npv, InvE: r.InvE, dev_partner_net_after_fin: r.dev_partner_net_after_fin,
      dev_partner_irr: r.dev_partner_irr, owner_multiple: r.owner_multiple, equity_multiple: r.equity_multiple,
    };
  });
}
