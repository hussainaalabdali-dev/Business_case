/// <reference lib="webworker" />
/** Runs the heavier full re-runs (22 stress tests, grids) off the main thread. Formulas stay in engine-ts. */
import { gridA, gridB, runStress } from "../../engine-ts/src";
import type { EngineInputs } from "../../engine-ts/src";

self.onmessage = (e: MessageEvent<{ id: number; inputs: EngineInputs; landValues?: number[] }>) => {
  const { id, inputs, landValues } = e.data;
  try {
    const stress = runStress(inputs);
    const a = gridA(inputs);
    const b = gridB(inputs, undefined, landValues);
    (self as unknown as Worker).postMessage({ id, stress, gridA: a, gridB: b });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err instanceof Error ? err.message : err) });
  }
};
