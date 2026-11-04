/**
 * Safe evaluator for BOQ formulas such as "=BasePerim*(ExcDepth+0.5)" (ENGINE_SPEC §4.1).
 * Accepts numbers, + - * / ( ) and the §4 variable names only. No eval().
 */

export const BOQ_VARIABLES: ReadonlySet<string> = new Set([
  "BaseGFA", "ExcDepth", "BasePerim", "RaftT", "FAR", "GPGFA", "FacadeA", "GlassPct", "LandArea", "Coverage",
  "ResGFA", "Units", "ShopGFA", "MezzGFA", "ExtWorks",
]);

export class FormulaError extends Error {
  override name = "FormulaError";
}

type Tok = { t: "num"; v: number } | { t: "name"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t") { i++; continue; }
    if ("+-*/()".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (name) { out.push({ t: "name", v: name[0] }); i += name[0].length; continue; }
    throw new FormulaError(`unsupported character: ${JSON.stringify(c)}`);
  }
  return out;
}

export function evaluate(value: number | string, env: Readonly<Record<string, number>>): number {
  if (typeof value === "number") return value;
  const text = value.trim();
  if (!text.startsWith("=")) {
    const n = Number(text);
    if (text === "" || Number.isNaN(n)) throw new FormulaError(`formula must start with '=': ${JSON.stringify(value)}`);
    return n;
  }
  const toks = tokenize(text.slice(1));
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];
  const isOp = (v: string): boolean => { const t = peek(); return t !== undefined && t.t === "op" && t.v === v; };

  // expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ; unary := ('+'|'-') unary | atom
  function expr(): number {
    let v = term();
    while (isOp("+") || isOp("-")) { const op = toks[pos++]!.v; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  function term(): number {
    let v = unary();
    while (isOp("*") || isOp("/")) { const op = toks[pos++]!.v; const r = unary(); v = op === "*" ? v * r : v / r; }
    return v;
  }
  function unary(): number {
    if (isOp("-")) { pos++; return -unary(); }
    if (isOp("+")) { pos++; return unary(); }
    return atom();
  }
  function atom(): number {
    const t = toks[pos++];
    if (t === undefined) throw new FormulaError(`invalid formula: ${JSON.stringify(value)}`);
    if (t.t === "num") return t.v;
    if (t.t === "name") {
      if (!BOQ_VARIABLES.has(t.v) || !(t.v in env)) throw new FormulaError(`unknown variable: ${t.v}`);
      return env[t.v]!;
    }
    if (t.v === "(") {
      const v = expr();
      if (!isOp(")")) throw new FormulaError(`invalid formula: ${JSON.stringify(value)}`);
      pos++;
      return v;
    }
    throw new FormulaError(`invalid formula: ${JSON.stringify(value)}`);
  }
  const result = expr();
  if (pos !== toks.length) throw new FormulaError(`invalid formula: ${JSON.stringify(value)}`);
  return result;
}
