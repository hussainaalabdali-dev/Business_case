"""Display formatting (CLAUDE.md rule 4): Western digits, thousands separators, millions with one decimal."""


def millions(v: float | None) -> str:
    return "—" if v is None else f"{v / 1e6:,.1f}"


def amount(v: float | None) -> str:
    return "—" if v is None else f"{v:,.0f}"


def pct(v: float | None, digits: int = 1) -> str:
    return "—" if v is None else f"{v * 100:,.{digits}f}%"


NO_IRR = "لا يوجد"
NO_IRR_NOTE = "التدفقات لا تسترد رأس المال"


def irr(v: float | None) -> str:
    """IRR null is shown as 'لا يوجد' (never -100%); callers must show profit and multiple next to it."""
    return NO_IRR if v is None else pct(v)
