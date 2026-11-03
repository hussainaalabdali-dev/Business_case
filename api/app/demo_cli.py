"""Write the Milestone 1 PDF trial for the Abhur example: python -m app.demo_cli out.pdf"""

import json
import sys
from pathlib import Path

from feasibility_engine import EngineInputs

from .pdf import render_demo_pdf

ROOT = Path(__file__).resolve().parents[2]

if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "out/demo.pdf")
    inp = EngineInputs.model_validate(json.loads((ROOT / "fixtures/base.json").read_text(encoding="utf-8"))["inputs"])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(render_demo_pdf(inp))
    print(out)
