"""Full engine run: ENGINE_SPEC §1–§10 and §12."""

import math
from typing import Any

from .expr import FormulaError, evaluate
from .irr import irr_annual, npv_at
from .models import Alternatives, EngineInputs, EngineResult, OwnerShareRow

NM = 70  # §0 horizon
OWNER_SHARES = (0.3, 0.4, 0.5, 0.6, 0.7)  # §10
MAX_LAND_TARGETS = (0.12, 0.15, 0.18, 0.20)  # §9


def _div(a: float, b: float) -> float | None:
    return a / b if b else None


def _cum(xs: list[float]) -> list[float]:
    out, acc = [], 0.0
    for x in xs:
        acc += x
        out.append(acc)
    return out


def run(inp: EngineInputs | dict[str, Any]) -> EngineResult:
    g = inp if isinstance(inp, EngineInputs) else EngineInputs.model_validate(inp)

    # §1 active scenario values
    PriceRes = g.scen("PriceRes") * (1 + g.RevShock)
    PriceShop = g.scen("PriceShop") * (1 + g.RevShock)
    CostFactor = g.scen("CostFactor") * (1 + g.CostShock)
    MezzUplift, VATNR, RentInc, IncCap = (g.scen(n) for n in ("MezzUplift", "VATNR", "RentInc", "IncCap"))
    Absorb = g.scen("Absorb")

    # §2 areas
    MezzGFA = g.ShopGFA * g.MezzPct
    ResGFA = g.FAR - g.ShopGFA - MezzGFA
    ShopSell = g.ShopGFA * g.EffShop
    MezzSell = MezzGFA * g.EffMezz
    ResSell = ResGFA * g.EffRes
    SellTot = ShopSell + MezzSell + ResSell
    BaseGFA = g.LandArea * g.BasePct
    GPGFA = max(0.0, g.LandArea * g.Coverage - g.ShopGFA)
    Parking = (BaseGFA + GPGFA) / g.ParkM2
    FloorPlate = ResGFA / (g.ResFloors + 0.5)
    Units = ResSell / g.AvgUnit

    # §3 revenue
    ShopMezzGFA = g.ShopGFA + MezzGFA
    IncShopVal = (
        (g.ShopGFA + g.RentBasis * MezzGFA) * RentInc * (1 - g.IncVac) / IncCap * (1 - g.IncDisc) * (1 + g.RevShock)
    )
    if g.ShopValMode == 1:
        RevShop = IncShopVal * g.ShopGFA / ShopMezzGFA if ShopMezzGFA else 0.0
        RevMezz = IncShopVal * MezzGFA / ShopMezzGFA if ShopMezzGFA else 0.0
    else:
        RevShop = ShopSell * PriceShop
        RevMezz = RevShop * MezzUplift * g.MezzPct
    RevRes = ResSell * PriceRes
    RevTot = RevRes + RevShop + RevMezz
    ShopRev = RevShop + RevMezz
    SIK = g.ShopsInKind

    # §4.1 BOQ
    env = dict(
        BaseGFA=BaseGFA, ExcDepth=g.ExcDepth, BasePerim=g.BasePerim, RaftT=g.RaftT, FAR=g.FAR, GPGFA=GPGFA,
        FacadeA=g.FacadeA, GlassPct=g.GlassPct, LandArea=g.LandArea, Coverage=g.Coverage, ResGFA=ResGFA,
        Units=Units, ShopGFA=g.ShopGFA, MezzGFA=MezzGFA, ExtWorks=g.ExtWorks,
    )
    groups: dict[str, float] = {}
    SubItems = 0.0
    for it in g.boq:
        try:
            amt = evaluate(it.qty_formula, env) * evaluate(it.rate, env)
        except FormulaError as exc:
            raise FormulaError(f"BOQ item {it.code} ({it.item}): {exc}") from exc
        SubItems += amt
        key = it.code[0]  # group letter (أ ب ج د ه و ز)
        groups[key] = groups.get(key, 0.0) + amt
    Prelims = SubItems * g.PrelimPct
    OHP = (SubItems + Prelims) * g.OHPPct
    HardBase = SubItems + Prelims + OHP
    # §4.2
    HardPerM2 = g.FAR * g.RateAbove + BaseGFA * g.RateBase + GPGFA * g.RateGP + g.ExtWorks
    # §4.3
    HardRaw = HardPerM2 if g.CostMode == 1 else HardBase
    Hard = HardRaw * CostFactor * (1 + VATNR)
    hard_by_group = {k: HardRaw * CostFactor * (v / SubItems) * (1 + VATNR) if SubItems else 0.0 for k, v in groups.items()}

    # §5
    DesignC = Hard * g.DesignPct
    PermitC = Hard * g.PermitPct
    ContC = Hard * g.ContPct + Hard * g.DelayCostPct * g.DelayM
    MktC = (RevTot - SIK * ShopRev) * g.MktPct
    LandValue = g.LandValue
    RETTC = LandValue * g.RETTPct
    DevFeeC = (Hard + DesignC + PermitC + ContC) * g.DevFeePct
    DevCost = Hard + DesignC + PermitC + ContC + MktC + RETTC + DevFeeC
    TotCost = DevCost + LandValue
    Profit = RevTot - TotCost
    Margin = Profit / TotCost

    # §6
    PreM, ConM = g.PreM, g.ConBase + g.DelayM
    BuildEnd = PreM + ConM
    DistM = int(max(BuildEnd, g.Launch + Absorb - 1) + 1)
    if DistM >= NM:
        raise ValueError(f"DistM ({DistM}) must be below the {NM}-month horizon")
    LandCash = LandValue - SIK * ShopRev
    ExtW = g.ExtWorks

    # §7 monthly
    keys = (
        "progress_cum", "progress_month", "res_contracted_cum", "shop_contracted_cum", "contract_value_cum",
        "collect_pct", "collections_cum", "collections_month", "land", "rett", "hard", "design", "permits",
        "contingency", "marketing", "dev_fee", "cash_costs", "escrow_eligible", "escrow_before", "escrow_release",
        "escrow_after", "company_net", "project_flow", "balance_before", "owner_draw", "owner_draw_cum",
        "investor_contrib", "balance_after", "investor_outstanding",
    )
    M: dict[str, list[float]] = {k: [0.0] * NM for k in keys}
    prev_pc = prev_cv = prev_cc = prev_esc = prev_bal = prev_odc = 0.0
    inv_contrib_cum = 0.0
    for m in range(NM):
        if m <= PreM:
            pc = 0.0
        elif m >= BuildEnd:
            pc = 1.0
        else:
            t = (m - PreM) / ConM
            pc = t - math.sin(2 * math.pi * t) / (2 * math.pi)
        pm = pc - prev_pc
        res = 0.0 if m < g.Launch else min(1.0, (m - g.Launch + 1) / Absorb)
        shp = 0.0 if m < g.Launch else min(1.0, (m - g.Launch + 1) / g.ShopAbs)
        cv = RevRes * res + ShopRev * (1 - SIK) * shp
        cpct = g.DownPct + (1 - g.DownPct) * pc
        cc = cv * cpct
        coll = cc - prev_cc
        land = LandValue if m == 0 else 0.0
        rett = RETTC if m == 1 else 0.0
        hard = (Hard - ExtW) * pm + (ExtW if m == BuildEnd else 0.0)
        design = (DesignC * 0.5 / PreM if 1 <= m <= PreM else 0.0) + DesignC * 0.5 * pm
        permits = PermitC / PreM if 1 <= m <= PreM else 0.0
        cont = ContC * pm
        mkt = g.MktPct * (cv - prev_cv)
        fee = DevFeeC * pm
        costs = rett + hard + design + permits + cont + mkt + fee
        elig = hard + cont + DesignC * 0.5 * pm
        esc_b = prev_esc + coll
        rel = esc_b if (g.Escrow == 0 or m >= BuildEnd) else min(esc_b, elig)
        esc_a = esc_b - rel
        cnet = rel - costs
        pflow = coll - costs - land + (SIK * ShopRev if m == DistM else 0.0)
        bb = prev_bal + cnet
        od = min(LandCash - prev_odc, max(0.0, bb)) if g.EarlyRec == 1 else 0.0
        odc = prev_odc + od
        ic = max(0.0, -(bb - od))
        ba = bb - od + ic
        inv_contrib_cum += ic
        row = (
            pc, pm, res, shp, cv, cpct, cc, coll, land, rett, hard, design, permits, cont, mkt, fee, costs, elig,
            esc_b, rel, esc_a, cnet, pflow, bb, od, odc, ic, ba, inv_contrib_cum if m < DistM else 0.0,
        )
        for k, v in zip(keys, row, strict=True):
            M[k][m] = v
        prev_pc, prev_cv, prev_cc, prev_esc, prev_bal, prev_odc = pc, cv, cc, esc_a, ba, odc

    # §8 waterfall
    InvE = sum(M["investor_contrib"])
    OwnDraw = sum(M["owner_draw"])
    PotP = M["balance_after"][DistM]
    OwnRem = LandCash - OwnDraw
    PoolProfit = PotP + OwnDraw - LandCash - InvE
    OwnShare = LandValue / (LandValue + DevCost) if g.ShareMode == 1 else g.OwnShareFix

    def owner_final(s: float) -> float:
        if g.EarlyRec == 1:
            return min(PotP, OwnRem) + max(0.0, PoolProfit) * s
        return LandCash + PoolProfit * s

    OwnerFinal = owner_final(OwnShare)
    InvFinal = PotP - OwnerFinal

    at_dist = [1.0 if m == DistM else 0.0 for m in range(NM)]
    M["company_cum"] = _cum(M["company_net"])
    M["owner_final"] = [OwnerFinal * a for a in at_dist]
    M["investor_final"] = [InvFinal * a for a in at_dist]
    M["investor_flow"] = [-M["investor_contrib"][m] + M["investor_final"][m] for m in range(NM)]
    M["owner_flow"] = [
        -M["land"][m] + M["owner_draw"][m] + M["owner_final"][m] + SIK * ShopRev * at_dist[m] for m in range(NM)
    ]
    M["investor_cum"] = _cum(M["investor_flow"])
    M["dev_partner_flow"] = [M["investor_flow"][m] + M["dev_fee"][m] for m in range(NM)]

    # §9 KPIs
    pf = M["project_flow"]
    r = (1 + g.DiscRate) ** (1 / 12) - 1
    project_npv = npv_at(pf, r)
    payback = next((m for m, v in enumerate(M["investor_cum"]) if v > 0), None)
    excl = [pf[m] + M["land"][m] + M["rett"][m] for m in range(NM)]
    max_land: dict[str, float] = {}
    for tgt in MAX_LAND_TARGETS:
        rr = (1 + tgt) ** (1 / 12) - 1
        max_land[f"max_land_irr_{round(tgt * 100)}"] = npv_at(excl, rr) / (1 + g.RETTPct / (1 + rr))
    dev_partner_net = DevFeeC + InvFinal - InvE
    finance_cost = g.FinRate / 12 * sum(M["investor_outstanding"])

    # §10 owner-share sensitivity
    sens = []
    for s in OWNER_SHARES:
        of = owner_final(s)
        our_final = PotP - of
        flow = [-M["investor_contrib"][m] + M["dev_fee"][m] + our_final * at_dist[m] for m in range(NM)]
        sens.append(
            OwnerShareRow(
                share=s, our_final=our_final, our_net=our_final + DevFeeC - InvE, our_irr=irr_annual(flow),
                our_multiple=_div(our_final + DevFeeC, InvE), owner_gain=of + OwnDraw + SIK * ShopRev - LandValue,
            )
        )

    # §12 alternatives
    dm_fee = g.DMFeePct * (DevCost - RETTC - DevFeeC)
    noi = ResSell * g.RentRes * g.Occ * (1 - g.OpexPct) + (ShopSell * g.RentShop + MezzSell * g.RentMezz) * 0.95 * 0.9
    rent_cost = TotCost - MktC
    rent_value = _div(noi, g.CapRate)
    land_mv = g.LandArea * g.LandMkt
    alts = Alternatives(
        dm_fee=dm_fee, dm_owner_profit=Profit + DevFeeC - dm_fee, rent_noi=noi,
        rent_yield_on_cost=_div(noi, rent_cost), rent_value=rent_value,
        rent_value_added=None if rent_value is None else rent_value - rent_cost,
        land_market_value=land_mv, land_our_commission=land_mv * g.BrokerPct, land_owner_vs_ask=land_mv - LandValue,
    )

    return EngineResult(
        MezzGFA=MezzGFA, ResGFA=ResGFA, ShopSell=ShopSell, MezzSell=MezzSell, ResSell=ResSell, SellTot=SellTot,
        BaseGFA=BaseGFA, GPGFA=GPGFA, Parking=Parking, FloorPlate=FloorPlate, Units=Units,
        PriceRes=PriceRes, PriceShop=PriceShop, CostFactor=CostFactor,
        IncShopVal=IncShopVal, RevRes=RevRes, RevShop=RevShop, RevMezz=RevMezz, RevTot=RevTot,
        SubItems=SubItems, Prelims=Prelims, OHP=OHP, HardBase=HardBase, HardPerM2=HardPerM2, HardRaw=HardRaw,
        Hard=Hard, hard_by_group=hard_by_group,
        DesignC=DesignC, PermitC=PermitC, ContC=ContC, MktC=MktC, RETTC=RETTC, DevFeeC=DevFeeC, DevCost=DevCost,
        TotCost=TotCost, Profit=Profit, Margin=Margin, MarginOnRevenue=_div(Profit, RevTot),
        CostPerSellable=_div(TotCost, SellTot), ConM=ConM, DistM=DistM,
        LandCash=LandCash, InvE=InvE, OwnDraw=OwnDraw, PotP=PotP, OwnRem=OwnRem, PoolProfit=PoolProfit,
        OwnShare=OwnShare, OwnerFinal=OwnerFinal, InvFinal=InvFinal,
        project_irr=irr_annual(pf), project_npv=project_npv, investor_irr=irr_annual(M["investor_flow"]),
        equity_multiple=InvFinal / InvE if InvE else 0.0,
        owner_multiple=_div(OwnDraw + OwnerFinal + SIK * ShopRev, LandValue),
        payback_month=payback,
        breakeven_res_price=_div((TotCost - MktC) / (1 - g.MktPct) - ShopRev, ResSell),
        breakeven_sales_pct=_div(TotCost, RevTot),
        max_land_margin=(RevTot - (1 + g.TgtMargin) * (DevCost - RETTC)) / ((1 + g.TgtMargin) * (1 + g.RETTPct)),
        **max_land,
        dev_fee=DevFeeC, dev_partner_net=dev_partner_net, dev_partner_irr=irr_annual(M["dev_partner_flow"]),
        finance_cost=finance_cost, dev_partner_net_after_fin=dev_partner_net - finance_cost,
        owner_share_sensitivity=sens, alternatives=alts, monthly=M,
    )
