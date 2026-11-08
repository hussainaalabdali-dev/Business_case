import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { quickVerdict, run } from "../../engine-ts/src";
import type { EngineResult, Thresholds } from "../../engine-ts/src";
import { api, ApiError } from "./api";
import type { Summary } from "./api";
import { ResultsPanel } from "./components/results";
import { INITIAL_THRESHOLDS, Step1, Step2, Step3, Step4 } from "./components/steps";
import type { Key } from "./fields";
import { blankDraft, fromStored, toEngine } from "./project";
import type { Draft, DraftBoq, Meta, Val } from "./project";
import { ar } from "./i18n/ar";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "unavailable";
const DRAFT_KEY = "bc-draft-v2";

function loadDraft(): { name: string; draft: Draft; id: string | null } | null {
  try {
    const s = localStorage.getItem(DRAFT_KEY);
    if (!s) return null;
    const d = JSON.parse(s) as { name: string; draft: unknown; id: string | null };
    return { ...d, draft: fromStored(d.draft) };
  } catch { return null; }
}
function storeDraft(d: { name: string; draft: Draft; id: string | null }) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked: fine */ }
}

function Projects({ onOpen, onClose, currentId }: { onOpen: (id: string) => void; onClose: () => void; currentId: string | null }) {
  const [list, setList] = useState<Summary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = () => api.list().then(setList).catch(e => setErr(e instanceof ApiError && (e.status === 503 || e.status === 403) ? ar.saveUnavailable : ar.loadFailed));
  useEffect(() => { void load(); }, []);
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="pj-title" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="dialog">
        <div class="panel-head"><h2 id="pj-title">{ar.myProjects}</h2><button type="button" class="ghost" onClick={onClose}>{ar.close}</button></div>
        {err && <p class="warn">{err}</p>}
        {list && list.length === 0 && <p class="muted">{ar.noProjects}</p>}
        {list && list.length > 0 && (
          <ul class="plist">
            {list.map(p => (
              <li class={p.id === currentId ? "current" : ""}>
                <div><b>{p.name}</b><small class="muted"> · {ar.lastEdit} <span class="num">{new Date(p.updated_at).toLocaleDateString("en-GB")}</span></small></div>
                <div class="actions">
                  <button type="button" onClick={() => onOpen(p.id)}>{ar.open}</button>
                  <button type="button" class="ghost" onClick={() => api.copy(p.id).then(load)}>{ar.copy}</button>
                  {confirm === p.id
                    ? <><button type="button" class="danger" onClick={() => api.remove(p.id).then(() => { setConfirm(null); void load(); })}>{ar.confirmDelete}</button>
                        <button type="button" class="ghost" onClick={() => setConfirm(null)}>{ar.cancel}</button></>
                    : <button type="button" class="ghost" onClick={() => setConfirm(p.id)}>{ar.del}</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function App() {
  const draft = useMemo(loadDraft, []);
  const [project, setProject] = useState<Draft>(draft?.draft ?? blankDraft());
  const [name, setName] = useState(draft?.name ?? "");
  const [projectId, setProjectId] = useState<string | null>(draft?.id ?? null);
  const [step, setStep] = useState(0);
  const [save, setSave] = useState<SaveState>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [showIntro, setShowIntro] = useState(!draft);
  const [licence, setLicence] = useState(1);
  const [th, setTh] = useState<Thresholds>(INITIAL_THRESHOLDS);
  const skipSave = useRef(true);

  useEffect(() => { api.me().then(m => setEmail(m.email)).catch(() => setSave("unavailable")); }, []);

  const conv = useMemo(() => toEngine(project), [project]);
  const inputs = conv.inputs;
  const { r, error } = useMemo((): { r: EngineResult | null; error: string | null } => {
    if (!inputs) return { r: null, error: null };
    try { return { r: run(inputs), error: null }; } catch (e) { return { r: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [inputs]);
  const tgt = typeof project.values.TgtMargin === "number" ? project.values.TgtMargin : 0;
  const verdict = r ? quickVerdict(r.Margin, tgt) : null;

  const set = (patch: Partial<Record<Key, Val>>) => setProject(p => ({ ...p, values: { ...p.values, ...patch } }));
  const setMeta = (patch: Partial<Meta>) => setProject(p => ({ ...p, meta: { ...p.meta, ...patch } }));
  const setBoq = (boq: DraftBoq[]) => setProject(p => ({ ...p, boq }));

  // Local draft always; server autosave (debounced) when signed in.
  useEffect(() => {
    storeDraft({ name, draft: project, id: projectId });
    if (skipSave.current) { skipSave.current = false; return; }
    if (save === "unavailable") return;
    setSave("dirty");
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        const nm = name.trim() || ar.untitled;
        if (projectId) await api.update(projectId, nm, project);
        else setProjectId((await api.create(nm, project)).id);
        setSave("saved");
      } catch (e) {
        setSave(e instanceof ApiError && (e.status === 503 || e.status === 403) ? "unavailable" : "error");
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [project, name]);

  const startNew = () => {
    skipSave.current = true;
    setProject(blankDraft()); setName(""); setProjectId(null); setStep(0); setShowIntro(true);
    if (save !== "unavailable") setSave("idle");
  };
  const openProject = async (id: string) => {
    const p = await api.get(id);
    skipSave.current = true;
    setProject(fromStored(p.inputs)); setName(p.name); setProjectId(p.id); setStep(0); setShowProjects(false); setShowIntro(false); setSave("saved");
  };

  const saveLabel: Record<SaveState, string> = {
    idle: "", dirty: ar.unsaved, saving: ar.saving, saved: ar.saved, error: ar.saveFailed, unavailable: ar.saveUnavailable,
  };
  const props = { draft: project, set, setMeta, setBoq, inputs, r, scenariosComplete: conv.scenariosComplete };

  return (
    <div class="app">
      <header class="top">
        <div class="brand">{ar.appName}</div>
        <input class="pname" aria-label={ar.projectName} placeholder={ar.projectName} value={name}
          onInput={e => setName((e.target as HTMLInputElement).value)} />
        <span class={`save s-${save}`} role="status">{saveLabel[save]}</span>
        <div class="top-actions">
          <button type="button" class="ghost" onClick={() => setShowProjects(true)}>{ar.myProjects}</button>
          <button type="button" onClick={startNew}>{ar.newProject}</button>
        </div>
      </header>
      {email && <div class="who muted">{ar.signedInAs} <span dir="ltr">{email}</span></div>}

      <nav class="stepper" aria-label="الخطوات">
        {ar.steps.map((s, i) => (
          <button type="button" class={i === step ? "on" : ""} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
            <span class="num">{i + 1}</span>{s}
          </button>
        ))}
      </nav>

      <div class="layout">
        <main class="work">
          {showIntro && <p class="intro">{ar.newProjectIntro}</p>}
          <h1>{ar.steps[step]}</h1>
          <p class="muted">{ar.stepHints[step]}</p>
          {step === 0 && <Step1 {...props} />}
          {step === 1 && <Step2 {...props} />}
          {step === 2 && <Step3 {...props} />}
          {step === 3 && <Step4 {...props} licence={licence} setLicence={setLicence} th={th} setTh={setTh} />}
          <div class="pager">
            <button type="button" class="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>{ar.prev}</button>
            <button type="button" disabled={step === 3} onClick={() => setStep(step + 1)}>{ar.next}</button>
          </div>
        </main>
        <ResultsPanel r={r} verdict={verdict} tgt={tgt} error={error} missing={conv.missing} onGo={setStep} />
      </div>
      <footer class="foot">{ar.disclaimer}</footer>
      {showProjects && <Projects onOpen={id => void openProject(id)} onClose={() => setShowProjects(false)} currentId={projectId} />}
    </div>
  );
}
