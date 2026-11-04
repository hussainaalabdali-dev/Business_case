/** IRR (ENGINE_SPEC §0): same algorithm as engine/feasibility_engine/irr.py. */

const GUESS = 0.01;
const STEP = 0.0025;
const GRID: number[] = Array.from({ length: Math.trunc(1.99 / STEP) + 1 }, (_, i) => -0.99 + i * STEP);

export function npvAt(flows: readonly number[], r: number): number {
  const d = 1.0 / (1.0 + r);
  let total = 0.0, factor = 1.0;
  for (const f of flows) { total += f * factor; factor *= d; }
  return total;
}

export function irrMonthly(flows: readonly number[]): number | null {
  if (!(flows.some(f => f > 0) && flows.some(f => f < 0))) return null;
  const roots: number[] = [];
  let prevR = GRID[0]!, prevV = npvAt(flows, prevR);
  for (let k = 1; k < GRID.length; k++) {
    const r = GRID[k]!, v = npvAt(flows, r);
    if (prevV === 0) roots.push(prevR);
    else if (prevV * v < 0) {
      let lo = prevR, hi = r, flo = prevV;
      for (let it = 0; it < 200; it++) {
        const mid = (lo + hi) / 2, fm = npvAt(flows, mid);
        if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        if (hi - lo < 1e-15) break;
      }
      roots.push((lo + hi) / 2);
    }
    prevR = r; prevV = v;
  }
  if (roots.length === 0) return null;
  return roots.reduce((best, x) => (Math.abs(x - GUESS) < Math.abs(best - GUESS) ? x : best));
}

/** A root that annualises to -100% means the flows never recover capital: treated as no IRR (§0). */
export function annualise(r: number | null): number | null {
  if (r === null) return null;
  const a = (1 + r) ** 12 - 1;
  return a <= -1 + 1e-6 ? null : a;
}

export const irrAnnual = (flows: readonly number[]): number | null => annualise(irrMonthly(flows));
