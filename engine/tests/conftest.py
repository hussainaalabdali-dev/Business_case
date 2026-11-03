import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def close(actual: float | None, expected: object) -> bool:
    """ENGINE_SPEC §0 tolerance: amounts max(1 SAR, 0.01%), ratios 1e-4. 'لا يسترد' means null; -1 accepts null or a numeric -1 (same as reference _close)."""
    if expected == "لا يسترد" or expected is None:
        return actual is None
    if expected == -1 and actual is None:  # Excel #NUM -> null
        return True
    if actual is None or not isinstance(expected, (int, float)):
        return False
    if abs(expected) > 10:
        return abs(actual - expected) <= max(1.0, abs(expected) * 1e-4)
    return abs(actual - expected) <= 1e-4
