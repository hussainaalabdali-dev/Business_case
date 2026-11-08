/** Display formatting (rule 4): Western digits, thousands separators, millions with one decimal. */
const nf = (min: number, max: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
const f0 = nf(0, 0), f1 = nf(1, 1), f2 = nf(2, 2);

export const millions = (v: number | null | undefined): string => (v == null ? "—" : f1.format(v / 1e6));
export const amount = (v: number | null | undefined): string => (v == null ? "—" : f0.format(v));
export const pct = (v: number | null | undefined, d = 1): string => (v == null ? "—" : (d === 1 ? f1 : f2).format(v * 100) + "%");
export const mult = (v: number | null | undefined): string => (v == null ? "—" : f2.format(v) + "×");

/** Editable number shown in an input: up to 4 decimals, with separators. */
export const editable = (v: number): string => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(v);
export function parseNumber(s: string): number | null {
  const clean = s.replace(/[,\s٬]/g, "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");
  if (clean === "" || clean === "-" || clean === ".") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}
