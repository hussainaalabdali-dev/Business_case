from conftest import close, load

from feasibility_engine import STRESS_TESTS, grid_a, grid_b, run, run_stress
from feasibility_engine.decision import decide

KPIS = ("Profit", "Margin", "project_irr", "project_npv", "InvE", "dev_partner_net_after_fin", "dev_partner_irr",
        "owner_multiple")
# ENGINE_SPEC §11.2 acceptance: stress tests that share overrides with a fixture.
SHARED = {1: "base.json", 2: "rev_minus10.json", 6: "cost_plus20.json", 9: "delay12.json", 12: "finance9.json",
          15: "conservative.json", 16: "optimistic.json"}


def test_stress_set_shape() -> None:
    assert len(STRESS_TESTS) == 22
    rows = run_stress(load("base.json")["inputs"]).tests
    assert [r.n for r in rows] == list(range(1, 23))
    assert [r.changes.get("LandValue") for r in rows[19:]] == [50e6, 52e6, 55e6]
    assert [r.n for r in rows if r.changes.get("EarlyRec") == 0] == [17, 18, 19]
    assert rows[13].changes == {"RevShock": -0.1, "CostShock": 0.1, "DelayM": 6}


def test_stress_matches_fixtures() -> None:
    rows = {r.n: r for r in run_stress(load("base.json")["inputs"]).tests}
    for n, name in SHARED.items():
        d = load(name)
        exp = d["expected"]
        for k in KPIS:
            if k in exp:
                assert close(getattr(rows[n], k), exp[k]), (n, name, k, getattr(rows[n], k), exp[k])


def test_stress_equals_direct_runs() -> None:
    base = load("base.json")["inputs"]
    rows = run_stress(base).tests
    r18 = run({**base, "Scen": 1, "EarlyRec": 0, "ShopsInKind": 1})
    assert rows[17].Profit == r18.Profit and rows[17].owner_multiple == r18.owner_multiple


def test_grids() -> None:
    base = load("base.json")["inputs"]
    a = grid_a(base)
    assert len(a.values) == 6 and len(a.values[0]) == 5
    # PriceRes 13000 × CostFactor 1.0 is the base case
    assert close(a.values[2][1], load("base.json")["expected"]["Profit"])
    b = grid_b(base)
    assert b.cols == [45e6, 50e6, 53e6, 55e6, 60e6]
    assert close(b.values[2][4], load("base.json")["expected"]["Margin"])


def test_grid_replaces_before_shock() -> None:
    base = {**load("base.json")["inputs"], "RevShock": -0.1}
    a = grid_a(base, prices=[13000], cost_factors=[1.0])
    assert close(a.values[0][0], load("rev_minus10.json")["expected"]["Profit"])


def test_decision_base() -> None:
    from feasibility_engine.models import EngineInputs

    inp = EngineInputs.model_validate(load("base.json")["inputs"])
    d = decide(inp, run(inp), licence=1)
    assert d.quick_verdict == "RENEGOTIATE"
    assert decide(inp, run(inp), licence=0).decision == "HOLD"
