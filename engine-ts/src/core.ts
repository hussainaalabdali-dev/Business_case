/** Full engine run — ENGINE_SPEC §1–§10 and §12. Mirrors engine/feasibility_engine/core.py line by line. */

import { evaluate, FormulaError } from "./expr";
import { irrAnnual, npvAt } from "./irr";
import { MONTHLY_KEYS } from "./types";
import type { EngineInputs, EngineResult, MonthlyKey, OwnerShareRow, ScenInput } from "./types";

export const NM = 70; // §0 horizon
export const OWNER_SHARES = [0.3, 0.4, 0.5, 0.6, 0.7] as const; // §10
const MAX_LAND_TARGETS = [0.12, 0.15, 0.18, 0.2] as const; // §9
const SCEN_KEYS = ["conservative", "base", "optimistic"] as const;

const div = (a: number, b: number): number | null => (b ? a / b : null);

function cum(xs: readonly number[]): number[] {
  let acc = 0;
  return xs.map(x => (acc += x));
}

export function scen(g: EngineInputs, v: ScenInput): number {
  return typeof v === "number" ? v : v[SCEN_KEYS[g.Scen - 1]!];
}

export function run(g: EngineInputs): EngineResult {
  // §1 active scenario values
  const PriceRes = scen(g, g.PriceRes) * (1 + g.RevShock);
  const PriceShop = scen(g, g.PriceShop) * (1 + g.RevShock);
  const CostFactor = scen(g, g.CostFactor) * (1 + g.CostShock);
  const MezzUplift = scen(g, g.MezzUplift), VATNR = scen(g, g.VATNR), RentInc = scen(g, g.RentInc);
  const IncCap = scen(g, g.IncCap), Absorb = scen(g, g.Absorb);

  // §2 areas
  const MezzGFA = g.ShopGFA * g.MezzPct;
  const ResGFA = g.FAR - g.ShopGFA - MezzGFA;
  const ShopSell = g.ShopGFA * g.EffShop;
  const MezzSell = MezzGFA * g.EffMezz;
  const ResSell = ResGFA * g.EffRes;
  const SellTot = ShopSell + MezzSell + ResSell;
  const BaseGFA = g.LandArea * g.BasePct;
  const GPGFA = Math.max(0.0, g.LandArea * g.Coverage - g.ShopGFA);
  const Parking = (BaseGFA + GPGFA) / g.ParkM2;
  const FloorPlate = ResGFA / (g.ResFloors + 0.5);
  const Units = ResSell / g.AvgUnit;

  // §3 revenue
  const ShopMezzGFA = g.ShopGFA + MezzGFA;
  const IncShopVal =
    (g.ShopGFA + g.RentBasis * MezzGFA) * RentInc * (1 - g.IncVac) / IncCap * (1 - g.IncDisc) * (1 + g.RevShock);
  let RevShop: number, RevMezz: number;
  if (g.ShopValMode === 1) {
    RevShop = ShopMezzGFA ? IncShopVal * g.ShopGFA / ShopMezzGFA : 0;
    RevMezz = ShopMezzGFA ? IncShopVal * MezzGFA / ShopMezzGFA : 0;
  } else {
    RevShop = ShopSell * PriceShop;
    RevMezz = RevShop * MezzUplift * g.MezzPct;
  }
  const RevRes = ResSell * PriceRes;
  const RevTot = RevRes + RevShop + RevMezz;
  const ShopRev = RevShop + RevMezz;
  const SIK = g.ShopsInKind;

  // §4.1 BOQ
  const env: Record<string, number> = {
    BaseGFA, ExcDepth: g.ExcDepth, BasePerim: g.BasePerim, RaftT: g.RaftT, FAR: g.FAR, GPGFA,
    FacadeA: g.FacadeA, GlassPct: g.GlassPct, LandArea: g.LandArea, Coverage: g.Coverage, ResGFA,
    Units, ShopGFA: g.ShopGFA, MezzGFA, ExtWorks: g.ExtWorks,
  };
  const groups: Record<string, number> = {};
  let SubItems = 0.0;
  for (const it of g._boq) {
    let amt: number;
    try {
      amt = evaluate(it.qty_formula, env) * evaluate(it.rate, env);
    } catch (e) {
      if (e instanceof FormulaError) throw new FormulaError(`BOQ item ${it.code} (${it.item}): ${e.message}`);
      throw e;
    }
    SubItems += amt;
    const key = [...it.code][0]!; // group letter (أ ب ج د ه و ز)
    groups[key] = (groups[key] ?? 0) + amt;
  }
  const Prelims = SubItems * g.PrelimPct;
  const OHP = (SubItems + Prelims) * g.OHPPct;
  const HardBase = SubItems + Prelims + OHP;
  // §4.2
  const HardPerM2 = g.FAR * g.RateAbove + BaseGFA * g.RateBase + GPGFA * g.RateGP + g.ExtWorks;
  // §4.3
  const HardRaw = g.CostMode === 1 ? HardPerM2 : HardBase;
  const Hard = HardRaw * CostFactor * (1 + VATNR);
  const hard_by_group: Record<string, number> = {};
  for (const [k, v] of Object.entries(groups)) {
    hard_by_group[k] = SubItems ? HardRaw * CostFactor * (v / SubItems) * (1 + VATNR) : 0;
  }

  // §5
  const DelayM = g.DelayM;
  const DesignC = Hard * g.DesignPct;
  const PermitC = Hard * g.PermitPct;
  const ContC = Hard * g.ContPct + Hard * g.DelayCostPct * DelayM;
  const MktC = (RevTot - SIK * ShopRev) * g.MktPct;
  const LandValue = g.LandValue;
  const RETTC = LandValue * g.RETTPct;
  const DevFeeC = (Hard + DesignC + PermitC + ContC) * g.DevFeePct;
  const DevCost = Hard + DesignC + PermitC + ContC + MktC + RETTC + DevFeeC;
  const TotCost = DevCost + LandValue;
  const Profit = RevTot - TotCost;
  const Margin = Profit / TotCost;

  // §6
  const PreM = g.PreM, ConM = g.ConBase + DelayM;
  const BuildEnd = PreM + ConM;
  const DistM = Math.trunc(Math.max(BuildEnd, g.Launch + Absorb - 1) + 1);
  if (DistM >= NM) throw new RangeError(`DistM (${DistM}) must be below the ${NM}-month horizon`);
  const LandCash = LandValue - SIK * ShopRev;
  const ExtW = g.ExtWorks;

  // §7 monthly
  const M = Object.fromEntries(MONTHLY_KEYS.map(k => [k, new Array<number>(NM).fill(0)])) as Record<MonthlyKey, number[]>;
  let prevPc = 0, prevCv = 0, prevCc = 0, prevEsc = 0, prevBal = 0, prevOdc = 0, invContribCum = 0;
  for (let m = 0; m < NM; m++) {
    let pc: number;
    if (m <= PreM) pc = 0;
    else if (m >= BuildEnd) pc = 1;
    else { const t = (m - PreM) / ConM; pc = t - Math.sin(2 * Math.PI * t) / (2 * Math.PI); }
    const pm = pc - prevPc;
    const res = m < g.Launch ? 0 : Math.min(1, (m - g.Launch + 1) / Absorb);
    const shp = m < g.Launch ? 0 : Math.min(1, (m - g.Launch + 1) / g.ShopAbs);
    const cv = RevRes * res + ShopRev * (1 - SIK) * shp;
    const cpct = g.DownPct + (1 - g.DownPct) * pc;
    const cc = cv * cpct;
    const coll = cc - prevCc;
    const land = m === 0 ? LandValue : 0;
    const rett = m === 1 ? RETTC : 0;
    const hard = (Hard - ExtW) * pm + (m === BuildEnd ? ExtW : 0);
    const design = (m >= 1 && m <= PreM ? DesignC * 0.5 / PreM : 0) + DesignC * 0.5 * pm;
    const permits = m >= 1 && m <= PreM ? PermitC / PreM : 0;
    const cont = ContC * pm;
    const mkt = g.MktPct * (cv - prevCv);
    const fee = DevFeeC * pm;
    const costs = rett + hard + design + permits + cont + mkt + fee;
    const elig = hard + cont + DesignC * 0.5 * pm;
    const escB = prevEsc + coll;
    const rel = g.Escrow === 0 || m >= BuildEnd ? escB : Math.min(escB, elig);
    const escA = escB - rel;
    const cnet = rel - costs;
    const pflow = coll - costs - land + (m === DistM ? SIK * ShopRev : 0);
    const bb = prevBal + cnet;
    const od = g.EarlyRec === 1 ? Math.min(LandCash - prevOdc, Math.max(0, bb)) : 0;
    const odc = prevOdc + od;
    const ic = Math.max(0, -(bb - od));
    const ba = bb - od + ic;
    invContribCum += ic;
    const row: [MonthlyKey, number][] = [
      ["progress_cum", pc], ["progress_month", pm], ["res_contracted_cum", res], ["shop_contracted_cum", shp],
      ["contract_value_cum", cv], ["collect_pct", cpct], ["collections_cum", cc], ["collections_month", coll],
      ["land", land], ["rett", rett], ["hard", hard], ["design", design], ["permits", permits],
      ["contingency", cont], ["marketing", mkt], ["dev_fee", fee], ["cash_costs", costs],
      ["escrow_eligible", elig], ["escrow_before", escB], ["escrow_release", rel], ["escrow_after", escA],
      ["company_net", cnet], ["project_flow", pflow], ["balance_before", bb], ["owner_draw", od],
      ["owner_draw_cum", odc], ["investor_contrib", ic], ["balance_after", ba],
      ["investor_outstanding", m < DistM ? invContribCum : 0],
    ];
    for (const [k, v] of row) M[k][m] = v;
    prevPc = pc; prevCv = cv; prevCc = cc; prevEsc = escA; prevBal = ba; prevOdc = odc;
  }

  // §8 waterfall
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
  const InvE = sum(M.investor_contrib);
  const OwnDraw = sum(M.owner_draw);
  const PotP = M.balance_after[DistM]!;
  const OwnRem = LandCash - OwnDraw;
  const PoolProfit = PotP + OwnDraw - LandCash - InvE;
  const OwnShare = g.ShareMode === 1 ? LandValue / (LandValue + DevCost) : g.OwnShareFix;
  const ownerFinal = (s: number): number =>
    g.EarlyRec === 1 ? Math.min(PotP, OwnRem) + Math.max(0, PoolProfit) * s : LandCash + PoolProfit * s;
  const OwnerFinal = ownerFinal(OwnShare);
  const InvFinal = PotP - OwnerFinal;

  const atDist = Array.from({ length: NM }, (_, m) => (m === DistM ? 1 : 0));
  M.company_cum = cum(M.company_net);
  M.owner_final = atDist.map(a => OwnerFinal * a);
  M.investor_final = atDist.map(a => InvFinal * a);
  M.investor_flow = M.investor_contrib.map((c, m) => -c + M.investor_final[m]!);
  M.owner_flow = M.land.map((l, m) => -l + M.owner_draw[m]! + M.owner_final[m]! + SIK * ShopRev * atDist[m]!);
  M.investor_cum = cum(M.investor_flow);
  M.dev_partner_flow = M.investor_flow.map((f, m) => f + M.dev_fee[m]!);

  // §9 KPIs
  const pf = M.project_flow;
  const r = (1 + g.DiscRate) ** (1 / 12) - 1;
  const project_npv = npvAt(pf, r);
  const pbIdx = M.investor_cum.findIndex(v => v > 0);
  const excl = pf.map((v, m) => v + M.land[m]! + M.rett[m]!);
  const maxLand: Record<string, number> = {};
  for (const tgt of MAX_LAND_TARGETS) {
    const rr = (1 + tgt) ** (1 / 12) - 1;
    maxLand[`max_land_irr_${Math.round(tgt * 100)}`] = npvAt(excl, rr) / (1 + g.RETTPct / (1 + rr));
  }
  const dev_partner_net = DevFeeC + InvFinal - InvE;
  const finance_cost = g.FinRate / 12 * sum(M.investor_outstanding);

  // §10 owner-share sensitivity
  const sens: OwnerShareRow[] = OWNER_SHARES.map(s => {
    const of = ownerFinal(s);
    const our_final = PotP - of;
    const flow = M.investor_contrib.map((c, m) => -c + M.dev_fee[m]! + our_final * atDist[m]!);
    return {
      share: s, our_final, our_net: our_final + DevFeeC - InvE, our_irr: irrAnnual(flow),
      our_multiple: div(our_final + DevFeeC, InvE), owner_gain: of + OwnDraw + SIK * ShopRev - LandValue,
    };
  });

  // §12 alternatives
  const dm_fee = g.DMFeePct * (DevCost - RETTC - DevFeeC);
  const noi = ResSell * g.RentRes * g.Occ * (1 - g.OpexPct) + (ShopSell * g.RentShop + MezzSell * g.RentMezz) * 0.95 * 0.9;
  const rentCost = TotCost - MktC;
  const rent_value = div(noi, g.CapRate);
  const landMv = g.LandArea * g.LandMkt;

  return {
    MezzGFA, ResGFA, ShopSell, MezzSell, ResSell, SellTot, BaseGFA, GPGFA, Parking, FloorPlate, Units,
    PriceRes, PriceShop, CostFactor, IncShopVal, RevRes, RevShop, RevMezz, RevTot,
    SubItems, Prelims, OHP, HardBase, HardPerM2, HardRaw, Hard, hard_by_group,
    DesignC, PermitC, ContC, MktC, RETTC, DevFeeC, DevCost, TotCost, Profit, Margin,
    MarginOnRevenue: div(Profit, RevTot), CostPerSellable: div(TotCost, SellTot), ConM, DistM,
    LandCash, InvE, OwnDraw, PotP, OwnRem, PoolProfit, OwnShare, OwnerFinal, InvFinal,
    project_irr: irrAnnual(pf), project_npv, investor_irr: irrAnnual(M.investor_flow),
    equity_multiple: InvE ? InvFinal / InvE : 0,
    owner_multiple: div(OwnDraw + OwnerFinal + SIK * ShopRev, LandValue),
    payback_month: pbIdx === -1 ? null : pbIdx,
    breakeven_res_price: div((TotCost - MktC) / (1 - g.MktPct) - ShopRev, ResSell),
    breakeven_sales_pct: div(TotCost, RevTot),
    max_land_margin: (RevTot - (1 + g.TgtMargin) * (DevCost - RETTC)) / ((1 + g.TgtMargin) * (1 + g.RETTPct)),
    max_land_irr_12: maxLand.max_land_irr_12!, max_land_irr_15: maxLand.max_land_irr_15!,
    max_land_irr_18: maxLand.max_land_irr_18!, max_land_irr_20: maxLand.max_land_irr_20!,
    dev_fee: DevFeeC, dev_partner_net, dev_partner_irr: irrAnnual(M.dev_partner_flow), finance_cost,
    dev_partner_net_after_fin: dev_partner_net - finance_cost,
    owner_share_sensitivity: sens,
    alternatives: {
      dm_fee, dm_owner_profit: Profit + DevFeeC - dm_fee, rent_noi: noi, rent_yield_on_cost: div(noi, rentCost),
      rent_value, rent_value_added: rent_value === null ? null : rent_value - rentCost,
      land_market_value: landMv, land_our_commission: landMv * g.BrokerPct, land_owner_vs_ask: landMv - LandValue,
    },
    monthly: M,
  };
}
