import { describe, expect, it } from "vitest";
import { run } from "../../engine-ts/src";
import type { EngineInputs } from "../../engine-ts/src";
import base from "../../fixtures/base.json";
import perM2 from "../../fixtures/cost_per_m2_mode.json";
import { parseNumber } from "../src/format";
import { blankDraft, fromStored, PROJECT_KEYS, scoreClass, toEngine } from "../src/project";

const close = (a: number | null | undefined, b: number) =>
  a != null && Math.abs(a - b) <= (Math.abs(b) > 10 ? Math.max(1, Math.abs(b) * 1e-4) : 1e-4);
const ABHUR = base.inputs as unknown as EngineInputs;

describe("new project", () => {
  it("starts with no project-specific numbers (no Abhur data)", () => {
    const d = blankDraft();
    for (const k of PROJECT_KEYS) {
      const v = d.values[k];
      expect(v === null || (typeof v === "object" && v.base === null && v.conservative === null), k).toBe(true);
    }
    expect(d.boq.every(b => b.rate === null || typeof b.rate === "string")).toBe(true);
    expect(d.meta.city).toBe("");
    expect(d.values.EarlyRec).toBe(0);
  });

  it("lists what is missing and does not calculate", () => {
    const c = toEngine(blankDraft());
    expect(c.inputs).toBeNull();
    expect(c.missing.map(m => m.key)).toEqual(expect.arrayContaining(["LandArea", "LandValue", "FAR", "PriceRes", "RateAbove"]));
  });

  it("scorecard weights total 100% and template thresholds", () => {
    expect(blankDraft().meta.scorecard.reduce((a, r) => a + r.weight, 0)).toBeCloseTo(1, 10);
    expect([scoreClass(80), scoreClass(65), scoreClass(54.5), scoreClass(49)])
      .toEqual(["فرصة قوية", "تحتاج تحليلاً إضافياً", "حذر مرتفع", "غالباً لا تنتقل"]);
  });
});

describe("draft → engine inputs is lossless", () => {
  const filled = (costMode: 0 | 1) => {
    const d = fromStored({ ...ABHUR, CostMode: costMode });
    return toEngine(d);
  };
  it("a draft holding the Abhur inputs reproduces fixtures/base.json", () => {
    const c = filled(0);
    expect(c.missing).toEqual([]);
    const r = run(c.inputs!) as unknown as Record<string, number | null>;
    for (const [k, v] of Object.entries(base.expected)) if (typeof v === "number" && v !== -1) expect(close(r[k], v), k).toBe(true);
  });
  it("and fixtures/cost_per_m2_mode.json in cost-per-m² mode", () => {
    const r = run(filled(1).inputs!) as unknown as Record<string, number | null>;
    for (const [k, v] of Object.entries(perM2.expected)) if (typeof v === "number" && v !== -1) expect(close(r[k], v), k).toBe(true);
  });
});

describe("number parsing", () => {
  it("accepts separators and Arabic-Indic digits", () => {
    expect(parseNumber("60,000,000")).toBe(60e6);
    expect(parseNumber("١٢٬٥٠٠")).toBe(12500);
    expect(parseNumber("abc")).toBeNull();
  });
});
