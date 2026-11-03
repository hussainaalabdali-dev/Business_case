"""Stress set — ENGINE_SPEC §11.2 (exactly 22 tests, fixed order). Every test is a full re-run."""

from dataclasses import dataclass
from typing import Any

from .core import run
from .models import EngineInputs, StressResult, StressRow

COMBINED = {"RevShock": -0.10, "CostShock": 0.10, "DelayM": 6}


@dataclass(frozen=True)
class StressTest:
    label: str
    changes: dict[str, float]
    land_factor: float | None = None  # LandValue = round(LandValue_input * f, -6)


STRESS_TESTS: tuple[StressTest, ...] = (
    StressTest("الأساسي", {}),
    StressTest("الإيراد −10%", {"RevShock": -0.10}),
    StressTest("الإيراد −20%", {"RevShock": -0.20}),
    StressTest("الإيراد −30%", {"RevShock": -0.30}),
    StressTest("التكلفة +10%", {"CostShock": 0.10}),
    StressTest("التكلفة +20%", {"CostShock": 0.20}),
    StressTest("التكلفة +30%", {"CostShock": 0.30}),
    StressTest("تأخير 6 أشهر", {"DelayM": 6}),
    StressTest("تأخير 12 شهر", {"DelayM": 12}),
    StressTest("تأخير 18 شهر", {"DelayM": 18}),
    StressTest("تمويل 7%", {"FinRate": 0.07}),
    StressTest("تمويل 9%", {"FinRate": 0.09}),
    StressTest("تمويل 11%", {"FinRate": 0.11}),
    StressTest("مركّب: إيراد −10%، تكلفة +10%، تأخير 6", dict(COMBINED)),
    StressTest("السيناريو المتحفظ", {"Scen": 1}),
    StressTest("السيناريو المتفائل", {"Scen": 3}),
    StressTest("المتحفظ بدون استرداد مبكر", {"Scen": 1, "EarlyRec": 0}),
    StressTest("المتحفظ بدون استرداد مبكر + معارض عينية", {"Scen": 1, "EarlyRec": 0, "ShopsInKind": 1}),
    StressTest("المركّب بدون استرداد مبكر", {**COMBINED, "EarlyRec": 0}),
    StressTest("الأرض × 0.83", {}, 0.83),
    StressTest("الأرض × 0.87", {}, 0.87),
    StressTest("الأرض × 0.92", {}, 0.92),
)


def apply_test(base: EngineInputs, test: StressTest) -> tuple[EngineInputs, dict[str, float]]:
    changes: dict[str, Any] = dict(test.changes)
    if test.land_factor is not None:
        changes["LandValue"] = float(round(base.LandValue * test.land_factor, -6))
    for k in ("Scen", "EarlyRec", "ShopsInKind", "DelayM"):
        if k in changes:
            changes[k] = int(changes[k])
    return base.model_copy(update=changes), {k: float(v) for k, v in changes.items()}


def run_stress(inp: EngineInputs | dict[str, Any]) -> StressResult:
    base = inp if isinstance(inp, EngineInputs) else EngineInputs.model_validate(inp)
    rows = []
    for n, test in enumerate(STRESS_TESTS, start=1):
        variant, changes = apply_test(base, test)
        r = run(variant)
        rows.append(
            StressRow(
                n=n, label=test.label, changes=changes, Profit=r.Profit, Margin=r.Margin, project_irr=r.project_irr,
                project_npv=r.project_npv, InvE=r.InvE, dev_partner_net_after_fin=r.dev_partner_net_after_fin,
                dev_partner_irr=r.dev_partner_irr, owner_multiple=r.owner_multiple,
                equity_multiple=r.equity_multiple,
            )
        )
    return StressResult(tests=rows)
