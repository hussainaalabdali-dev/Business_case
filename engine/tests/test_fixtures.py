"""CLAUDE.md rule 1: engine parity with every fixture. Never edit a fixture to make this pass."""

import pytest
from conftest import FIXTURES, close, load

from feasibility_engine import run

CASES = sorted(p.name for p in FIXTURES.glob("*.json") if p.name != "base_monthly.json")


def test_fixture_count() -> None:
    assert len(CASES) == 13


@pytest.mark.parametrize("name", CASES)
def test_fixture(name: str) -> None:
    d = load(name)
    res = run(d["inputs"]).model_dump()
    fails = [(k, res.get(k), v) for k, v in d["expected"].items() if not close(res.get(k), v)]
    assert not fails, fails


def test_base_monthly() -> None:
    mb = load("base_monthly.json")
    res = run(load("base.json")["inputs"])
    assert set(mb) <= set(res.monthly), set(mb) - set(res.monthly)
    for key, exp in mb.items():
        got = res.monthly[key]
        assert len(got) >= len(exp)
        bad = [(m, a, b) for m, (a, b) in enumerate(zip(got, exp, strict=False)) if not close(a, b)]
        assert not bad, (key, bad[:3])


def test_base_sanity() -> None:
    r = run(load("base.json")["inputs"])
    assert r.DistM == 36
    assert round(r.RevTot) == 155_556_200
    assert r.payback_month == 36
