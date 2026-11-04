import { describe, expect, it } from "vitest";
import { FormulaError, evaluate, run } from "../src";
import { load } from "./helpers";

describe("BOQ formula evaluator", () => {
  it("evaluates arithmetic on spec variables", () => {
    expect(evaluate("=BasePerim*(ExcDepth+0.5)", { BasePerim: 2, ExcDepth: 1 })).toBe(3);
    expect(evaluate("=-FAR/4+1", { FAR: 8 })).toBe(-1);
    expect(evaluate(7, {})).toBe(7);
  });
  for (const bad of ["=__import__('os')", "=FAR**2", "=alert(1)", "=1;2", "=FAR)", "=(FAR", "=FAR.constructor"]) {
    it(`rejects ${bad}`, () => expect(() => evaluate(bad, { FAR: 1 })).toThrow(FormulaError));
  }
  it("rejects names outside ENGINE_SPEC §4", () =>
    expect(() => evaluate("=LandValue*2", { LandValue: 1 })).toThrow(/unknown variable: LandValue/));
  it("names the BOQ item in the error", () => {
    const inp = load("base.json").inputs;
    const boq = inp._boq.map(b => ({ ...b }));
    boq[3]!.qty_formula = "=BaseGFA*Thickness";
    expect(() => run({ ...inp, _boq: boq })).toThrow(/BOQ item أ4 .*unknown variable: Thickness/);
  });
});
