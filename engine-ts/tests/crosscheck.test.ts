/** Random input variations computed by the Python reference engine (tests/gen_crosscheck.py). */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, runStress } from "../src";
import type { EngineInputs } from "../src";
import { close, ROOT } from "./helpers";

const FILE = join(ROOT, "engine-ts", "tests", ".crosscheck.json");
interface Case { inputs: EngineInputs; expected: Record<string, number | null>; stress: Record<string, number | null>[] }
const STRESS_KPIS = ["Profit", "Margin", "project_irr", "project_npv", "InvE", "dev_partner_net_after_fin", "dev_partner_irr", "owner_multiple"];

describe.skipIf(!existsSync(FILE) && !process.env.CI)("cross-check vs Python engine", () => {
  it("every random case and its 22 stress tests match", () => {
    const cases = JSON.parse(readFileSync(FILE, "utf8")) as Case[];
    expect(cases.length).toBeGreaterThan(0);
    const fails: string[] = [];
    cases.forEach((c, i) => {
      const r = run(c.inputs) as unknown as Record<string, number | null>;
      for (const [k, v] of Object.entries(c.expected)) if (!close(r[k], v)) fails.push(`case ${i} ${k}: ${r[k]} vs ${v}`);
      runStress(c.inputs).forEach((s, j) => {
        for (const k of STRESS_KPIS) {
          const a = (s as unknown as Record<string, number | null>)[k], b = c.stress[j]![k];
          if (!close(a, b)) fails.push(`case ${i} stress ${j + 1} ${k}: ${a} vs ${b}`);
        }
      });
    });
    expect(fails.slice(0, 10)).toEqual([]);
  });
});
