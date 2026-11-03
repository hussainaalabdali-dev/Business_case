import pytest

from feasibility_engine.expr import FormulaError, evaluate


def test_formula() -> None:
    assert evaluate("=A*(B+0.5)", {"A": 2, "B": 1}) == 3
    assert evaluate(7, {}) == 7


@pytest.mark.parametrize("bad", ["=__import__('os')", "=A**2", "=open", "=1;2"])
def test_rejects(bad: str) -> None:
    with pytest.raises(FormulaError):
        evaluate(bad, {"A": 1})
