import { useEffect, useState } from "preact/hooks";
import type { Field, Key } from "../fields";
import { editable, parseNumber } from "../format";
import { ar } from "../i18n/ar";
import { generalDefault, PROJECT_KEYS } from "../project";
import type { Num, ScenNum, Val } from "../project";

export type SetValues = (patch: Partial<Record<Key, Val>>) => void;

export function NumberBox({ id, value, kind, onChange, label, placeholder }: {
  id: string; value: Num; kind: Field["kind"]; onChange: (v: Num) => void; label: string; placeholder?: string;
}) {
  const scale = kind === "pct" ? 100 : 1;
  const shown = value === null ? "" : editable(+(value * scale).toFixed(8));
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown); }, [shown, focused]);
  return (
    <input id={id} class={`num-input ${value === null ? "empty" : ""}`} type="text" inputMode="decimal" dir="ltr"
      aria-label={label} value={text} placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setText(shown); }}
      onInput={e => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        if (t.trim() === "") { onChange(null); return; }
        const n = parseNumber(t);
        if (n !== null) onChange(kind === "int" ? Math.round(n) : n / scale);
      }} />
  );
}

function Tag({ field, v }: { field: Field; v: Val }) {
  const empty = v === null || (typeof v === "object" && v.base === null);
  if (PROJECT_KEYS.has(field.key)) return empty ? <span class="tag need">{ar.required}</span> : null;
  const def = generalDefault(field.key);
  return JSON.stringify(def) === JSON.stringify(v) ? <span class="tag" title={ar.generalHint}>{ar.generalAssumption}</span> : null;
}

export function FieldRow({ field, values, set, scenarioAll = false }: {
  field: Field; values: Record<Key, Val>; set: SetValues; scenarioAll?: boolean;
}) {
  const v = values[field.key];
  if (field.showIf && !field.showIf(values as never)) return null;
  const id = `in-${field.key}${scenarioAll ? "-all" : ""}`;

  let control;
  if (field.kind === "flag" || field.kind === "choice") {
    control = (
      <div class="seg" role="group" aria-labelledby={`${id}-l`}>
        {field.options!.map(o => (
          <button type="button" aria-pressed={v === o.value} onClick={() => set({ [field.key]: o.value })}>{o.label}</button>
        ))}
      </div>
    );
  } else if (field.scenario && v !== null && typeof v === "object") {
    const sv = v as ScenNum;
    const keys = scenarioAll ? (["conservative", "base", "optimistic"] as const) : (["base"] as const);
    const names = { conservative: "متحفظ", base: "أساسي", optimistic: "متفائل" };
    control = (
      <div class={scenarioAll ? "scen3" : ""}>
        {keys.map(k => (
          <label class="scen-cell">
            {scenarioAll && <span class="scen-name">{names[k]}</span>}
            <NumberBox id={`${id}-${k}`} label={`${field.label} ${names[k]}`} value={sv[k]} kind={field.kind}
              onChange={n => set({ [field.key]: { ...sv, [k]: n } })} />
          </label>
        ))}
      </div>
    );
  } else {
    control = <NumberBox id={id} label={field.label} value={v as Num} kind={field.kind} onChange={n => set({ [field.key]: n })} />;
  }

  return (
    <div class="field">
      <div class="field-head">
        <label id={`${id}-l`} for={field.kind === "flag" || field.kind === "choice" || field.scenario ? undefined : id}>{field.label}</label>
        <Tag field={field} v={v} />
      </div>
      <div class="field-ctl">
        {control}
        {field.unit && <span class="unit">{field.unit}</span>}
      </div>
      {field.hint && <div class="hint">{field.hint}</div>}
    </div>
  );
}

export function FieldGroup({ title, fields, values, set, scenarioAll }: {
  title?: string; fields: Field[]; values: Record<Key, Val>; set: SetValues; scenarioAll?: boolean;
}) {
  return (
    <fieldset class="group">
      {title && <legend>{title}</legend>}
      <div class="fields">
        {fields.map(fl => <FieldRow field={fl} values={values} set={set} scenarioAll={scenarioAll} />)}
      </div>
    </fieldset>
  );
}

export function TextField({ id, label, value, onInput, multiline = false, placeholder, dir }: {
  id: string; label: string; value: string; onInput: (s: string) => void; multiline?: boolean; placeholder?: string; dir?: "ltr" | "rtl";
}) {
  return (
    <div class={`field ${multiline ? "span2" : ""}`}>
      <label class="field-head" for={id}>{label}</label>
      {multiline
        ? <textarea id={id} rows={3} value={value} placeholder={placeholder} onInput={e => onInput((e.target as HTMLTextAreaElement).value)} />
        : <input id={id} class="text-input" value={value} placeholder={placeholder} dir={dir} onInput={e => onInput((e.target as HTMLInputElement).value)} />}
    </div>
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
