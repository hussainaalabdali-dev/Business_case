/**
 * Project draft: text data, the opportunity scorecard and the engine inputs (which may be empty).
 * A new project starts empty for every project-specific number. Only general methodology
 * assumptions (percentages, efficiencies, durations) are prefilled, from the reference template,
 * and are labelled «افتراض عام» (CLAUDE.md rule 2). Formulas stay in engine-ts (rule 7).
 */
import base from "../../fixtures/base.json";
import type { BoqItem, EngineInputs, ScenarioValue } from "../../engine-ts/src";
import { ADVANCED, VISIBLE } from "./fields";
import type { Field, Key } from "./fields";

const TEMPLATE = base.inputs as unknown as EngineInputs;

export type Num = number | null;
export interface ScenNum { conservative: Num; base: Num; optimistic: Num }
export type Val = Num | ScenNum;
export interface DraftBoq extends Omit<BoqItem, "rate" | "qty_formula"> { qty_formula: number | string; rate: number | string | null }

export interface ScoreRow { key: string; label: string; weight: number; score: Num; note: string }
export interface Meta {
  city: string; district: string; street: string; mapUrl: string;
  property: string; deal: string; use: string; goal: string; issues: string;
  coachNotes: string;
  scorecard: ScoreRow[];
}
export interface Draft { v: 2; meta: Meta; values: Record<Key, Val>; boq: DraftBoq[] }

/** Project-specific numbers: always start empty. */
export const PROJECT_KEYS: ReadonlySet<Key> = new Set<Key>([
  "LandArea", "LandValue", "LandMkt", "FAR", "ShopGFA", "ResFloors",
  "PriceRes", "PriceShop", "RentInc", "Absorb",
  "RateAbove", "RateBase", "RateGP", "ExtWorks",
  "RentRes", "RentShop", "RentMezz", "BasePerim", "FacadeA",
]);

/** Deal choices that the user must make; neutral starting values, not Abhur's. */
const START_CHOICES: Partial<Record<Key, number>> = { EarlyRec: 0, CostMode: 1, Scen: 2 };

/** Scorecard criteria and weights from the reference template (sheet 1-تشخيص الفرصة). */
const SCORECARD: [string, string, number][] = [
  ["location", "الموقع", 0.15], ["market", "السوق والطلب", 0.15], ["use", "الاستخدام الاستثماري", 0.1],
  ["financial", "الجدوى المالية", 0.2], ["return", "العائد المتوقع", 0.15], ["risk", "المخاطر", 0.1],
  ["exit", "السيولة والخروج", 0.1], ["legal", "الوضع النظامي", 0.05],
];

/** Template thresholds: ≥80 قوية، ≥65 تحليل إضافي، ≥50 حذر مرتفع، غير ذلك غالباً لا تنتقل. */
export function scoreClass(total: number): string {
  if (total >= 80) return "فرصة قوية";
  if (total >= 65) return "تحتاج تحليلاً إضافياً";
  if (total >= 50) return "حذر مرتفع";
  return "غالباً لا تنتقل";
}

const isScen = (v: unknown): v is ScenarioValue => typeof v === "object" && v !== null && "base" in v;
const ALL_KEYS = Object.keys(TEMPLATE).filter(k => k !== "_boq" && k !== "ProjName") as Key[];

export function generalDefault(key: Key): Val | undefined {
  if (PROJECT_KEYS.has(key)) return undefined;
  if (key in START_CHOICES) return START_CHOICES[key]!;
  const v = TEMPLATE[key] as number | ScenarioValue;
  return isScen(v) ? { ...v } : v;
}

export function blankDraft(): Draft {
  const values = {} as Record<Key, Val>;
  for (const k of ALL_KEYS) {
    const t = TEMPLATE[k] as number | ScenarioValue;
    values[k] = PROJECT_KEYS.has(k) ? (isScen(t) ? { conservative: null, base: null, optimistic: null } : null) : generalDefault(k)!;
  }
  return {
    v: 2,
    meta: {
      city: "", district: "", street: "", mapUrl: "", property: "", deal: "", use: "", goal: "", issues: "", coachNotes: "",
      scorecard: SCORECARD.map(([key, label, weight]) => ({ key, label, weight, score: null, note: "" })),
    },
    values,
    boq: TEMPLATE._boq.map(b => ({ ...b, rate: typeof b.rate === "string" ? b.rate : null })),
  };
}

/** Old saves (plain EngineInputs) open as a draft with their numbers and empty text data. */
export function fromStored(stored: unknown): Draft {
  const d = stored as Partial<Draft> & Partial<EngineInputs>;
  if (d && d.v === 2 && d.meta && d.values) {
    const fresh = blankDraft();
    return { ...fresh, ...d, meta: { ...fresh.meta, ...d.meta }, values: { ...fresh.values, ...d.values } } as Draft;
  }
  const fresh = blankDraft();
  for (const k of ALL_KEYS) if (d && k in d) fresh.values[k] = (d as Record<string, Val>)[k]!;
  if (d && Array.isArray(d._boq)) fresh.boq = d._boq as DraftBoq[];
  return fresh;
}

/* ---------- conversion to engine inputs ---------- */

const ALL_FIELDS: Field[] = [...Object.values(VISIBLE), ...Object.values(ADVANCED)].flat().flatMap(g => g.fields);
export const labelOf = (k: Key): string => ALL_FIELDS.find(f => f.key === k)?.label ?? k;
const stepOf = (k: Key): number => {
  for (const [s, groups] of Object.entries(VISIBLE)) if (groups.some(g => g.fields.some(f => f.key === k))) return Number(s);
  for (const [s, groups] of Object.entries(ADVANCED)) if (groups.some(g => g.fields.some(f => f.key === k))) return Number(s);
  return 1;
};

export interface Missing { key: string; label: string; step: number }
export interface Converted { inputs: EngineInputs | null; missing: Missing[]; scenariosComplete: boolean }

const num = (v: Val): number | null => (typeof v === "number" ? v : null);

export function toEngine(d: Draft): Converted {
  const v = d.values;
  const missing: Missing[] = [];
  const need = (k: Key, ok: boolean, label = labelOf(k)) => { if (!ok) missing.push({ key: k, label, step: stepOf(k) }); };
  const scen = v.Scen as number;
  const activeKey = (["conservative", "base", "optimistic"] as const)[scen - 1]!;
  const shop = (num(v.ShopGFA) ?? 0) > 0;
  const required = new Set<Key>(["LandArea", "LandValue", "LandMkt", "FAR", "ShopGFA", "ResFloors", "PriceRes", "Absorb"]);
  if (shop) required.add(v.ShopValMode === 1 ? "RentInc" : "PriceShop");
  if (v.CostMode === 1) ["RateAbove", "RateBase", "RateGP", "ExtWorks"].forEach(k => required.add(k as Key));
  else ["BasePerim", "FacadeA", "ExtWorks"].forEach(k => required.add(k as Key));

  let scenariosComplete = true;
  const out: Record<string, unknown> = {};
  for (const k of ALL_KEYS) {
    const val = v[k];
    if (val !== null && typeof val === "object") {
      const active = val[activeKey];
      if (required.has(k)) need(k, active !== null);
      if (required.has(k) && (val.conservative === null || val.optimistic === null)) scenariosComplete = false;
      const fill = active ?? 0;
      out[k] = { conservative: val.conservative ?? fill, base: val.base ?? fill, optimistic: val.optimistic ?? fill };
    } else {
      if (required.has(k)) need(k, val !== null);
      out[k] = val ?? 0;
    }
  }
  if (v.CostMode === 0) {
    d.boq.forEach(b => { if (b.rate === null) missing.push({ key: `boq:${b.code}`, label: `سعر بند ${b.code}`, step: 1 }); });
  }
  out._boq = d.boq.map(b => ({ ...b, rate: b.rate ?? 0 }));
  out.ProjName = "";
  if ((num(v.FAR) ?? 0) > 0 && (num(v.ShopGFA) ?? 0) * (1 + (num(v.MezzPct) ?? 0)) >= (num(v.FAR) ?? 0)) {
    missing.push({ key: "FAR", label: "المسطح المسموح لازم يكون أكبر من المعارض والميزانين", step: 0 });
  }
  missing.sort((a, b) => a.step - b.step);
  return { inputs: missing.length ? null : (out as unknown as EngineInputs), missing, scenariosComplete };
}
