"""Generate random input variations with the Python engine for the engine-ts cross-check.

Usage: python engine-ts/tests/gen_crosscheck.py engine-ts/tests/.crosscheck.json
"""

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from feasibility_engine import run, run_stress  # noqa: E402

SCALARS = ["RevTot", "Hard", "DevCost", "TotCost", "Profit", "Margin", "InvE", "OwnDraw", "PotP", "OwnerFinal",
           "InvFinal", "project_irr", "project_npv", "investor_irr", "equity_multiple", "owner_multiple",
           "payback_month", "breakeven_res_price", "max_land_margin", "max_land_irr_18", "dev_partner_net",
           "dev_partner_irr", "finance_cost", "DistM"]


def main(out: str) -> None:
    rnd = random.Random(20261104)
    base = json.loads((ROOT / "fixtures/base.json").read_text(encoding="utf-8"))["inputs"]
    cases = []
    for _ in range(60):
        inp = dict(base)
        inp["LandValue"] = rnd.choice([35e6, 45e6, 52e6, 60e6, 75e6])
        inp["LandArea"] = round(rnd.uniform(2500, 9000), 2)
        inp["FAR"] = round(inp["LandArea"] * rnd.uniform(2.0, 4.0))
        inp["ShopGFA"] = rnd.choice([0, 400, 750, 1200])
        inp["PriceRes"] = {k: v * rnd.uniform(0.85, 1.2) for k, v in base["PriceRes"].items()}
        inp["RateAbove"] = rnd.uniform(2600, 4200)
        inp["CostMode"] = rnd.choice([0, 1])
        inp["EarlyRec"] = rnd.choice([0, 1])
        inp["ShareMode"] = rnd.choice([0, 1])
        inp["OwnShareFix"] = rnd.choice([0.3, 0.5, 0.6])
        inp["Escrow"] = rnd.choice([0, 1])
        inp["ShopsInKind"] = rnd.choice([0, 1]) if inp["ShopGFA"] else 0
        inp["ShopValMode"] = rnd.choice([0, 1])
        inp["Scen"] = rnd.choice([1, 2, 3])
        inp["DelayM"] = rnd.choice([0, 3, 6])
        inp["FinRate"] = rnd.choice([0, 0.08])
        inp["ConBase"] = rnd.choice([20, 24, 30])
        r = run(inp).model_dump()
        stress = [s.model_dump() for s in run_stress(inp).tests]
        cases.append({"inputs": inp, "expected": {k: r[k] for k in SCALARS}, "stress": stress})
    Path(out).write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
    print(f"{len(cases)} cases -> {out}")


if __name__ == "__main__":
    main(sys.argv[1])
