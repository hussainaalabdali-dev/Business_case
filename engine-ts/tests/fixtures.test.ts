/** CLAUDE.md rule 1: engine-ts parity with every fixture. Never edit a fixture to make this pass. */
import { describe, expect, it } from "vitest";
import { run } from "../src";
import { close, fixtureNames, load } from "./helpers";

describe("fixtures", () => {
  it("has the 13 reference cases", () => expect(fixtureNames()).toHaveLength(13));

  for (const name of fixtureNames()) {
    it(name, () => {
      const d = load(name);
      const res = run(d.inputs) as unknown as Record<string, number | null>;
      const fails = Object.entries(d.expected)
        .filter(([k, v]) => !close(res[k], v))
        .map(([k, v]) => `${k}: got ${res[k]} expected ${v}`);
      expect(fails).toEqual([]);
    });
  }

  it("base_monthly.json (every array, every month)", () => {
    const mb = load<Record<string, number[]>>("base_monthly.json");
    const res = run(load("base.json").inputs);
    const monthly = res.monthly as Record<string, number[]>;
    const fails: string[] = [];
    for (const [key, exp] of Object.entries(mb)) {
      const got = monthly[key];
      if (!got) { fails.push(`missing ${key}`); continue; }
      exp.forEach((b, m) => { if (!close(got[m], b)) fails.push(`${key}[${m}]: got ${got[m]} expected ${b}`); });
    }
    expect(fails.slice(0, 10)).toEqual([]);
  });

  it("base sanity", () => {
    const r = run(load("base.json").inputs);
    expect(r.DistM).toBe(36);
    expect(Math.round(r.RevTot)).toBe(155_556_200);
    expect(r.payback_month).toBe(36);
  });

  it("non-recovering IRR is null, not -100%", () => {
    const r = run(load("conservative.json").inputs);
    expect(r.dev_partner_irr).toBeNull();
    expect(r.dev_partner_net).toBeLessThan(0);
  });
});
