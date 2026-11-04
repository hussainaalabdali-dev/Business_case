import { describe, expect, it } from "vitest";
import { STRESS_TESTS, decide, gridA, gridB, run, runStress } from "../src";
import { close, load } from "./helpers";

const KPIS = ["Profit", "Margin", "project_irr", "project_npv", "InvE", "dev_partner_net_after_fin", "dev_partner_irr", "owner_multiple"] as const;
const SHARED: Record<number, string> = { 1: "base.json", 2: "rev_minus10.json", 6: "cost_plus20.json", 9: "delay12.json",
  12: "finance9.json", 15: "conservative.json", 16: "optimistic.json" };

describe("stress set §11.2", () => {
  const base = load("base.json").inputs;
  const rows = runStress(base);

  it("has exactly 22 tests in order", () => {
    expect(STRESS_TESTS).toHaveLength(22);
    expect(rows.map(r => r.n)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(rows.slice(19).map(r => r.changes.LandValue)).toEqual([50e6, 52e6, 55e6]);
    expect(rows.filter(r => r.changes.EarlyRec === 0).map(r => r.n)).toEqual([17, 18, 19]);
  });

  it("matches fixtures that share overrides", () => {
    for (const [n, name] of Object.entries(SHARED)) {
      const exp = load(name).expected;
      const row = rows[Number(n) - 1]!;
      for (const k of KPIS) if (k in exp) expect(close(row[k], exp[k]), `${n} ${name} ${k}`).toBe(true);
    }
  });

  it("runs fast enough for live updates", () => {
    const t0 = performance.now();
    runStress(base);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("grids §11.1", () => {
  const base = load("base.json").inputs;
  it("grid A base cell equals base profit", () => {
    const a = gridA(base);
    expect(a.values).toHaveLength(6);
    expect(close(a.values[2]![1], load("base.json").expected.Profit)).toBe(true);
  });
  it("grid B default land values and base cell", () => {
    const b = gridB(base);
    expect(b.cols).toEqual([45e6, 50e6, 53e6, 55e6, 60e6]);
    expect(close(b.values[2]![4], load("base.json").expected.Margin)).toBe(true);
  });
  it("replaces the scenario value before the shock", () => {
    const a = gridA({ ...base, RevShock: -0.1 }, [13000], [1.0]);
    expect(close(a.values[0]![0], load("rev_minus10.json").expected.Profit)).toBe(true);
  });
});

describe("decision §13", () => {
  it("base is RENEGOTIATE; no licence is HOLD", () => {
    const inp = load("base.json").inputs;
    const r = run(inp);
    expect(decide(inp, r, 1).quick_verdict).toBe("RENEGOTIATE");
    expect(decide(inp, r, 0).decision).toBe("HOLD");
  });
});
