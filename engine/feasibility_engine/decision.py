"""Decision conditions — ENGINE_SPEC §13. Thresholds are user-editable; defaults below come from the spec."""

from typing import Literal

from pydantic import BaseModel

from .models import EngineInputs, EngineResult

Verdict = Literal["GO", "CONDITIONAL GO", "RENEGOTIATE", "HOLD", "NO GO"]


class Thresholds(BaseModel):
    licence: float = 1
    price_res_min: float = 14_500
    land_value_max: float | None = None  # default: round(LandMkt*LandArea, -6)
    early_rec: float = 0
    hard_max: float = 70_000_000
    vat_nr_max: float = 0
    margin_min: float | None = None  # default: TgtMargin


class Condition(BaseModel):
    key: str
    value: float
    threshold: float
    met: bool


class Decision(BaseModel):
    conditions: list[Condition]
    decision: Verdict
    quick_verdict: Verdict


def quick_verdict(margin: float, tgt_margin: float) -> Verdict:
    if margin >= tgt_margin:
        return "GO"
    if margin >= 0.10:
        return "CONDITIONAL GO"
    if margin >= 0:
        return "RENEGOTIATE"
    return "NO GO"


def decide(inp: EngineInputs, res: EngineResult, licence: int, th: Thresholds | None = None) -> Decision:
    th = th or Thresholds()
    land_max = th.land_value_max if th.land_value_max is not None else float(round(inp.LandMkt * inp.LandArea, -6))
    m_min = th.margin_min if th.margin_min is not None else inp.TgtMargin
    vat = inp.scen("VATNR")
    conds = [
        Condition(key="licence", value=licence, threshold=th.licence, met=licence >= th.licence),
        Condition(key="price_res", value=res.PriceRes, threshold=th.price_res_min, met=res.PriceRes >= th.price_res_min),
        Condition(key="land_value", value=inp.LandValue, threshold=land_max, met=inp.LandValue <= land_max),
        Condition(key="early_rec", value=inp.EarlyRec, threshold=th.early_rec, met=inp.EarlyRec == th.early_rec),
        Condition(key="hard", value=res.Hard, threshold=th.hard_max, met=res.Hard <= th.hard_max),
        Condition(key="vat_nr", value=vat, threshold=th.vat_nr_max, met=vat <= th.vat_nr_max),
        Condition(key="margin", value=res.Margin, threshold=m_min, met=res.Margin >= m_min),
    ]
    met = {c.key: c.met for c in conds}
    decision: Verdict
    if all(met.values()):
        decision = "GO"
    elif met["licence"] and met["margin"]:
        decision = "CONDITIONAL GO"
    elif licence == 0:
        decision = "HOLD"
    else:
        decision = "RENEGOTIATE"
    return Decision(conditions=conds, decision=decision, quick_verdict=quick_verdict(res.Margin, inp.TgtMargin))
