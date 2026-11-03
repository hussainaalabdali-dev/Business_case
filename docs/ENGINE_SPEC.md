# ENGINE_SPEC — Development Feasibility Engine (v1)

Source of truth: `reference/feasibility_model.xlsx` (the Abhur South model). Every formula below is transcribed from that workbook. If this document and the workbook disagree, the workbook wins; open an issue and fix the doc.

Acceptance: the engine must reproduce every value in `fixtures/*.json` (`expected`) and the monthly arrays in `fixtures/base_monthly.json`. The tolerance is the larger of 1 SAR or 0.01% for amounts, and 0.0001 for ratios.

---

## 0. Conventions

- Currency: SAR. Areas: m². Rates are decimals (0.05 = 5%).
- **Periods:** monthly, `m = 0 … NM-1` with `NM = 70`. Month 0 is the land contribution month.
- **Horizon:** `NM` must exceed `DistM`. Keep 70 so the results match the fixtures. Trailing zero months do not change IRR or NPV.
- **Names:** camel-case names (`LandValue`, `Hard`, …) are the canonical variable names. Use them in code, API and tests.
- **Scenario inputs:** each scenario input has three values `{conservative, base, optimistic}`. `Scen ∈ {1,2,3}` selects the active value. In the fixtures they are stored as an object.
- **IRR:** compute monthly, then annualise as `(1+irr_m)^12 − 1`. If several roots exist, choose the one closest to `0.01` (see `_irr` in the reference). If no root exists, return `null`. A `-1` in a fixture means Excel found no IRR; treat it as `null`. In `rev_minus10` and `cost_plus20`, Excel failed to converge although a root exists. Those two fixtures store the true root instead, and their `notes` field says so.
- **Error values:** `payback_month` is the string `"لا يسترد"` in the fixtures when the investor never recovers. The API returns `null` for this case.

---

## 1. Inputs

`fixtures/base.json → inputs` lists every input with its Abhur value. The groups are:

| Group | Names |
|---|---|
| Project | `ProjName`, `LandArea`, `LandValue`, `LandMkt` (SAR/m² market value), `FAR` (GFA inside the FAR), `ShopGFA`, `MezzPct`, `ResFloors`, `BasePct`, `Coverage`, `ParkM2` |
| Efficiencies | `EffRes`, `EffShop`, `EffMezz` |
| Scenario (3 values) | `PriceRes`, `PriceShop`, `MezzUplift`, `CostFactor`, `VATNR`, `RentInc`, `Absorb`, `IncCap` |
| Other costs | `ExtWorks`, `DesignPct`, `PermitPct`, `ContPct`, `MktPct`, `RETTPct` |
| Timing | `PreM`, `ConBase`, `Launch`, `ShopAbs`, `DownPct` |
| Returns | `DiscRate`, `TgtMargin` |
| Deal | `EarlyRec` (0/1), `Escrow` (0/1), `ShareMode` (0/1), `OwnShareFix`, `DevFeePct`, `ShopsInKind` (0/1), `DMFeePct`, `BrokerPct` |
| Rent alternative | `RentRes`, `Occ`, `OpexPct`, `RentShop`, `RentMezz`, `CapRate` |
| Shop valuation | `ShopValMode` (0 = price per m², 1 = income), `RentBasis` (0 = ground only, 1 = ground + mezzanine), `IncVac`, `IncDisc` |
| Stress | `RevShock`, `CostShock`, `DelayM`, `FinRate`, `DelayCostPct` |
| Cost method | `CostMode` (0 = detailed BOQ, 1 = rate per m²), `RateAbove`, `RateBase`, `RateGP` |
| BOQ parameters | `BasePerim`, `ExcDepth`, `RaftT`, `FacadeA`, `GlassPct`, `AvgUnit`, `PrelimPct`, `OHPPct` |
| BOQ items | `_boq[]`: `code`, `item`, `qty_formula`, `unit`, `rate` |

### Active scenario values (shocks applied)
```
PriceRes   = PriceRes[Scen]  * (1 + RevShock)
PriceShop  = PriceShop[Scen] * (1 + RevShock)
CostFactor = CostFactor[Scen]* (1 + CostShock)
MezzUplift, VATNR, RentInc, Absorb, IncCap = value[Scen]   (no shock)
```

---

## 2. Areas

```
MezzGFA  = ShopGFA * MezzPct
ResGFA   = FAR - ShopGFA - MezzGFA
ShopSell = ShopGFA * EffShop
MezzSell = MezzGFA * EffMezz
ResSell  = ResGFA * EffRes
SellTot  = ShopSell + MezzSell + ResSell
BaseGFA  = LandArea * BasePct                         # basement parking (outside FAR)
GPGFA    = max(0, LandArea * Coverage - ShopGFA)      # ground parking behind shops
Parking  = (BaseGFA + GPGFA) / ParkM2                 # display only
FloorPlate = ResGFA / (ResFloors + 0.5)               # display only (annex = half floor)
Units    = ResSell / AvgUnit
```

## 3. Revenue

```
IncShopVal = (ShopGFA + RentBasis*MezzGFA) * RentInc * (1-IncVac) / IncCap * (1-IncDisc) * (1+RevShock)

if ShopValMode == 1:
    RevShop = IncShopVal * ShopGFA / (ShopGFA + MezzGFA)
    RevMezz = IncShopVal * MezzGFA / (ShopGFA + MezzGFA)
else:
    RevShop = ShopSell * PriceShop
    RevMezz = RevShop * MezzUplift * MezzPct

RevRes = ResSell * PriceRes
RevTot = RevRes + RevShop + RevMezz
```
The shop and its mezzanine are one unit, sold together. The split above is for display only.

## 4. Construction cost

### 4.1 Detailed BOQ (CostMode = 0)
Each `_boq` item: `amount = qty * rate`. The quantity formulas reference the variables above. They are, in order:

| Code | Quantity |
|---|---|
| أ1 Excavation | `BaseGFA*ExcDepth` |
| أ2 Shoring | `BasePerim*(ExcDepth+0.5)` |
| أ3 Dewatering | `1` (lump sum) |
| أ4 Raft | `BaseGFA*RaftT` |
| أ5 Basement walls | `BasePerim*ExcDepth*0.4` |
| أ6 Waterproofing | `BaseGFA+BasePerim*ExcDepth` |
| ب1 Structure | `FAR+GPGFA` |
| ج1 Blockwork | `FAR*1.2` |
| ج2 Glass facade | `FacadeA*GlassPct` |
| ج3 Cladding | `FacadeA*(1-GlassPct)` |
| ج4 Windows | `FacadeA*(1-GlassPct)*0.15` |
| ج5 Roof insulation | `LandArea*Coverage` |
| د1 Flooring | `ResGFA` |
| د2 Plaster & paint | `ResGFA*3` |
| د3 Gypsum ceilings | `ResGFA` |
| د4 Doors | `ResGFA/15` |
| د5 Kitchens | `Units` |
| د6 Bathrooms | `Units*3` |
| د7 Shops shell | `ShopGFA+MezzGFA` |
| د8 Parking finishes | `BaseGFA+GPGFA` |
| هـ1 HVAC (tons) | `ResGFA/25+(ShopGFA+MezzGFA)/20` |
| هـ2 Basement ventilation | `BaseGFA` |
| هـ3 Electrical | `FAR` |
| هـ4 Parking electrical | `BaseGFA+GPGFA` |
| هـ5 Substation | `1` |
| هـ6 Plumbing | `FAR` |
| هـ7 Fire fighting | `FAR+BaseGFA+GPGFA` |
| و1 Passenger lifts | `3` |
| و2 Service lift | `1` |
| ز2 External works | `1` × rate `ExtWorks` |

```
SubItems  = Σ amounts
Prelims   = SubItems * PrelimPct
OHP       = (SubItems + Prelims) * OHPPct
HardBase  = SubItems + Prelims + OHP
Groups: Grp0 = أ, Grp1 = ب, Grp2 = ج, Grp3 = د, Grp4 = هـ, Grp5 = و, Grp6 = ز   (sums of item amounts)
```

### 4.2 Rate per m² (CostMode = 1)
```
HardPerM2 = FAR*RateAbove + BaseGFA*RateBase + GPGFA*RateGP + ExtWorks
```

### 4.3 Adopted hard cost
```
HardRaw = HardPerM2 if CostMode == 1 else HardBase
Hard    = HardRaw * CostFactor * (1 + VATNR)
```
For display, the hard cost splits by BOQ group shares: `HardRaw*CostFactor*(Grp_i/SubItems)*(1+VATNR)`. Per-m² mode uses the same shares.

## 5. Development cost and profit
```
DesignC = Hard * DesignPct
PermitC = Hard * PermitPct
ContC   = Hard * ContPct + Hard * DelayCostPct * DelayM
MktC    = (RevTot - ShopsInKind*(RevShop+RevMezz)) * MktPct
RETTC   = LandValue * RETTPct
DevFeeC = (Hard + DesignC + PermitC + ContC) * DevFeePct
DevCost = Hard + DesignC + PermitC + ContC + MktC + RETTC + DevFeeC
TotCost = DevCost + LandValue
Profit  = RevTot - TotCost
Margin  = Profit / TotCost          # on cost
MarginOnRevenue = Profit / RevTot
CostPerSellable = TotCost / SellTot
```

## 6. Timeline
```
ConM  = ConBase + DelayM
DistM = max(PreM + ConM, Launch + Absorb - 1) + 1
```

## 7. Monthly cash flow (m = 0 … NM-1)
`prev(x)` means the previous month's value, which is 0 at m = 0.

| # | Name | Formula |
|---|---|---|
| 4 | `progress_cum` | `0 if m<=PreM; 1 if m>=PreM+ConM; else t - sin(2πt)/(2π)` with `t=(m-PreM)/ConM` (S-curve) |
| 5 | `progress_month` | `progress_cum - prev(progress_cum)` |
| 6 | `res_contracted_cum` | `0 if m<Launch else min(1,(m-Launch+1)/Absorb)` |
| 7 | `shop_contracted_cum` | `0 if m<Launch else min(1,(m-Launch+1)/ShopAbs)` |
| 8 | `contract_value_cum` | `RevRes*res + (RevShop+RevMezz)*(1-ShopsInKind)*shop` |
| 9 | `collect_pct` | `DownPct + (1-DownPct)*progress_cum` |
| 10 | `collections_cum` | `contract_value_cum * collect_pct` |
| 11 | `collections_month` | `collections_cum - prev` |
| 13 | `land` | `LandValue if m==0 else 0` (in-kind) |
| 14 | `rett` | `RETTC if m==1 else 0` |
| 15 | `hard` | `(Hard-ExtWorks)*progress_month + (ExtWorks if m==PreM+ConM)` |
| 16 | `design` | `(DesignC*0.5/PreM if 1<=m<=PreM) + DesignC*0.5*progress_month` |
| 17 | `permits` | `PermitC/PreM if 1<=m<=PreM else 0` |
| 18 | `contingency` | `ContC*progress_month` |
| 19 | `marketing` | `MktPct*(contract_value_cum - prev)` |
| 44 | `dev_fee` | `DevFeeC*progress_month` |
| 20 | `cash_costs` | `rett+hard+design+permits+contingency+marketing+dev_fee` |
| 21 | `escrow_eligible` | `hard + contingency + DesignC*0.5*progress_month` |
| 23 | `escrow_before` | `prev(escrow_after) + collections_month` |
| 24 | `escrow_release` | `escrow_before if Escrow==0 or m>=PreM+ConM else min(escrow_before, escrow_eligible)` |
| 25 | `escrow_after` | `escrow_before - escrow_release` |
| 27 | `company_net` | `escrow_release - cash_costs` |
| 28 | `project_flow` | `collections_month - cash_costs - land + (ShopsInKind*(RevShop+RevMezz) if m==DistM)` |
| 29 | `company_cum` | running sum of `company_net` |
| 31 | `balance_before` | `prev(balance_after) + company_net` |
| 32 | `owner_draw` | `EarlyRec==1 ? min(LandCash - prev(owner_draw_cum), max(0, balance_before)) : 0` |
| 33 | `owner_draw_cum` | running sum |
| 34 | `investor_contrib` | `max(0, -(balance_before - owner_draw))` |
| 35 | `balance_after` | `balance_before - owner_draw + investor_contrib` |
| 37 | `owner_final` | `OwnerFinal if m==DistM` |
| 38 | `investor_final` | `InvFinal if m==DistM` |
| 40 | `investor_flow` | `-investor_contrib + investor_final` |
| 41 | `owner_flow` | `-land + owner_draw + owner_final + (ShopsInKind*(RevShop+RevMezz) if m==DistM)` |
| 42 | `investor_cum` | running sum |
| 45 | `dev_partner_flow` | `investor_flow + dev_fee` |
| 53 | `investor_outstanding` | `sum(investor_contrib[0..m]) if m<DistM else 0` |

`dev_fee` is part of `cash_costs` and also income to the developer partner, who is the investor in v1.

## 8. Distribution waterfall
```
LandCash   = LandValue - ShopsInKind*(RevShop+RevMezz)
InvE       = Σ investor_contrib
OwnDraw    = Σ owner_draw
PotP       = balance_after[DistM]
OwnRem     = LandCash - OwnDraw
PoolProfit = PotP + OwnDraw - LandCash - InvE
OwnShare   = ShareMode==1 ? LandValue/(LandValue+DevCost) : OwnShareFix
InvShare   = 1 - OwnShare
OwnerFinal = EarlyRec==1 ? min(PotP, OwnRem) + max(0,PoolProfit)*OwnShare
                         : LandCash + PoolProfit*OwnShare
InvFinal   = PotP - OwnerFinal
```
With early recovery, the owner is paid first and losses fall on the investors.

## 9. KPIs (fixture key → formula)
| Key | Formula |
|---|---|
| `project_irr` | annualised IRR of `project_flow` |
| `project_npv` | `project_flow[0] + Σ_{m≥1} project_flow[m]/(1+r)^m` with `r=(1+DiscRate)^(1/12)-1` |
| `investor_irr` | annualised IRR of `investor_flow` |
| `equity_multiple` | `InvFinal/InvE` (0 if InvE = 0) |
| `owner_multiple` | `(OwnDraw+OwnerFinal+ShopsInKind*(RevShop+RevMezz))/LandValue` |
| `payback_month` | first `m` where `investor_cum[m] > 0`; else null |
| `breakeven_res_price` | `((TotCost-MktC)/(1-MktPct) - RevShop - RevMezz)/ResSell` |
| `breakeven_sales_pct` | `TotCost/RevTot` |
| `max_land_margin` | `(RevTot-(1+TgtMargin)*(DevCost-RETTC))/((1+TgtMargin)*(1+RETTPct))` |
| `max_land_irr_{12,15,18,20}` | see below |
| `dev_fee` | `DevFeeC` |
| `dev_partner_net` | `DevFeeC + InvFinal - InvE` |
| `dev_partner_irr` | annualised IRR of `dev_partner_flow` |
| `finance_cost` | `FinRate/12 * Σ investor_outstanding` |
| `dev_partner_net_after_fin` | `dev_partner_net - finance_cost` |

**Maximum land price at a target project IRR `t`:**
```
r    = (1+t)^(1/12) - 1
excl = project_flow + land + rett            # add back land (m0) and RETT (m1)
NPVx = Σ excl[m]/(1+r)^m
L    = NPVx / (1 + RETTPct/(1+r))
```

## 10. Owner-share sensitivity (deal structure)
For each share `s` in `[0.3, 0.4, 0.5, 0.6, 0.7]`, replace `OwnShare` with `s` in OwnerFinal. Then compute:
- `our_final = PotP - OwnerFinal(s)`
- `our_net = our_final + DevFeeC - InvE`
- `our_irr = IRR(-investor_contrib + dev_fee + (PotP - OwnerFinal(s) at DistM))`
- `our_multiple = (our_final + DevFeeC)/InvE`
- `owner_gain = OwnerFinal(s) + OwnDraw + ShopsInKind*(RevShop+RevMezz) - LandValue`

## 11. Sensitivity and stress (v1 = full re-runs)
The Excel uses closed-form approximations. The website must re-run the full engine for every cell:
- **Grid A:** profit for `PriceRes(base) ∈ {11500,12500,13000,14000,15000,16000}` × `CostFactor ∈ {0.9,1.0,1.1,1.2,1.3}`.
- **Grid B:** margin for `LandValue ∈ user list (default ±25% around input)` × `PriceRes`.
- **Stress set:**
  - `RevShock ∈ {-0.1,-0.2,-0.3}`
  - `CostShock ∈ {0.1,0.2,0.3}`
  - `DelayM ∈ {6,12,18}`
  - `FinRate ∈ {0.07,0.09,0.11}`
  - combined `{-0.1, +0.1, 6}`
  - scenarios 1 and 3
  - `EarlyRec=0` variants

  Report Profit, Margin, project_irr, project_npv, InvE, dev_partner_net_after_fin, dev_partner_irr and owner_multiple for each.

Note: Excel grids hold `LandValue` fixed. Small differences between the closed-form grid and full re-runs are expected and accepted; full re-run is the correct one.

## 12. Alternatives (HBU)
- **Develop for the owner for a fee:**
  - `fee = DMFeePct*(DevCost-RETTC-DevFeeC)`
  - `owner_profit = Profit + DevFeeC - fee`
  - Our capital = 0.
- **Develop and rent:**
  - `NOI = ResSell*RentRes*Occ*(1-OpexPct) + (ShopSell*RentShop + MezzSell*RentMezz)*0.95*0.9`
  - `yield_on_cost = NOI/(TotCost-MktC)`
  - `value = NOI/CapRate`
  - `value_added = value-(TotCost-MktC)`
- **Sell or market the land as is:**
  - `market_value = LandArea*LandMkt`
  - `our_commission = market_value*BrokerPct`
  - `owner_vs_ask = market_value - LandValue`
- **Partnership + shops in kind:** re-run with `ShopsInKind=1`.

## 13. Decision conditions
Each condition has a user-editable threshold. The defaults are:

| Condition | Default threshold |
|---|---|
| Licence issued (user input 0/1) | ≥ 1 |
| `PriceRes ≥ threshold` | 14,500 |
| `LandValue ≤ threshold` | `round(LandMkt*LandArea, -6)` |
| `EarlyRec == 0` | 0 |
| `Hard ≤ threshold` | 70,000,000 |
| `VATNR ≤ threshold` | 0 |
| `Margin ≥ TgtMargin` | `TgtMargin` |

Decision:
- **GO:** all conditions are met.
- **CONDITIONAL GO:** the licence and margin conditions are met.
- **HOLD:** the licence is 0.
- **RENEGOTIATE:** any other case.

Quick verdict on margin:
- **GO:** `Margin ≥ TgtMargin`.
- **CONDITIONAL GO:** `Margin ≥ 0.10`.
- **RENEGOTIATE:** `Margin ≥ 0`.
- **NO GO:** `Margin < 0`.

## 14. Fixtures index
| File | Override vs base |
|---|---|
| `base.json` | — (Abhur South, 60M land) |
| `conservative.json` / `optimistic.json` | `Scen` 1 / 3 |
| `land52_no_early.json` | `LandValue=52M`, `EarlyRec=0` |
| `rev_minus10.json` / `cost_plus20.json` / `delay12.json` / `finance9.json` | shocks |
| `shops_in_kind.json` | `ShopsInKind=1` |
| `share_fixed50.json` | `ShareMode=0` (50%) |
| `cost_per_m2_mode.json` | `CostMode=1` |
| `no_escrow.json` | `Escrow=0` |
| `shop_price_mode.json` | `ShopValMode=0` |
| `base_monthly.json` | all monthly arrays for `base` (70 months) |

Base sanity values:
| Metric | Value |
|---|---|
| RevTot | 155,556,200 |
| Hard | 70,821,766 |
| DevCost | 92,474,492 |
| Profit | 3,081,708 |
| Margin | 2.02% |
| project_irr | 2.04% |
| dev_partner_irr | 19.65% |
| InvE | 14,755,736 |
| max_land_irr_18 | 42,477,059 |
| DistM | 36 |
