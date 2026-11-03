"""Typed inputs and outputs. Names follow ENGINE_SPEC §1 (canonical camel-case)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ScenarioValue(BaseModel):
    """One input with three scenario values (ENGINE_SPEC §0)."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    conservative: float
    base: float
    optimistic: float

    def pick(self, scen: int) -> float:
        return (self.conservative, self.base, self.optimistic)[scen - 1]


Num = float
Flag = Literal[0, 1]
ScenInput = ScenarioValue | float


class BoqItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    item: str
    qty_formula: float | str
    unit: str
    rate: float | str


class EngineInputs(BaseModel):
    """Every input of ENGINE_SPEC §1. Defaults are not provided on purpose (no invented numbers)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    ProjName: str = ""
    Scen: Literal[1, 2, 3]
    # Project
    LandArea: Num
    LandValue: Num
    LandMkt: Num
    FAR: Num
    ShopGFA: Num
    MezzPct: Num
    ResFloors: Num
    BasePct: Num
    Coverage: Num
    ParkM2: Num = Field(gt=0)
    # Efficiencies
    EffRes: Num
    EffShop: Num
    EffMezz: Num
    # Scenario inputs
    PriceRes: ScenInput
    PriceShop: ScenInput
    MezzUplift: ScenInput
    CostFactor: ScenInput
    VATNR: ScenInput
    RentInc: ScenInput
    Absorb: ScenInput
    IncCap: ScenInput
    # Other costs
    ExtWorks: Num
    DesignPct: Num
    PermitPct: Num
    ContPct: Num
    MktPct: Num
    RETTPct: Num
    # Timing (months)
    PreM: int = Field(ge=1)
    ConBase: int = Field(ge=1)
    Launch: int = Field(ge=0)
    ShopAbs: int = Field(ge=1)
    DownPct: Num
    # Returns
    DiscRate: Num
    TgtMargin: Num
    # Deal
    EarlyRec: Flag
    Escrow: Flag
    ShareMode: Flag
    OwnShareFix: Num
    DevFeePct: Num
    ShopsInKind: Flag
    DMFeePct: Num
    BrokerPct: Num
    # Rent alternative
    RentRes: Num
    Occ: Num
    OpexPct: Num
    RentShop: Num
    RentMezz: Num
    CapRate: Num
    # Shop valuation
    ShopValMode: Flag
    RentBasis: Flag
    IncVac: Num
    IncDisc: Num
    # Stress
    RevShock: Num
    CostShock: Num
    DelayM: int = Field(ge=0)
    FinRate: Num
    DelayCostPct: Num
    # Cost method
    CostMode: Flag
    RateAbove: Num
    RateBase: Num
    RateGP: Num
    # BOQ parameters
    BasePerim: Num
    ExcDepth: Num
    RaftT: Num
    FacadeA: Num
    GlassPct: Num
    AvgUnit: Num = Field(gt=0)
    PrelimPct: Num
    OHPPct: Num
    boq: list[BoqItem] = Field(alias="_boq")

    def scen(self, name: str) -> float:
        v = getattr(self, name)
        return v.pick(self.Scen) if isinstance(v, ScenarioValue) else float(v)


class OwnerShareRow(BaseModel):
    """ENGINE_SPEC §10."""

    share: float
    our_final: float
    our_net: float
    our_irr: float | None
    our_multiple: float | None
    owner_gain: float


class Alternatives(BaseModel):
    """ENGINE_SPEC §12."""

    dm_fee: float
    dm_owner_profit: float
    rent_noi: float
    rent_yield_on_cost: float | None
    rent_value: float | None
    rent_value_added: float | None
    land_market_value: float
    land_our_commission: float
    land_owner_vs_ask: float


class EngineResult(BaseModel):
    # §2 areas
    MezzGFA: float
    ResGFA: float
    ShopSell: float
    MezzSell: float
    ResSell: float
    SellTot: float
    BaseGFA: float
    GPGFA: float
    Parking: float
    FloorPlate: float
    Units: float
    # active values
    PriceRes: float
    PriceShop: float
    CostFactor: float
    # §3 revenue
    IncShopVal: float
    RevRes: float
    RevShop: float
    RevMezz: float
    RevTot: float
    # §4 cost
    SubItems: float
    Prelims: float
    OHP: float
    HardBase: float
    HardPerM2: float
    HardRaw: float
    Hard: float
    hard_by_group: dict[str, float]
    # §5
    DesignC: float
    PermitC: float
    ContC: float
    MktC: float
    RETTC: float
    DevFeeC: float
    DevCost: float
    TotCost: float
    Profit: float
    Margin: float
    MarginOnRevenue: float | None
    CostPerSellable: float | None
    # §6
    ConM: int
    DistM: int
    # §8
    LandCash: float
    InvE: float
    OwnDraw: float
    PotP: float
    OwnRem: float
    PoolProfit: float
    OwnShare: float
    OwnerFinal: float
    InvFinal: float
    # §9
    project_irr: float | None
    project_npv: float
    investor_irr: float | None
    equity_multiple: float
    owner_multiple: float | None
    payback_month: int | None
    breakeven_res_price: float | None
    breakeven_sales_pct: float | None
    max_land_margin: float
    max_land_irr_12: float
    max_land_irr_15: float
    max_land_irr_18: float
    max_land_irr_20: float
    dev_fee: float
    dev_partner_net: float
    dev_partner_irr: float | None
    finance_cost: float
    dev_partner_net_after_fin: float
    # §10, §12
    owner_share_sensitivity: list[OwnerShareRow]
    alternatives: Alternatives
    # §7 monthly arrays (NM months)
    monthly: dict[str, list[float]]


class StressRow(BaseModel):
    n: int
    label: str
    changes: dict[str, float]
    Profit: float
    Margin: float
    project_irr: float | None
    project_npv: float
    InvE: float
    dev_partner_net_after_fin: float
    dev_partner_irr: float | None
    owner_multiple: float | None


class StressResult(BaseModel):
    tests: list[StressRow]
