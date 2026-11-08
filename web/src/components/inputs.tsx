import { useEffect, useState } from "preact/hooks";
import type { EngineInputs, ScenarioValue } from "../../../engine-ts/src";
import type { Field } from "../fields";
import { editable, parseNumber } from "../format";
import { ar } from "../i18n/ar";
import { ABHUR } from "../example";

type Update = (patch: Partial<EngineInputs>) => void;

function NumberBox({ id, value, kind, onChange, label }: {
  id: string; value: number; kind: Field["kind"]; onChange: (v: number) => void; label: string;
}) {
  const scale = kind === "pct" ? 100 : 1;
  const shown = editable(+(value * scale).toFixed(8));
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown); }, [shown, focused]);
  return (
    <input id={id} class="num-input" type="text" inputMode="decimal" dir="ltr" aria-label={label} value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setText(shown); }}
      onInput={e => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        const n = parseNumber(t);
        if (n !== null) onChange(kind === "int" ? Math.round(n) : n / scale);
      }} />
  );
}

function isDefault(f: Field, v: unknown): boolean {
  return JSON.stringify(v) === JSON.stringify(ABHUR[f.key]);
}

export function FieldRow({ field, inputs, update, scenarioAll = false }: {
  field: Field; inputs: EngineInputs; update: Update; scenarioAll?: boolean;
}) {
  if (field.showIf && !field.showIf(inputs)) return null;
  const v = inputs[field.key] as number | ScenarioValue;
  const id = `in-${field.key}${scenarioAll ? "-all" : ""}`;
  const tag = isDefault(field, v) ? <span class="tag" title={ar.advancedHint}>{ar.assumption}</span> : null;

  let control;
  if (field.kind === "flag" || field.kind === "choice") {
    control = (
      <div class="seg" role="group" aria-labelledby={`${id}-l`}>
        {field.options!.map(o => (
          <button type="button" aria-pressed={v === o.value} onClick={() => update({ [field.key]: o.value } as Partial<EngineInputs>)}>
            {o.label}
          </button>
        ))}
      </div>
    );
  } else if (field.scenario && typeof v === "object") {
    const keys = scenarioAll ? (["conservative", "base", "optimistic"] as const) : (["base"] as const);
    const names = { conservative: "متحفظ", base: "أساسي", optimistic: "متفائل" };
    control = (
      <div class={scenarioAll ? "scen3" : ""}>
        {keys.map(k => (
          <label class="scen-cell">
            {scenarioAll && <span class="scen-name">{names[k]}</span>}
            <NumberBox id={`${id}-${k}`} label={`${field.label} ${names[k]}`} value={v[k]} kind={field.kind}
              onChange={n => update({ [field.key]: { ...v, [k]: n } } as Partial<EngineInputs>)} />
          </label>
        ))}
      </div>
    );
  } else {
    control = <NumberBox id={id} label={field.label} value={v as number} kind={field.kind}
      onChange={n => update({ [field.key]: n } as Partial<EngineInputs>)} />;
  }

  return (
    <div class="field">
      <div class="field-head">
        <label id={`${id}-l`} for={field.kind === "flag" || field.kind === "choice" || field.scenario ? undefined : id}>{field.label}</label>
        {tag}
      </div>
      <div class="field-ctl">
        {control}
        {field.unit && <span class="unit">{field.unit}</span>}
      </div>
      {field.hint && <div class="hint">{field.hint}</div>}
    </div>
  );
}

export function FieldGroup({ title, fields, inputs, update, scenarioAll }: {
  title?: string; fields: Field[]; inputs: EngineInputs; update: Update; scenarioAll?: boolean;
}) {
  return (
    <fieldset class="group">
      {title && <legend>{title}</legend>}
      <div class="fields">
        {fields.map(fl => <FieldRow field={fl} inputs={inputs} update={update} scenarioAll={scenarioAll} />)}
      </div>
    </fieldset>
  );
}

export function Advanced({ children }: { children: preact.ComponentChildren }) {
  return (
    <details class="advanced">
      <summary>{ar.advanced}</summary>
      <p class="hint">{ar.advancedHint}</p>
      {children}
    </details>
  );
}
