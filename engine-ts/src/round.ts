/** Python's round(x, -6): round half to even, so LandValue variants match the Python engine exactly. */
export function roundMillionsHalfEven(x: number): number {
  const q = x / 1e6;
  const f = Math.floor(q);
  const diff = q - f;
  let n: number;
  if (diff > 0.5) n = f + 1;
  else if (diff < 0.5) n = f;
  else n = f % 2 === 0 ? f : f + 1;
  return n * 1e6;
}
