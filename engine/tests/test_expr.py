import pytest

from feasibility_engine.expr import FormulaError, evaluate


def test_formula() -> None:
    assert evaluate("=BasePerim*(ExcDepth+0.5)", {"BasePerim": 2, "ExcDepth": 1}) == 3
    assert evaluate(7, {}) == 7


@pytest.mark.parametrize("bad", ["=__import__('os')", "=FAR**2", "=open", "=1;2"])
def test_rejects(bad: str) -> None:
    with pytest.raises(FormulaError):
        evaluate(bad, {"FAR": 1})


def test_only_spec_variables() -> None:
    # A name outside ENGINE_SPEC §4 is rejected even if present in env.
    with pytest.raises(FormulaError, match="unknown variable: LandValue"):
        evaluate("=LandValue*2", {"LandValue": 1})


def test_unknown_variable_names_item() -> None:
    from conftest import load

    from feasibility_engine import run

    inp = load("base.json")["inputs"]
    boq = [dict(b) for b in inp["_boq"]]
    boq[3]["qty_formula"] = "=BaseGFA*Thickness"
    with pytest.raises(FormulaError, match=r"BOQ item أ4 .*unknown variable: Thickness"):
        run({**inp, "_boq": boq})
