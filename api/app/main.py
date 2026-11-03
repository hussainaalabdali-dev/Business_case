"""Stateless calculation API. It owns no user data and never logs request bodies (CLAUDE.md rule 5)."""

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from feasibility_engine import EngineInputs, EngineResult, StressResult, run, run_grids, run_stress
from feasibility_engine.decision import Decision, Thresholds, decide
from feasibility_engine.grid import Grid
from pydantic import BaseModel, Field

from .pdf import render_demo_pdf

app = FastAPI(title="Feasibility engine API", version="0.1.0", docs_url="/docs", redoc_url=None)


class RunRequest(BaseModel):
    inputs: EngineInputs
    licence: int | None = Field(default=None, ge=0, le=1, description="Licence issued (0/1); enables the §13 decision")
    thresholds: Thresholds | None = None
    include_monthly: bool = True


class RunResponse(BaseModel):
    result: EngineResult
    decision: Decision | None = None


class GridRequest(BaseModel):
    inputs: EngineInputs
    land_values: list[float] | None = Field(default=None, max_length=12)


def _engine_call(fn: Any, *args: Any, **kw: Any) -> Any:
    try:
        return fn(*args, **kw)
    except (ValueError, ZeroDivisionError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/engine/run", response_model=RunResponse, response_model_exclude_none=False)
def engine_run(req: RunRequest) -> RunResponse:
    res: EngineResult = _engine_call(run, req.inputs)
    if not req.include_monthly:
        res = res.model_copy(update={"monthly": {}})
    dec = decide(req.inputs, res, req.licence, req.thresholds) if req.licence is not None else None
    return RunResponse(result=res, decision=dec)


@app.post("/engine/stress", response_model=StressResult)
def engine_stress(inputs: EngineInputs) -> StressResult:
    out: StressResult = _engine_call(run_stress, inputs)
    return out


@app.post("/engine/grid", response_model=dict[str, Grid])
def engine_grid(req: GridRequest) -> dict[str, Grid]:
    out: dict[str, Grid] = _engine_call(run_grids, req.inputs, land_values=req.land_values)
    return out


@app.post("/pdf/demo", response_class=Response)
async def pdf_demo(inputs: EngineInputs) -> Response:
    """Milestone 1 Arabic PDF trial: table, chart and long Arabic text, rendered by Chromium."""
    pdf = await run_in_threadpool(render_demo_pdf, inputs)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="demo.pdf"'})
