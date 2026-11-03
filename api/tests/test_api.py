import json
import os
import shutil
import statistics
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
BASE = json.loads((ROOT / "fixtures/base.json").read_text(encoding="utf-8"))
client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_run_matches_fixture() -> None:
    r = client.post("/engine/run", json={"inputs": BASE["inputs"], "licence": 1})
    assert r.status_code == 200
    body = r.json()
    assert abs(body["result"]["Profit"] - BASE["expected"]["Profit"]) <= 1
    assert body["result"]["payback_month"] == 36
    assert len(body["result"]["monthly"]["project_flow"]) == 70
    assert body["decision"]["quick_verdict"] == "RENEGOTIATE"


def test_run_rejects_unknown_field() -> None:
    r = client.post("/engine/run", json={"inputs": {**BASE["inputs"], "Bogus": 1}})
    assert r.status_code == 422


def test_run_rejects_bad_formula() -> None:
    boq = [{**BASE["inputs"]["_boq"][0], "qty_formula": "=__import__('os')"}]
    r = client.post("/engine/run", json={"inputs": {**BASE["inputs"], "_boq": boq}})
    assert r.status_code == 422


def test_stress_22() -> None:
    r = client.post("/engine/stress", json=BASE["inputs"])
    assert r.status_code == 200
    tests = r.json()["tests"]
    assert len(tests) == 22 and tests[0]["n"] == 1


def test_grid() -> None:
    r = client.post("/engine/grid", json={"inputs": BASE["inputs"]})
    g = r.json()
    assert g["grid_b"]["cols"] == [45e6, 50e6, 53e6, 55e6, 60e6]
    assert len(g["grid_a"]["values"]) == 6


def _p95(fn, n: int) -> float:  # type: ignore[no-untyped-def]
    ts = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        ts.append(time.perf_counter() - t)
    return statistics.quantiles(ts, n=20)[-1] if n >= 20 else max(ts)


@pytest.mark.perf
def test_perf_budgets() -> None:
    """ROADMAP M1: /engine/run < 300 ms, /engine/stress < 3 s (measured in-process, p95)."""
    run_p95 = _p95(lambda: client.post("/engine/run", json={"inputs": BASE["inputs"]}), 20)
    stress_max = _p95(lambda: client.post("/engine/stress", json=BASE["inputs"]), 3)
    line = f"/engine/run p95={run_p95 * 1000:.0f} ms, /engine/stress (22 tests) max={stress_max:.2f} s"
    print("\n" + line)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"### Performance\n{line}\n")
    assert run_p95 < 0.3
    assert stress_max < 3.0


@pytest.mark.skipif(not (os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or os.environ.get("PDF_TESTS")),
                    reason="needs Chromium (set CHROMIUM_PATH or PDF_TESTS=1)")
def test_pdf_demo() -> None:
    r = client.post("/pdf/demo", json=BASE["inputs"])
    assert r.status_code == 200
    assert r.content[:5] == b"%PDF-"


def test_no_irr_is_null_in_api() -> None:
    cons = json.loads((ROOT / "fixtures/conservative.json").read_text(encoding="utf-8"))
    r = client.post("/engine/run", json={"inputs": cons["inputs"], "include_monthly": False}).json()["result"]
    assert r["dev_partner_irr"] is None


def test_report_shows_no_irr_label() -> None:
    from feasibility_engine import EngineInputs

    from app.pdf import render_demo_html

    html = render_demo_html(EngineInputs.model_validate(BASE["inputs"]))
    assert "-100" not in html and "لا يوجد*" in html and "التدفقات لا تسترد رأس المال" in html
