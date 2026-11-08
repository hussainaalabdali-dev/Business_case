import type { EngineResult, Verdict } from "../../../engine-ts/src";
import { amount, millions, mult, pct } from "../format";
import { ar } from "../i18n/ar";

/** Wrap numeric runs (e.g. "−10%") in LTR-isolated spans so bidi does not reorder them inside Arabic text. */
export function IsoNum({ text }: { text: string }) {
  const parts = text.split(/([−+\-]?\d[\d.,]*%?)/);
  return <>{parts.map((p, i) => (i % 2 ? <span class="num">{p}</span> : p))}</>;
}

export function VerdictPill({ v }: { v: Verdict }) {
  return <span class={`pill v-${v.replace(/\s/g, "")}`} dir="ltr">{v}</span>;
}

export function Irr({ v, r }: { v: number | null; r: EngineResult }) {
  if (v === null) {
    return (
      <span class="irr-none">
        <strong>{ar.noIrr}</strong>
        <small>{ar.noIrrNote} · {ar.profit} {millions(r.Profit)} {ar.millionSar} · {mult(r.equity_multiple)}</small>
      </span>
    );
  }
  return <strong class={`num ${v < 0 ? "neg" : ""}`}>{pct(v)}</strong>;
}

export function ResultsPanel({ r, verdict, tgt, error, missing, onGo }: {
  r: EngineResult | null; verdict: Verdict | null; tgt: number; error: string | null;
  missing: { key: string; label: string; step: number }[]; onGo: (step: number) => void;
}) {
  if (missing.length) {
    return (
      <aside class="panel" aria-live="polite">
        <h2>{ar.results}</h2>
        <p class="verdict-text">{ar.missingTitle}:</p>
        <ul class="missing">
          {missing.map(m => (
            <li><button type="button" class="link" onClick={() => onGo(m.step)}>{m.label}</button>
              <small class="muted"> · {ar.goToStep(m.step + 1)}</small></li>
          ))}
        </ul>
        <p class="disclaimer">{ar.disclaimer}</p>
      </aside>
    );
  }
  if (error || !r || !verdict) {
    return (
      <aside class="panel" aria-live="polite">
        <h2>{ar.results}</h2>
        <p class="error">{ar.engineError} {error}</p>
      </aside>
    );
  }
  return (
    <aside class="panel" aria-live="polite">
      <div class="panel-head">
        <h2>{ar.results}</h2>
        <VerdictPill v={verdict} />
      </div>
      <p class="verdict-text">{ar.verdictText[verdict]}</p>
      <p class="hint">{ar.quickVerdict}</p>
      <dl class="kpis">
        <div><dt>{ar.profit}</dt><dd><strong class={`num ${r.Profit < 0 ? "neg" : ""}`}>{millions(r.Profit)}</strong><small>{ar.millionSar}</small></dd></div>
        <div><dt>{ar.margin}</dt><dd><strong class={`num ${r.Margin < 0 ? "neg" : ""}`}>{pct(r.Margin)}</strong><small>{ar.target} {pct(tgt, 1)}</small></dd></div>
        <div><dt>{ar.projectIrr}</dt><dd><Irr v={r.project_irr} r={r} /></dd></div>
        <div><dt>{ar.devIrr}</dt><dd><Irr v={r.dev_partner_irr} r={r} /></dd></div>
        <div><dt>{ar.investorEquity}</dt><dd><strong class="num">{millions(r.InvE)}</strong><small>{ar.millionSar}</small></dd></div>
        <div><dt>{ar.equityMultiple}</dt><dd><strong class="num">{mult(r.equity_multiple)}</strong>
          <small>{r.payback_month === null ? ar.noPayback : ar.payback(r.payback_month)}</small></dd></div>
        <div><dt>{ar.maxLand18}</dt><dd><strong class="num">{millions(r.max_land_irr_18)}</strong><small>{ar.millionSar}</small></dd></div>
        <div><dt>{ar.breakevenPrice}</dt><dd><strong class="num">{amount(r.breakeven_res_price)}</strong><small>{ar.sarPerM2}</small></dd></div>
      </dl>
      <div class="rev-cost">
        <span>{ar.revenue} <b class="num">{millions(r.RevTot)}</b></span>
        <span>{ar.totalCost} <b class="num">{millions(r.TotCost)}</b></span>
      </div>
      <p class="disclaimer">{ar.disclaimer}</p>
    </aside>
  );
}
