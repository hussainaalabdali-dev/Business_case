"""Reference implementation of ENGINE_SPEC.md (pure Python, no dependencies).

Validated against fixtures/*.json. Run:  python reference/engine_reference.py
This is a correctness reference, not production code. The production engine
(backend/engine) should be structured properly but must produce identical numbers.
"""
import json, math, glob, os

NM = 70
SCEN_KEYS = {1: "conservative", 2: "base", 3: "optimistic"}


def _irr(flows, guess=0.01):
    """Monthly IRR. Scans for sign changes in (-0.99, 1.0] and returns the root closest to `guess`
    (mirrors Excel IRR(…, 0.01) behaviour for these cash-flow shapes). None if no root."""
    if not (any(f > 0 for f in flows) and any(f < 0 for f in flows)):
        return None
    def npv(r):
        return sum(f / (1 + r) ** i for i, f in enumerate(flows))
    grid = [-0.99 + i * 0.0025 for i in range(int(1.99 / 0.0025) + 1)]
    roots = []
    prev_r, prev_v = grid[0], npv(grid[0])
    for r in grid[1:]:
        v = npv(r)
        if prev_v == 0:
            roots.append(prev_r)
        elif prev_v * v < 0:
            lo, hi, flo = prev_r, r, prev_v
            for _ in range(200):
                mid = (lo + hi) / 2
                fm = npv(mid)
                if flo * fm <= 0:
                    hi = mid
                else:
                    lo, flo = mid, fm
            roots.append((lo + hi) / 2)
        prev_r, prev_v = r, v
    return min(roots, key=lambda x: abs(x - guess)) if roots else None


def _ann(r):
    return None if r is None else (1 + r) ** 12 - 1


def run(inp):
    g = dict(inp)
    S = SCEN_KEYS[int(g["Scen"])]
    sv = lambda n: g[n][S] if isinstance(g[n], dict) else g[n]
    PriceRes = sv("PriceRes") * (1 + g["RevShock"])
    PriceShop = sv("PriceShop") * (1 + g["RevShock"])
    CostFactor = sv("CostFactor") * (1 + g["CostShock"])
    MezzUplift, VATNR, RentInc, Absorb, IncCap = (sv(n) for n in ("MezzUplift", "VATNR", "RentInc", "Absorb", "IncCap"))

    # areas
    ShopGFA, FAR, LandArea = g["ShopGFA"], g["FAR"], g["LandArea"]
    MezzGFA = ShopGFA * g["MezzPct"]
    ResGFA = FAR - ShopGFA - MezzGFA
    ShopSell, MezzSell, ResSell = ShopGFA * g["EffShop"], MezzGFA * g["EffMezz"], ResGFA * g["EffRes"]
    SellTot = ShopSell + MezzSell + ResSell
    BaseGFA = LandArea * g["BasePct"]
    GPGFA = max(0.0, LandArea * g["Coverage"] - ShopGFA)
    Units = ResSell / g["AvgUnit"]

    # revenue
    IncShopVal = (ShopGFA + g["RentBasis"] * MezzGFA) * RentInc * (1 - g["IncVac"]) / IncCap * (1 - g["IncDisc"]) * (1 + g["RevShock"])
    if g["ShopValMode"] == 1:
        RevShop = IncShopVal * ShopGFA / (ShopGFA + MezzGFA)
        RevMezz = IncShopVal * MezzGFA / (ShopGFA + MezzGFA)
    else:
        RevShop = ShopSell * PriceShop
        RevMezz = RevShop * MezzUplift * g["MezzPct"]
    RevRes = ResSell * PriceRes
    RevTot = RevRes + RevShop + RevMezz

    # BOQ
    env = dict(BaseGFA=BaseGFA, ExcDepth=g["ExcDepth"], BasePerim=g["BasePerim"], RaftT=g["RaftT"], FAR=FAR, GPGFA=GPGFA,
               FacadeA=g["FacadeA"], GlassPct=g["GlassPct"], LandArea=LandArea, Coverage=g["Coverage"], ResGFA=ResGFA,
               Units=Units, ShopGFA=ShopGFA, MezzGFA=MezzGFA, ExtWorks=g["ExtWorks"])
    groups = {}
    sub = 0.0
    for it in g["_boq"]:
        q = it["qty_formula"]
        q = eval(q[1:], {}, env) if isinstance(q, str) and q.startswith("=") else float(q)
        rate = it["rate"]
        rate = eval(rate[1:], {}, env) if isinstance(rate, str) and rate.startswith("=") else float(rate)
        amt = q * rate
        sub += amt
        groups[it["code"][0]] = groups.get(it["code"][0], 0) + amt
    pre = sub * g["PrelimPct"]
    ohp = (sub + pre) * g["OHPPct"]
    HardBase = sub + pre + ohp
    HardPerM2 = FAR * g["RateAbove"] + BaseGFA * g["RateBase"] + GPGFA * g["RateGP"] + g["ExtWorks"]
    HardRaw = HardPerM2 if g["CostMode"] == 1 else HardBase
    Hard = HardRaw * CostFactor * (1 + VATNR)

    DelayM = g["DelayM"]
    DesignC = Hard * g["DesignPct"]
    PermitC = Hard * g["PermitPct"]
    ContC = Hard * g["ContPct"] + Hard * g["DelayCostPct"] * DelayM
    SIK = g["ShopsInKind"]
    MktC = (RevTot - SIK * (RevShop + RevMezz)) * g["MktPct"]
    LandValue = g["LandValue"]
    RETTC = LandValue * g["RETTPct"]
    DevFeeC = (Hard + DesignC + PermitC + ContC) * g["DevFeePct"]
    DevCost = Hard + DesignC + PermitC + ContC + MktC + RETTC + DevFeeC
    TotCost = DevCost + LandValue
    Profit = RevTot - TotCost
    Margin = Profit / TotCost

    PreM, ConM = g["PreM"], g["ConBase"] + DelayM
    Launch, ShopAbs, DownPct = g["Launch"], g["ShopAbs"], g["DownPct"]
    DistM = max(PreM + ConM, Launch + Absorb - 1) + 1
    LandCash = LandValue - SIK * (RevShop + RevMezz)
    ExtW = g["ExtWorks"]

    M = {k: [0.0] * NM for k in ("progress_cum", "progress_month", "contract_value_cum", "collections_month", "land", "rett", "hard",
                                 "design", "permits", "contingency", "marketing", "dev_fee", "cash_costs", "escrow_eligible",
                                 "escrow_release", "escrow_after", "company_net", "project_flow", "balance_before", "owner_draw",
                                 "owner_draw_cum", "investor_contrib", "balance_after", "investor_outstanding")}
    prev_pc = prev_cv = prev_cc = prev_esc = prev_bal = prev_odc = 0.0
    inv_cum = 0.0
    for m in range(NM):
        if m <= PreM:
            pc = 0.0
        elif m >= PreM + ConM:
            pc = 1.0
        else:
            t = (m - PreM) / ConM
            pc = t - math.sin(2 * math.pi * t) / (2 * math.pi)
        pm = pc - prev_pc
        res = 0.0 if m < Launch else min(1.0, (m - Launch + 1) / Absorb)
        shp = 0.0 if m < Launch else min(1.0, (m - Launch + 1) / ShopAbs)
        cv = RevRes * res + (RevShop + RevMezz) * (1 - SIK) * shp
        cc = cv * (DownPct + (1 - DownPct) * pc)
        coll = cc - prev_cc
        land = LandValue if m == 0 else 0.0
        rett = RETTC if m == 1 else 0.0
        hard = (Hard - ExtW) * pm + (ExtW if m == PreM + ConM else 0.0)
        design = (DesignC * 0.5 / PreM if 1 <= m <= PreM else 0.0) + DesignC * 0.5 * pm
        permits = PermitC / PreM if 1 <= m <= PreM else 0.0
        cont = ContC * pm
        mkt = g["MktPct"] * (cv - prev_cv)
        fee = DevFeeC * pm
        costs = rett + hard + design + permits + cont + mkt + fee
        elig = hard + cont + DesignC * 0.5 * pm
        esc_b = prev_esc + coll
        rel = esc_b if (g["Escrow"] == 0 or m >= PreM + ConM) else min(esc_b, elig)
        esc_a = esc_b - rel
        cnet = rel - costs
        pflow = coll - costs - land + (SIK * (RevShop + RevMezz) if m == DistM else 0.0)
        bb = prev_bal + cnet
        od = min(LandCash - prev_odc, max(0.0, bb)) if g["EarlyRec"] == 1 else 0.0
        odc = prev_odc + od
        ic = max(0.0, -(bb - od))
        ba = bb - od + ic
        inv_cum += ic
        for k, v in (("progress_cum", pc), ("progress_month", pm), ("contract_value_cum", cv), ("collections_month", coll),
                     ("land", land), ("rett", rett), ("hard", hard), ("design", design), ("permits", permits),
                     ("contingency", cont), ("marketing", mkt), ("dev_fee", fee), ("cash_costs", costs),
                     ("escrow_eligible", elig), ("escrow_release", rel), ("escrow_after", esc_a), ("company_net", cnet),
                     ("project_flow", pflow), ("balance_before", bb), ("owner_draw", od), ("owner_draw_cum", odc),
                     ("investor_contrib", ic), ("balance_after", ba),
                     ("investor_outstanding", inv_cum if m < DistM else 0.0)):
            M[k][m] = v
        prev_pc, prev_cv, prev_cc, prev_esc, prev_bal, prev_odc = pc, cv, cc, esc_a, ba, odc

    InvE = sum(M["investor_contrib"])
    OwnDraw = sum(M["owner_draw"])
    PotP = M["balance_after"][DistM]
    OwnRem = LandCash - OwnDraw
    PoolProfit = PotP + OwnDraw - LandCash - InvE
    OwnShare = LandValue / (LandValue + DevCost) if g["ShareMode"] == 1 else g["OwnShareFix"]

    def owner_final(s):
        return min(PotP, OwnRem) + max(0.0, PoolProfit) * s if g["EarlyRec"] == 1 else LandCash + PoolProfit * s

    OwnerFinal = owner_final(OwnShare)
    InvFinal = PotP - OwnerFinal
    inv_flow = [-M["investor_contrib"][m] + (InvFinal if m == DistM else 0.0) for m in range(NM)]
    dev_flow = [inv_flow[m] + M["dev_fee"][m] for m in range(NM)]
    inv_cum_flow, run_ = [], 0.0
    for f in inv_flow:
        run_ += f
        inv_cum_flow.append(run_)
    payback = next((m for m, v in enumerate(inv_cum_flow) if v > 0), None)
    r = (1 + g["DiscRate"]) ** (1 / 12) - 1
    pf = M["project_flow"]
    npv = pf[0] + sum(pf[m] / (1 + r) ** m for m in range(1, NM))
    out = dict(RevRes=RevRes, RevShop=RevShop, RevMezz=RevMezz, RevTot=RevTot, ResGFA=ResGFA, ResSell=ResSell, BaseGFA=BaseGFA,
               GPGFA=GPGFA, HardBase=HardBase, HardRaw=HardRaw, Hard=Hard, DesignC=DesignC, PermitC=PermitC, ContC=ContC,
               MktC=MktC, RETTC=RETTC, DevFeeC=DevFeeC, DevCost=DevCost, TotCost=TotCost, Profit=Profit, Margin=Margin,
               DistM=DistM, ConM=ConM, InvE=InvE, OwnDraw=OwnDraw, PotP=PotP, OwnRem=OwnRem, PoolProfit=PoolProfit,
               OwnShare=OwnShare, OwnerFinal=OwnerFinal, InvFinal=InvFinal, LandCash=LandCash, IncShopVal=IncShopVal,
               CostFactor=CostFactor, PriceRes=PriceRes, PriceShop=PriceShop, Units=Units,
               project_irr=_ann(_irr(pf)), project_npv=npv, investor_irr=_ann(_irr(inv_flow)),
               equity_multiple=InvFinal / InvE if InvE else 0.0,
               owner_multiple=(OwnDraw + OwnerFinal + SIK * (RevShop + RevMezz)) / LandValue,
               payback_month=payback,
               breakeven_res_price=((TotCost - MktC) / (1 - g["MktPct"]) - RevShop - RevMezz) / ResSell,
               breakeven_sales_pct=TotCost / RevTot,
               max_land_margin=(RevTot - (1 + g["TgtMargin"]) * (DevCost - RETTC)) / ((1 + g["TgtMargin"]) * (1 + g["RETTPct"])),
               dev_fee=DevFeeC, dev_partner_net=DevFeeC + InvFinal - InvE, dev_partner_irr=_ann(_irr(dev_flow)),
               finance_cost=g["FinRate"] / 12 * sum(M["investor_outstanding"]))
    out["dev_partner_net_after_fin"] = out["dev_partner_net"] - out["finance_cost"]
    excl = [pf[m] + M["land"][m] + M["rett"][m] for m in range(NM)]
    for t in (0.12, 0.15, 0.18, 0.20):
        rr = (1 + t) ** (1 / 12) - 1
        out[f"max_land_irr_{int(round(t * 100))}"] = sum(v / (1 + rr) ** i for i, v in enumerate(excl)) / (1 + g["RETTPct"] / (1 + rr))
    return out, M


def _close(a, b):
    if b in (None, "لا يسترد") or (isinstance(b, (int, float)) and b == -1 and (a is None)):
        return a is None or (isinstance(b, (int, float)) and b == -1)
    if a is None:
        return isinstance(b, (int, float)) and b == -1
    if isinstance(b, str):
        return str(a) == b
    return abs(a - b) <= max(1.0, abs(b) * 1e-4) if abs(b) > 10 else abs(a - b) <= 1e-4


if __name__ == "__main__":
    here = os.path.join(os.path.dirname(__file__), "..", "fixtures")
    bad = 0
    for f in sorted(glob.glob(os.path.join(here, "*.json"))):
        if f.endswith("base_monthly.json"):
            continue
        d = json.load(open(f, encoding="utf-8"))
        out, M = run(d["inputs"])
        fails = [(k, out.get(k), v) for k, v in d["expected"].items() if not _close(out.get(k), v)]
        bad += len(fails)
        print(os.path.basename(f), "OK" if not fails else f"FAIL {fails[:4]}")
    mb = json.load(open(os.path.join(here, "base_monthly.json"), encoding="utf-8"))
    out, M = run(json.load(open(os.path.join(here, "base.json"), encoding="utf-8"))["inputs"])
    mfail = [k for k in M if k in mb and any(abs(a - b) > max(1.0, abs(b) * 1e-6) for a, b in zip(M[k], mb[k]))]
    print("monthly:", "OK" if not mfail else f"FAIL {mfail}")
    raise SystemExit(1 if bad or mfail else 0)
