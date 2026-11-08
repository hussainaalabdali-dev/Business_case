/** Inputs and outputs — names follow ENGINE_SPEC §1 (canonical camel-case). */

export interface ScenarioValue {
  conservative: number;
  base: number;
  optimistic: number;
}
export type ScenInput = ScenarioValue | number;
export type Flag = 0 | 1;

export interface BoqItem {
  code: string;
  item: string;
  qty_formula: number | string;
  unit: string;
  rate: number | string;
}

export interface EngineInputs {
  ProjName?: string;
  Scen: 1 | 2 | 3;
  LandArea: number; LandValue: number; LandMkt: number; FAR: number; ShopGFA: number; MezzPct: number;
  ResFloors: number; BasePct: number; Coverage: number; ParkM2: number;
  EffRes: number; EffShop: number; EffMezz: number;
  PriceRes: ScenInput; PriceShop: ScenInput; MezzUplift: ScenInput; CostFactor: ScenInput; VATNR: ScenInput;
  RentInc: ScenInput; Absorb: ScenInput; IncCap: ScenInput;
  ExtWorks: number; DesignPct: number; PermitPct: number; ContPct: number; MktPct: number; RETTPct: number;
  PreM: number; ConBase: number; Launch: number; ShopAbs: number; DownPct: number;
  DiscRate: number; TgtMargin: number;
  EarlyRec: Flag; Escrow: Flag; ShareMode: Flag; OwnShareFix: number; DevFeePct: number; ShopsInKind: Flag;
  DMFeePct: number; BrokerPct: number;
  RentRes: number; Occ: number; OpexPct: number; RentShop: number; RentMezz: number; CapRate: number;
  ShopValMode: Flag; RentBasis: Flag; IncVac: number; IncDisc: number;
  RevShock: number; CostShock: number; DelayM: number; FinRate: number; DelayCostPct: number;
  CostMode: Flag; RateAbove: number; RateBase: number; RateGP: number;
  BasePerim: number; ExcDepth: number; RaftT: number; FacadeA: number; GlassPct: number; AvgUnit: number;
  PrelimPct: number; OHPPct: number;
  _boq: BoqItem[];
}

export interface OwnerShareRow {
  share: number; our_final: number; our_net: number; our_irr: number | null; our_multiple: number | null;
  owner_gain: number;
}

export interface Alternatives {
  dm_fee: number; dm_owner_profit: number; rent_noi: number; rent_yield_on_cost: number | null;
  rent_value: number | null; rent_value_added: number | null; land_market_value: number;
  land_our_commission: number; land_owner_vs_ask: number;
}

export const MONTHLY_KEYS = [
  "progress_cum", "progress_month", "res_contracted_cum", "shop_contracted_cum", "contract_value_cum",
  "collect_pct", "collections_cum", "collections_month", "land", "rett", "hard", "design", "permits",
  "contingency", "marketing", "dev_fee", "cash_costs", "escrow_eligible", "escrow_before", "escrow_release",
  "escrow_after", "company_net", "project_flow", "balance_before", "owner_draw", "owner_draw_cum",
  "investor_contrib", "balance_after", "investor_outstanding",
  "company_cum", "owner_final", "investor_final", "investor_flow", "owner_flow", "investor_cum", "dev_partner_flow",
] as const;
export type MonthlyKey = (typeof MONTHLY_KEYS)[number];

export interface EngineResult {
  MezzGFA: number; ResGFA: number; ShopSell: number; MezzSell: number; ResSell: number; SellTot: number;
  BaseGFA: number; GPGFA: number; Parking: number; FloorPlate: number; Units: number;
  PriceRes: number; PriceShop: number; CostFactor: number;
  IncShopVal: number; RevRes: number; RevShop: number; RevMezz: number; RevTot: number;
  SubItems: number; Prelims: number; OHP: number; HardBase: number; HardPerM2: number; HardRaw: number; Hard: number;
  hard_by_group: Record<string, number>;
  DesignC: number; PermitC: number; ContC: number; MktC: number; RETTC: number; DevFeeC: number;
  DevCost: number; TotCost: number; Profit: number; Margin: number;
  MarginOnRevenue: number | null; CostPerSellable: number | null;
  ConM: number; DistM: number;
  LandCash: number; InvE: number; OwnDraw: number; PotP: number; OwnRem: number; PoolProfit: number;
  OwnShare: number; OwnerFinal: number; InvFinal: number;
  project_irr: number | null; project_npv: number; investor_irr: number | null; equity_multiple: number;
  owner_multiple: number | null; payback_month: number | null;
  breakeven_res_price: number | null; breakeven_sales_pct: number | null; max_land_margin: number;
  max_land_irr_12: number; max_land_irr_15: number; max_land_irr_18: number; max_land_irr_20: number;
  dev_fee: number; dev_partner_net: number; dev_partner_irr: number | null; finance_cost: number;
  dev_partner_net_after_fin: number;
  owner_share_sensitivity: OwnerShareRow[];
  alternatives: Alternatives;
  monthly: Record<MonthlyKey, number[]>;
}
