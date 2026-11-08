import { describe, expect, it } from "vitest";
import { run } from "../../engine-ts/src";
import perM2 from "../../fixtures/cost_per_m2_mode.json";
import { ABHUR, newProjectInputs, staleScenarios } from "../src/example";
import { parseNumber } from "../src/format";

const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) <= (Math.abs(b) > 10 ? Math.max(1, Math.abs(b) * 1e-4) : 1e-4);

describe("new project from the Abhur example", () => {
  it("matches fixtures/cost_per_m2_mode.json (cost per m² is the MVP default)", () => {
    const r = run(newProjectInputs()) as unknown as Record<string, number | null>;
    for (const [k, v] of Object.entries(perM2.expected)) if (typeof v === "number" && v !== -1) expect(close(r[k] ?? null, v), k).toBe(true);
  });
  it("does not mutate the example", () => {
    const i = newProjectInputs();
    i._boq[0]!.rate = 1;
    expect(ABHUR._boq[0]!.rate).not.toBe(1);
  });
  it("warns when the base scenario moved but the others did not", () => {
    const i = newProjectInputs();
    expect(staleScenarios(i)).toEqual([]);
    const pr = i.PriceRes as { conservative: number; base: number; optimistic: number };
    expect(staleScenarios({ ...i, PriceRes: { ...pr, base: 9000 } })).toEqual(["PriceRes"]);
  });
});

describe("number parsing", () => {
  it("accepts separators and Arabic-Indic digits", () => {
    expect(parseNumber("60,000,000")).toBe(60e6);
    expect(parseNumber("١٢٬٥٠٠")).toBe(12500);
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});
