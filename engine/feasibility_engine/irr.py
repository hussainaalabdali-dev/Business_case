"""IRR (ENGINE_SPEC §0): monthly root closest to 0.01, annualised. None when no root exists."""

from collections.abc import Sequence

_GUESS = 0.01
_STEP = 0.0025
_GRID = [-0.99 + i * _STEP for i in range(int(1.99 / _STEP) + 1)]


def npv_at(flows: Sequence[float], r: float) -> float:
    d = 1.0 / (1.0 + r)
    total, factor = 0.0, 1.0
    for f in flows:
        total += f * factor
        factor *= d
    return total


def irr_monthly(flows: Sequence[float]) -> float | None:
    """Scan (-0.99, 1.0] for sign changes, bisect each, return the root closest to the guess."""
    if not (any(f > 0 for f in flows) and any(f < 0 for f in flows)):
        return None
    roots: list[float] = []
    prev_r, prev_v = _GRID[0], npv_at(flows, _GRID[0])
    for r in _GRID[1:]:
        v = npv_at(flows, r)
        if prev_v == 0:
            roots.append(prev_r)
        elif prev_v * v < 0:
            lo, hi, flo = prev_r, r, prev_v
            for _ in range(200):
                mid = (lo + hi) / 2
                fm = npv_at(flows, mid)
                if flo * fm <= 0:
                    hi = mid
                else:
                    lo, flo = mid, fm
                if hi - lo < 1e-15:
                    break
            roots.append((lo + hi) / 2)
        prev_r, prev_v = r, v
    return min(roots, key=lambda x: abs(x - _GUESS)) if roots else None


def annualise(r: float | None) -> float | None:
    return None if r is None else (1 + r) ** 12 - 1


def irr_annual(flows: Sequence[float]) -> float | None:
    return annualise(irr_monthly(flows))
