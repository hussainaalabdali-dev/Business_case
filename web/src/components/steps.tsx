import { useEffect, useRef, useState } from "preact/hooks";
import { DEFAULT_THRESHOLDS, decide, defaultLandValues } from "../../../engine-ts/src";
import type { BoqItem, EngineInputs, EngineResult, Grid, StressRow, Thresholds } from "../../../engine-ts/src";
import { ADVANCED, VISIBLE } from "../fields";
import { amount, editable, millions, mult, parseNumber, pct } from "../format";
import { ar } from "../i18n/ar";
import { staleScenarios } from "../example";
import { Advanced, FieldGroup } from "./inputs";
import { Irr, IsoNum, VerdictPill } from "./results";

type Update = (patch: Partial<EngineInputs>) => void;
interface StepProps { inputs: EngineInputs; update: Update; r: EngineResult | null }

/* ---------- Step 1: تشخيص الفرصة ---------- */
export function Step1({ inputs, update, r }: StepProps) {
  return (
    <>
      {VISIBLE[0].map(g => <FieldGroup title={g.title} fields={g.fields} inputs={inputs} update={update} />)}
      {r && (
        <section class="card">
          <h3>{ar.derived}</h3>
          <dl class="facts">
            <div><dt>{ar.resGfa}</dt><dd><span class="num">{amount(r.ResGFA)}</span> م²</dd></div>
            <div><dt>{ar.sellable}</dt><dd><span class="num">{amount(r.SellTot)}</span> م²</dd></div>
            <div><dt>{ar.units}</dt><dd class="num">{amount(r.Units)}</dd></div>
            <div><dt>{ar.landPerSellable}</dt><dd><span class="num">{amount(inputs.LandValue / r.SellTot)}</span> {ar.sarPerM2}</dd></div>
            <div><dt>{ar.landMarketValue}</dt><dd><span class="num">{millions(r.alternatives.land_market_value)}</span> {ar.millionSar}</dd></div>
            <div><dt>{ar.landVsMarket}</dt>
              <dd class={`num ${r.alternatives.land_owner_vs_ask < 0 ? "neg" : ""}`}>{pct(inputs.LandValue / r.alternatives.land_market_value - 1)}</dd></div>
          </dl>
        </section>
      )}
      <Advanced>{ADVANCED[0].map(g => <FieldGroup title={g.title} fields={g.fields} inputs={inputs} update={update} />)}</Advanced>
    </>
  );
}

/* ---------- Step 2: النموذج المالي ---------- */
function CashChart({ r }: { r: EngineResult }) {
  const vals = r.monthly.investor_cum.slice(0, r.DistM + 1);
  const W = 640, H = 200, pad = { l: 8, r: 52, t: 10, b: 26 };
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, bw = iw / vals.length;
  const y = (v: number) => pad.t + ((hi - v) / span) * ih;
  const x = (i: number) => pad.l + iw - (i + 1) * bw; // month 0 on the right (RTL)
  return (
    <figure class="card chart">
      <figcaption>{ar.cashChart}</figcaption>
      <div class="chart-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ar.cashChart}>
          {vals.map((v, i) => (
            <rect x={x(i) + 1} y={Math.min(y(v), y(0))} width={Math.max(bw - 2, 1)} height={Math.max(Math.abs(y(v) - y(0)), 0.5)}
              class={v < 0 ? "bar-neg" : "bar-pos"} />
          ))}
          <line x1={pad.l} x2={pad.l + iw} y1={y(0)} y2={y(0)} class="axis" />
          {[hi, 0, lo].map(v => <text x={W - pad.r + 6} y={y(v) + 4} direction="ltr">{millions(v)}</text>)}
          <text x={pad.l + iw} y={H - 8} text-anchor="end">{ar.month} 0</text>
          <text x={pad.l} y={H - 8} text-anchor="start">{ar.distMonth(r.DistM)}</text>
        </svg>
      </div>
    </figure>
  );
}

function BoqTable({ inputs, update }: { inputs: EngineInputs; update: Update }) {
  const set = (i: number, patch: Partial<BoqItem>) =>
    update({ _boq: inputs._boq.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <fieldset class="group">
      <legend>{ar.boqTitle}</legend>
      <div class="table-scroll">
        <table class="boq">
          <thead><tr><th>{ar.boqCode}</th><th>{ar.boqItem}</th><th>{ar.boqQty}</th><th>{ar.boqUnit}</th><th>{ar.boqRate}</th></tr></thead>
          <tbody>
            {inputs._boq.map((b, i) => (
              <tr>
                <td>{b.code}</td><td>{b.item}</td>
                <td><input dir="ltr" aria-label={`${b.item} ${ar.boqQty}`} value={String(b.qty_formula)}
                  onChange={e => { const t = (e.target as HTMLInputElement).value; const n = parseNumber(t); set(i, { qty_formula: t.trim().startsWith("=") || n === null ? t : n }); }} /></td>
                <td>{b.unit}</td>
                <td><input dir="ltr" aria-label={`${b.item} ${ar.boqRate}`} value={typeof b.rate === "number" ? editable(b.rate) : b.rate}
                  onChange={e => { const t = (e.target as HTMLInputElement).value; const n = parseNumber(t); set(i, { rate: t.trim().startsWith("=") || n === null ? t : n }); }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

export function Step2({ inputs, update, r }: StepProps) {
  return (
    <>
      {VISIBLE[1].map(g => <FieldGroup title={g.title} fields={g.fields} inputs={inputs} update={update} />)}
      <p class="note">{inputs.CostMode === 1 ? ar.costPerM2Note : ar.boqActive}</p>
      {r && (
        <>
          <section class="card">
            <h3>{ar.costBreakdown}</h3>
            <dl class="facts">
              <div><dt>{ar.land}</dt><dd class="num">{millions(inputs.LandValue)}</dd></div>
              <div><dt>{ar.hard}</dt><dd class="num">{millions(r.Hard)}</dd></div>
              <div><dt>{ar.softCosts}</dt><dd class="num">{millions(r.DesignC + r.PermitC + r.ContC)}</dd></div>
              <div><dt>{ar.marketing}</dt><dd class="num">{millions(r.MktC)}</dd></div>
              <div><dt>{ar.rett}</dt><dd class="num">{millions(r.RETTC)}</dd></div>
              <div><dt>{ar.devFee}</dt><dd class="num">{millions(r.DevFeeC)}</dd></div>
              <div class="total"><dt>{ar.totalCost}</dt><dd><span class="num">{millions(r.TotCost)}</span> {ar.millionSar}</dd></div>
            </dl>
          </section>
          <CashChart r={r} />
        </>
      )}
      <Advanced>
        {ADVANCED[1].map(g => <FieldGroup title={g.title} fields={g.fields} inputs={inputs} update={update} scenarioAll />)}
        <BoqTable inputs={inputs} update={update} />
      </Advanced>
    </>
  );
}

/* ---------- Step 3: اختبار الضغط ---------- */
interface StressOut { stress: StressRow[]; gridA: Grid; gridB: Grid }

function useStress(inputs: EngineInputs, landValues: number[] | undefined) {
  const [out, setOut] = useState<StressOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    worker.current = new Worker(new URL("../stress.worker.ts", import.meta.url), { type: "module" });
    worker.current.onmessage = (e: MessageEvent<{ id: number; error?: string } & StressOut>) => {
      if (e.data.id !== seq.current) return;
      setBusy(false);
      if (e.data.error) { setErr(e.data.error); return; }
      setErr(null); setOut(e.data);
    };
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    const id = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => worker.current?.postMessage({ id, inputs, landValues }), 300);
    return () => clearTimeout(t);
  }, [inputs, landValues]);
  return { out, err, busy };
}

function Heat({ grid, fmt, rowFmt, colFmt, title, good }: {
  grid: Grid; fmt: (v: number) => string; rowFmt: (v: number) => string; colFmt: (v: number) => string; title: string; good: (v: number) => number;
}) {
  return (
    <figure class="card">
      <figcaption>{title}</figcaption>
      <div class="table-scroll">
        <table class="heat">
          <thead><tr><th></th>{grid.cols.map(c => <th class="num">{colFmt(c)}</th>)}</tr></thead>
          <tbody>
            {grid.rows.map((rv, i) => (
              <tr><th class="num">{rowFmt(rv)}</th>
                {grid.values[i]!.map(v => <td class={`num h${good(v)}`}>{fmt(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function Step3({ inputs, update }: StepProps) {
  const [landText, setLandText] = useState<string | null>(null);
  const landValues = landText === null ? undefined
    : landText.split(/[,،]/).map(s => parseNumber(s)).filter((n): n is number => n !== null).map(n => n * 1e6);
  const { out, err, busy } = useStress(inputs, landValues && landValues.length ? landValues : undefined);
  const stale = staleScenarios(inputs);
  const tgt = inputs.TgtMargin;
  const defaultLand = defaultLandValues(inputs).map(v => editable(v / 1e6)).join("، ");
  return (
    <>
      {stale.length > 0 && <p class="warn">{ar.scenarioWarning}</p>}
      <section class="card">
        <h3>{ar.stressTitle} {busy && <small class="muted">{ar.stressRunning}</small>}</h3>
        {err && <p class="error">{ar.engineError} {err}</p>}
        {out && (
          <div class="table-scroll">
            <table class="stress">
              <thead><tr><th>#</th><th>{ar.colTest}</th><th>{ar.colProfit}</th><th>{ar.colMargin}</th>
                <th>{ar.colProjIrr}</th><th>{ar.colDevIrr}</th><th>{ar.colDevNet}</th><th>{ar.colOwnerMult}</th></tr></thead>
              <tbody>
                {out.stress.map(s => (
                  <tr>
                    <td class="num">{s.n}</td><td><IsoNum text={s.label} /></td>
                    <td class={`num ${s.Profit < 0 ? "neg" : ""}`}>{millions(s.Profit)}</td>
                    <td class={`num ${s.Margin < 0 ? "neg" : ""}`}>{pct(s.Margin)}</td>
                    <td class="num">{s.project_irr === null ? ar.noIrr : pct(s.project_irr)}</td>
                    <td class="num">{s.dev_partner_irr === null ? <span title={ar.noIrrNote}>{ar.noIrr}*</span> : pct(s.dev_partner_irr)}</td>
                    <td class={`num ${s.dev_partner_net_after_fin < 0 ? "neg" : ""}`}>{millions(s.dev_partner_net_after_fin)}</td>
                    <td class="num">{mult(s.owner_multiple)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {out.stress.some(s => s.dev_partner_irr === null) && <p class="hint">* {ar.noIrr}: {ar.noIrrNote}.</p>}
          </div>
        )}
      </section>
      {out && (
        <div class="grids">
          <Heat grid={out.gridA} title={ar.gridA} fmt={millions} rowFmt={amount} colFmt={v => v.toFixed(2) + "×"}
            good={v => (v < 0 ? 0 : v < out.gridA.values[2]![1]! ? 1 : 2)} />
          <Heat grid={out.gridB} title={ar.gridB} fmt={v => pct(v)} rowFmt={amount} colFmt={v => millions(v)}
            good={v => (v < 0 ? 0 : v < tgt ? 1 : 2)} />
        </div>
      )}
      <div class="field wide">
        <label for="grid-land">{ar.gridBEdit}</label>
        <input id="grid-land" class="num-input" dir="ltr" value={landText ?? defaultLand}
          onInput={e => setLandText((e.target as HTMLInputElement).value)} />
      </div>
      <Advanced>{ADVANCED[2].map(g => <FieldGroup title={g.title} fields={g.fields} inputs={inputs} update={update} />)}</Advanced>
    </>
  );
}

/* ---------- Step 4: القرار ---------- */
export function Step4({ inputs, r, licence, setLicence, th, setTh }: StepProps & {
  licence: number; setLicence: (n: number) => void; th: Thresholds; setTh: (t: Thresholds) => void;
}) {
  if (!r) return null;
  const d = decide(inputs, r, licence, th);
  const thKey: Record<string, keyof Thresholds> = { price_res: "price_res_min", land_value: "land_value_max", hard: "hard_max" };
  const fmtCond = (k: string, v: number) => (k === "margin" || k === "vat_nr" ? pct(v) : k === "licence" || k === "early_rec" ? (v ? ar.yes : ar.no) : amount(v));
  return (
    <>
      <section class="card decision">
        <div class="panel-head"><h3>{ar.decisionTitle}</h3><VerdictPill v={d.decision} /></div>
        <p class="verdict-text">{ar.verdictText[d.decision]}</p>
        <div class="field">
          <span class="field-head">{ar.licence}</span>
          <div class="seg" role="group" aria-label={ar.licence}>
            <button type="button" aria-pressed={licence === 1} onClick={() => setLicence(1)}>{ar.yes}</button>
            <button type="button" aria-pressed={licence === 0} onClick={() => setLicence(0)}>{ar.no}</button>
          </div>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>{ar.conditions}</th><th>{ar.threshold}</th><th></th></tr></thead>
            <tbody>
              {d.conditions.map(c => (
                <tr>
                  <td>{ar.condLabels[c.key]} <small class="muted num">({fmtCond(c.key, c.value)})</small></td>
                  <td>{thKey[c.key]
                    ? <input class="num-input" dir="ltr" aria-label={`${ar.threshold} ${ar.condLabels[c.key]}`} value={editable(c.threshold)}
                        onChange={e => { const n = parseNumber((e.target as HTMLInputElement).value); if (n !== null) setTh({ ...th, [thKey[c.key]!]: n }); }} />
                    : <span class="num">{fmtCond(c.key, c.threshold)}</span>}</td>
                  <td><span class={c.met ? "ok" : "bad"}>{c.met ? ar.condMet : ar.condNotMet}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl class="facts">
          <div><dt>{ar.maxLand18}</dt><dd><span class="num">{millions(r.max_land_irr_18)}</span> {ar.millionSar}</dd></div>
          <div><dt>{ar.maxLandMargin}</dt><dd><span class="num">{millions(r.max_land_margin)}</span> {ar.millionSar}</dd></div>
        </dl>
      </section>

      <section class="card">
        <h3>{ar.ownerShareTitle}</h3>
        <div class="table-scroll">
          <table>
            <thead><tr><th>{ar.colShare}</th><th>{ar.colOurNet}</th><th>{ar.colOurIrr}</th><th>{ar.colOurMult}</th><th>{ar.colOwnerGain}</th></tr></thead>
            <tbody>
              {r.owner_share_sensitivity.map(s => (
                <tr>
                  <td class="num">{pct(s.share, 1)}</td>
                  <td class={`num ${s.our_net < 0 ? "neg" : ""}`}>{millions(s.our_net)}</td>
                  <td>{s.our_irr === null ? ar.noIrr : <span class="num">{pct(s.our_irr)}</span>}</td>
                  <td class="num">{mult(s.our_multiple)}</td>
                  <td class={`num ${s.owner_gain < 0 ? "neg" : ""}`}>{millions(s.owner_gain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h3>{ar.altTitle}</h3>
        <div class="alts">
          <div><h4>{ar.altDm}</h4><dl class="facts">
            <div><dt>{ar.altDmFee}</dt><dd class="num">{millions(r.alternatives.dm_fee)}</dd></div>
            <div><dt>{ar.altDmOwner}</dt><dd class="num">{millions(r.alternatives.dm_owner_profit)}</dd></div></dl></div>
          <div><h4>{ar.altRent}</h4><dl class="facts">
            <div><dt>{ar.altNoi}</dt><dd class="num">{millions(r.alternatives.rent_noi)}</dd></div>
            <div><dt>{ar.altYield}</dt><dd class="num">{pct(r.alternatives.rent_yield_on_cost)}</dd></div>
            <div><dt>{ar.altValue}</dt><dd class="num">{millions(r.alternatives.rent_value)}</dd></div></dl></div>
          <div><h4>{ar.altLand}</h4><dl class="facts">
            <div><dt>{ar.altLandMv}</dt><dd class="num">{millions(r.alternatives.land_market_value)}</dd></div>
            <div><dt>{ar.altCommission}</dt><dd class="num">{millions(r.alternatives.land_our_commission)}</dd></div>
            <div><dt>{ar.altVsAsk}</dt><dd class="num">{millions(r.alternatives.land_owner_vs_ask)}</dd></div></dl></div>
        </div>
        <p class="hint">{ar.millionSar}</p>
      </section>
    </>
  );
}

export const INITIAL_THRESHOLDS: Thresholds = DEFAULT_THRESHOLDS;
export { Irr };
