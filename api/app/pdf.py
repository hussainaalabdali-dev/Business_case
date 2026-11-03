"""HTML → A4 PDF with Playwright (Chromium). Fonts are self-hosted and inlined as data URIs."""

import base64
import datetime as dt
import os
import re
from functools import cache
from pathlib import Path

from feasibility_engine import EngineInputs, run, run_stress
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

from .fmt import NO_IRR_NOTE, amount, irr, millions, pct

HERE = Path(__file__).parent
_env = Environment(loader=FileSystemLoader(HERE / "templates"), autoescape=select_autoescape(["html"]))
_NUM_RUN = re.compile(r"[−+\-]?\d[\d.,]*%?")


def isolate_numbers(text: str) -> Markup:
    """Wrap numeric runs (e.g. '−10%') in LTR-isolated spans so bidi does not reorder them in RTL text."""
    return Markup(_NUM_RUN.sub(lambda m: f'<span class="num">{escape(m.group(0))}</span>', str(escape(text))))


_env.filters.update(millions=millions, amount=amount, pct=pct, irr=irr, isonum=isolate_numbers)
_env.globals["NO_IRR_NOTE"] = NO_IRR_NOTE


@cache
def font_faces() -> str:
    css = []
    for w in (400, 600, 700):
        for name, rng in ((f"IBMPlexSansArabic-{w}.woff2", "U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F"),
                          (f"IBMPlexSansArabic-latin-{w}.woff2", "U+0000-00FF, U+2000-206F, U+20AC, U+2212")):
            data = base64.b64encode((HERE / "fonts" / name).read_bytes()).decode()
            css.append(f"@font-face{{font-family:'IBM Plex Sans Arabic';font-weight:{w};font-style:normal;"
                       f"src:url(data:font/woff2;base64,{data}) format('woff2');unicode-range:{rng};}}")
    return "\n".join(css)


def _chart(values: list[float], width: int = 640, height: int = 220) -> dict[str, object]:
    """Bars of the investor's cumulative position by month (SVG geometry; RTL handled by mirroring x)."""
    lo, hi = min(min(values), 0.0), max(max(values), 0.0)
    span = (hi - lo) or 1.0
    bw = width / len(values)
    zero_y = height * hi / span
    bars = []
    for i, v in enumerate(values):
        h = abs(v) / span * height
        x = width - (i + 1) * bw  # month 0 on the right (RTL)
        y = zero_y - h if v >= 0 else zero_y
        bars.append({"x": round(x + 1, 2), "y": round(y, 2), "w": round(bw - 2, 2), "h": round(h, 2), "neg": v < 0})
    return {"bars": bars, "zero_y": round(zero_y, 2), "w": width, "h": height, "lo": lo, "hi": hi}


def render_demo_html(inp: EngineInputs) -> str:
    res = run(inp)
    stress = run_stress(inp).tests
    upto = res.DistM + 1
    return _env.get_template("demo.html").render(
        fonts=font_faces(), inp=inp, r=res, stress=stress,
        chart=_chart(res.monthly["investor_cum"][:upto]),
        created=dt.date.today().isoformat(),
    )


def render_demo_pdf(inp: EngineInputs) -> bytes:
    from playwright.sync_api import sync_playwright

    html = render_demo_html(inp)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"], executable_path=os.environ.get("CHROMIUM_PATH") or None)
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="load")
            page.evaluate("document.fonts.ready")
            pdf: bytes = page.pdf(format="A4", print_background=True, prefer_css_page_size=True,
                                  display_header_footer=False)
        finally:
            browser.close()
    return pdf
