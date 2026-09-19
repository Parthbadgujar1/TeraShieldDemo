import { useEffect, useMemo, useState } from "react";
import { ErrorBox, Loading, Bar } from "../../components/ui";
import { loadValidation, useDataset } from "../../lib/data";
import type { Validation } from "../../lib/types";

const f2 = (v: number) => v.toFixed(2);
const p0 = (v: number) => `${(v * 100).toFixed(0)}%`;

function Row({ label, auc, cap, color, note }: { label: string; auc: number; cap?: number; color?: string; note?: string }) {
  return (
    <div>
      <div className="row small" style={{ justifyContent: "space-between" }}>
        <span>{label}{note && <span className="muted tiny"> · {note}</span>}</span>
        <b className="num">AUC {f2(auc)}{cap != null ? ` · top-20% catches ${p0(cap)}` : ""}</b>
      </div>
      <Bar value={(auc - 0.5) * 200} color={color} large />
    </div>
  );
}

export default function Backtest() {
  const { data } = useDataset();
  const [v, setV] = useState<Validation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadValidation().then(setV).catch((e) => setErr(String(e.message || e))); }, []);

  const stab = useMemo(() => {
    if (!data) return null;
    const imm = data.districts.filter((d) => d.reloc.tier === "immediate");
    const solid = imm.filter((d) => d.reloc.stab >= 80).length;
    const shaky = [...imm].sort((a, b) => a.reloc.stab - b.reloc.stab).slice(0, 8);
    const med = [...data.districts].map((d) => d.reloc.stab).sort((a, b) => a - b)[Math.floor(data.districts.length / 2)];
    return { n: imm.length, solid, shaky, med };
  }, [data]);

  if (err) return <ErrorBox text={`Could not load validation results: ${err}`} />;
  if (!v) return <Loading text="Loading validation…" />;
  const L = v.landslide;
  const S = L.sensitivity;
  const maxHit = Math.max(...L.deciles.map((d) => d.hit_rate), 0.01);
  const maxH = Math.max(...S.histogram, 1);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="notice info small">
        <b>How we test the model.</b> The weights come from research, so we check them against what actually happened. The model is <b>frozen on data up to {L.split.freeze_year}</b> and
        scored against landslides catalogued in {L.split.test_years[0]}–{L.split.test_years[1]}. Nothing here is tuned on the test years. Only landslides and cyclones have an open event record we could ingest;
        <b> {v.not_validated.join(", ")} are not validated</b>.
      </div>

      <div className="grid g4">
        <div className="stat"><b>{f2(L.model.auc)}</b><span>landslide AUC on held-out events (95% CI {f2(L.model.ci[0])}–{f2(L.model.ci[1])})</span></div>
        <div className="stat"><b>{p0(L.model.top20_capture)}</b><span>of districts with a later landslide sit in the top-20% scored ({L.model.lift_top20.toFixed(1)}× random)</span></div>
        <div className="stat"><b>{f2(v.cyclone.auc)}</b><span>cyclone AUC: 1990–{v.cyclone.split.train[1]} frequency predicting {v.cyclone.split.test[0]}–{v.cyclone.split.test[1]} storms</span></div>
        <div className="stat"><b>{f2(S.auc.min)}–{f2(S.auc.max)}</b><span>landslide AUC range over {S.runs} random weight sets (default {f2(S.default_auc)})</span></div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>Landslide: model vs baselines</h3><span className="tiny muted">{L.districts_with_test_events} of {L.districts} districts had a catalogued landslide in the test years</span></div>
          <div className="card-pad stack" style={{ gap: 10 }}>
            <Row label="TeraShield landslide score" auc={L.model.auc} cap={L.model.top20_capture} color="var(--navy)" note={`history frozen at ${L.split.freeze_year}`} />
            <Row label="Terrain only" auc={L.baselines.terrain_only.auc} cap={L.baselines.terrain_only.top20_capture} color="#8a5a2b" />
            <Row label="Without any event history" auc={L.baselines.no_history.auc} cap={L.baselines.no_history.top20_capture} color="#8a5a2b" note="terrain + rain + rivers" />
            <Row label="“Past events only” baseline" auc={L.baselines.history_only.auc} cap={L.baselines.history_only.top20_capture} color="#c2185b" note="count of catalogued events ≤ 2014" />
            <Row label="Random" auc={0.5} cap={0.2} color="#9aa7b5" />
            <div className="notice warn small">
              <b>Honest reading:</b> a plain count of past catalogued events (AUC {f2(L.baselines.history_only.auc)}) beats the composite score. Landslides cluster where they are reported, so the catalogue's own history is a strong predictor.
              The score's value is what history cannot give: it still reaches AUC {f2(L.baselines.no_history.auc)} with <i>no</i> event history, so it can rank districts that have never had a reported event.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Hit rate by score decile</h3><span className="tiny muted">share of districts in each decile with a later landslide</span></div>
          <div className="card-pad stack" style={{ gap: 6 }}>
            {L.deciles.map((d) => (
              <div key={d.decile} className="row small" style={{ gap: 8, flexWrap: "nowrap" }}>
                <span style={{ width: 92 }}>{d.decile === 1 ? "Top 10%" : d.decile === 10 ? "Bottom 10%" : `Decile ${d.decile}`}</span>
                <div className="grow"><Bar value={(d.hit_rate / maxHit) * 100} color="var(--navy)" /></div>
                <b className="num" style={{ width: 44, textAlign: "right" }}>{p0(d.hit_rate)}</b>
              </div>
            ))}
            <p className="tiny muted">A well-ordered score falls steadily from the top decile to the bottom. The tail stays above zero because the catalogue reports events within ~33 km of a district boundary and some lowland districts have slope failures (embankments, mines).</p>
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>“Why 0.45 and not 0.55?” — weight sensitivity</h3><span className="tiny muted">{S.runs} random weight sets · {S.concentration}</span></div>
          <div className="card-pad stack" style={{ gap: 8 }}>
            <div className="hist" role="img" aria-label="Histogram of AUC across random weight sets">
              {S.histogram.map((c, i) => <i key={i} style={{ height: `${(c / maxH) * 100}%` }} title={`${c} runs`} />)}
            </div>
            <div className="row tiny muted" style={{ justifyContent: "space-between" }}><span>AUC {f2(S.histogram_range[0])}</span><span>{f2(S.histogram_range[1])}</span></div>
            <p className="small">Perturbing the four landslide weights at random moves held-out AUC only between <b>{f2(S.auc.min)}</b> and <b>{f2(S.auc.max)}</b> (median {f2(S.auc.median)}; 90% of runs {f2(S.auc.p5)}–{f2(S.auc.p95)}). The ranking is not fragile to the exact weights; the default sits near the middle.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Cross-check: fitted weights (logistic regression)</h3></div>
          <div className="card-pad stack" style={{ gap: 8 }}>
            <p className="small muted">Trained on pre-{L.split.freeze_year + 1} labels using terrain, rain and rivers only (no history), tested on later events.</p>
            <table className="t">
              <thead><tr><th>Factor</th><th className="r">Research weight (share)</th><th className="r">Fitted importance</th></tr></thead>
              <tbody>
                {L.logistic.features.map((f, i) => (
                  <tr key={f}><td>{f === "stream" ? "Stream proximity" : f[0].toUpperCase() + f.slice(1)}</td><td className="r">{p0(L.logistic.research_relative[i])}</td><td className="r"><b>{p0(L.logistic.relative_importance[i])}</b></td></tr>
                ))}
              </tbody>
            </table>
            <p className="small">Held-out AUC: fitted <b>{f2(L.logistic.auc_holdout)}</b> vs research weights on the same features <b>{f2(L.logistic.auc_research_same_features)}</b>. The data lean towards terrain and away from rain and rivers; the gain is modest, so we keep the research weights, document the direction and treat this as explainable multi-criteria analysis rather than a black-box “AI” claim.</p>
          </div>
        </div>
      </div>

      {stab && (
        <div className="card">
          <div className="card-head"><h3>Relocation priority — rank stability</h3><span className="tiny muted">1,000 random weight sets (Dirichlet around 0.35 / 0.25 / 0.15 / 0.15 / 0.10)</span></div>
          <div className="card-pad grid g2">
            <div>
              <p className="small">Median district keeps its tier in <b>{stab.med.toFixed(0)}%</b> of runs. Of {stab.n} Immediate-tier districts, <b>{stab.solid}</b> stay Immediate in at least 80% of runs — those are the ones to fund first without argument. Each district's own stability is on its detail panel.</p>
            </div>
            <div>
              <div className="label">Least certain Immediate districts</div>
              <ul className="plain small">{stab.shaky.map((d) => <li key={d.id}><b>{d.n}</b> ({d.s}) — Immediate in {d.reloc.stab.toFixed(0)}% of runs</li>)}</ul>
            </div>
          </div>
        </div>
      )}

      <div className="card card-pad stack" style={{ gap: 6 }}>
        <h3>Limits you should read before quoting a number</h3>
        <ul className="plain small">{v.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        <p className="tiny muted">Reproduce with <code>python data-pipeline/validate.py</code> (writes <code>validation.json</code>). Generated {v.generated}.</p>
      </div>
    </div>
  );
}
