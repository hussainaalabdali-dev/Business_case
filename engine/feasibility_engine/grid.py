"""Sensitivity grids — ENGINE_SPEC §11.1. Every cell is a full re-run."""

from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel

from .core import run
from .models import EngineInputs, ScenarioValue

PRICE_RES_VALUES = (11500.0, 12500.0, 13000.0, 14000.0, 15000.0, 16000.0)
COST_FACTOR_VALUES = (0.9, 1.0, 1.1, 1.2, 1.3)
LAND_FACTORS = (0.75, 0.83, 0.88, 0.92, 1.00)


class Grid(BaseModel):
    metric: str
    row_name: str
    rows: list[float]
    col_name: str
    cols: list[float]
    values: list[list[float]]  # values[i][j] for rows[i], cols[j]


def _set_scen(inp: EngineInputs, name: str, value: float) -> dict[str, Any]:
    """Replace the active scenario's value (shocks are applied afterwards by the engine)."""
    cur = getattr(inp, name)
    if isinstance(cur, ScenarioValue):
        key = ("conservative", "base", "optimistic")[inp.Scen - 1]
        return {name: cur.model_copy(update={key: value})}
    return {name: value}


def default_land_values(inp: EngineInputs) -> list[float]:
    return [float(round(inp.LandValue * f, -6)) for f in LAND_FACTORS]


def _as_inputs(inp: EngineInputs | dict[str, Any]) -> EngineInputs:
    return inp if isinstance(inp, EngineInputs) else EngineInputs.model_validate(inp)


def grid_a(inp: EngineInputs | dict[str, Any], prices: Sequence[float] = PRICE_RES_VALUES,
           cost_factors: Sequence[float] = COST_FACTOR_VALUES) -> Grid:
    base = _as_inputs(inp)
    vals = [
        [run(base.model_copy(update={**_set_scen(base, "PriceRes", p), **_set_scen(base, "CostFactor", c)})).Profit
         for c in cost_factors]
        for p in prices
    ]
    return Grid(metric="Profit", row_name="PriceRes", rows=list(prices), col_name="CostFactor",
                cols=list(cost_factors), values=vals)


def grid_b(inp: EngineInputs | dict[str, Any], prices: Sequence[float] = PRICE_RES_VALUES,
           land_values: Sequence[float] | None = None) -> Grid:
    base = _as_inputs(inp)
    lands = list(land_values) if land_values is not None else default_land_values(base)
    vals = [
        [run(base.model_copy(update={**_set_scen(base, "PriceRes", p), "LandValue": lv})).Margin for lv in lands]
        for p in prices
    ]
    return Grid(metric="Margin", row_name="PriceRes", rows=list(prices), col_name="LandValue", cols=lands, values=vals)


def run_grids(inp: EngineInputs | dict[str, Any], land_values: Sequence[float] | None = None) -> dict[str, Grid]:
    return {"grid_a": grid_a(inp), "grid_b": grid_b(inp, land_values=land_values)}
