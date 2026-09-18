import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { VULN_FACTORS } from "../content/exposure";
import { loadHistory, type Dataset } from "../lib/data";
import { contributions, whyText } from "../lib/explain";
import { googleDirections, googleEmbed, googlePlace, googleStreetView } from "../lib/geo";
import { fetchDischarge, fetchOutlook, type DailyOutlook, type Discharge } from "../lib/live";
import type { LiveResult } from "../lib/liveRisk";
import { HAZARDS, HAZARD_BY_KEY, HAZARD_CUTS, TIER_ACTION, TIER_COLOR, TIER_LABEL, ZONE_COLOR, ZONE_MEANING, compact, lakh, returnPeriod } from "../lib/risk";
import type { District, HazardKey, HistoryEvent } from "../lib/types";
import { Bar, HazardClass, ZoneBadge } from "./ui";

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="dd-sec">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h4>{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function DistrictDetail({ d, live, data, onClose }: { d: District; live: LiveResult | null; data: Dataset; onClose: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<HazardKey>(d.dom);
  const [outlook, setOutlook] = useState<DailyOutlook[] | null>(null);
  const [outErr, setOutErr] = useState(false);
  const [dis, setDis] = useState<Discharge | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [sat, setSat] = useState(false);

  useEffect(() => {
    setOpen(d.dom);
    setOutlook(null); setOutErr(false); setDis(null); setEvents([]);
    let alive = true;
    fetchOutlook(d).then((o) => alive && setOutlook(o)).catch(() => alive && setOutErr(true));
    fetchDischarge(d).then((x) => alive && setDis(x)).catch(() => undefined);
    loadHistory().then((h) => alive && setEvents(h[String(d.id)] ?? [])).catch(() => undefined);
    return () => { alive = false; };
  }, [d.id]);

  const go = (path: string) => navigate({ pathname: path, search: `?d=${d.id}` });
  const safe = data.byId.get(d.reloc.safe);
  const vTop = [...d.vf.map((v, i) => ({ v, f: VULN_FACTORS[i] }))].sort((a, b) => b.v - a.v).slice(0, 3);
  const zone = live?.zone ?? d.zone;
  const risk = live?.risk ?? d.risk;
  const isFactor = (h: HazardKey): h is "flood" | "landslide" | "cloudburst" | "coastal" => ["flood", "landslide", "cloudburst", "coastal"].includes(h);

  return (
    <aside className="drawer" aria-label={`${d.n} district details`}>
      <div className="drawer-head" style={{ borderTop: `5px solid ${ZONE_COLOR[zone]}` }}>
        <div className="grow">
          <h3>{d.n}</h3>
          <div className="small muted">{d.s} · {lakh(d.pop)} people · {lakh(d.area)} km²</div>
        </div>
        <button className="btn ghost sm" onClick={onClose} aria-label="Close details">✕</button>
      </div>

      <div className="drawer-body">
        <div className="dd-summary">
          <div>
            <ZoneBadge zone={zone} />
            <div className="tiny muted" style={{ marginTop: 4 }}>{ZONE_MEANING[zone]}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <b className="big num" style={{ color: ZONE_COLOR[zone] }}>{risk.toFixed(0)}%</b>
            <div className="tiny muted">{live ? "72 h multi-hazard" : "annual multi-hazard"}</div>
          </div>
        </div>
        {live && live.escalated && <div className="notice warn small">Escalated by the live forecast: the annual zone is {d.zone}.</div>}

        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => go("/hazards")}>Hazard intelligence</button>
          <button className="btn sm" onClick={() => go("/exposure")}>Exposure &amp; vulnerability</button>
          <button className="btn sm saffron" onClick={() => go("/relocation")}>Plan relocation</button>
        </div>

        <Section title="Hazard probability" aside={<span className="tiny muted">annual{live ? " · 72 h" : ""}</span>}>
          <div className="stack" style={{ gap: 8 }}>
            {HAZARDS.map((h) => {
              const p = d.P[h.key];
              const lp = live?.P[h.key];
              return (
                <button key={h.key} className={`hz-row${open === h.key ? " on" : ""}`} onClick={() => setOpen(h.key)} aria-pressed={open === h.key}>
                  <span className="hz-ico">{h.icon}</span>
                  <span className="grow" style={{ textAlign: "left" }}>
                    <span className="row" style={{ justifyContent: "space-between", gap: 4 }}>
                      <b className="small">{h.label}</b>
                      <span className="small num">
                        <b>{p.toFixed(0)}%</b>
                        {lp != null && <span className={lp > p + 3 ? "up" : lp < p - 3 ? "down" : ""}> → {lp.toFixed(0)}%</span>}
                      </span>
                    </span>
                    <Bar value={lp ?? p} color={HAZARD_BY_KEY[h.key].color} />
                  </span>
                  <HazardClass pct={lp ?? p} />
                </button>
              );
            })}
          </div>
        </Section>

        <Section title={`What is driving ${HAZARD_BY_KEY[open].label.toLowerCase()} risk`} aside={<span className="tiny muted">{returnPeriod(d.P[open])}</span>}>
          <p className="small muted">{whyText(d, open)}</p>
          {isFactor(open) && (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {contributions(d, open).map((c) => (
                <div key={c.label} title={c.hint}>
                  <div className="row small" style={{ justifyContent: "space-between", gap: 6 }}>
                    <span>{c.label} <span className="muted tiny">×{c.weight.toFixed(2)}</span></span>
                    <b className="num">{c.value.toFixed(0)}</b>
                  </div>
                  <Bar value={c.value} color={HAZARD_BY_KEY[open].color} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Live conditions" aside={<span className="tag live">Open-Meteo · live</span>}>
          {!outlook && !outErr && <div className="skeleton" style={{ height: 90 }} />}
          {outErr && <div className="notice info small">Live forecast unavailable right now — the static analysis above is unaffected.</div>}
          {outlook && (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Day</th><th className="r">Rain mm</th><th className="r">Tmax °C</th><th className="r">Gust km/h</th></tr></thead>
                <tbody>
                  {outlook.slice(0, 5).map((o, i) => (
                    <tr key={o.date}>
                      <td>{i === 0 ? "Today" : new Date(o.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}</td>
                      <td className="r" style={{ color: o.rain >= 64.5 ? "var(--red)" : o.rain >= 15 ? "var(--orange)" : undefined, fontWeight: o.rain >= 15 ? 700 : 400 }}>{o.rain.toFixed(0)}</td>
                      <td className="r">{o.tmax.toFixed(0)}</td>
                      <td className="r">{o.gust.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dis && dis.peak7 > 0 && (
            <div className="small" style={{ marginTop: 8 }}>
              <b>River discharge (GloFAS, nearest river cell):</b> {dis.now.toFixed(0)} m³/s now, 7-day peak {dis.peak7.toFixed(0)} m³/s
              {dis.ratio != null && dis.ratio > 0 && <> — <b style={{ color: dis.ratio > 1.5 ? "var(--red)" : undefined }}>{dis.ratio.toFixed(1)}× the median</b></>}.
            </div>
          )}
        </Section>

        <Section title="Exposure &amp; vulnerability">
          <dl className="kv">
            <dt>Population exposed</dt><dd>{compact(d.expo.pop)} ({d.expo.frac.toFixed(0)}%)</dd>
            <dt>Households</dt><dd>{lakh(d.hh)}</dd>
            <dt>Density</dt><dd>{lakh(d.dens)} / km²</dd>
            <dt>Vulnerability</dt><dd>{d.vband} · {d.vuln.toFixed(0)}/100</dd>
            <dt>Risk index (H × E × V)</dt><dd>{d.risk_idx.toFixed(0)}/100</dd>
          </dl>
          <div className="small" style={{ marginTop: 8 }}><b>Most vulnerable on:</b></div>
          <ul className="plain small">
            {vTop.map(({ v, f }) => <li key={f.id}>{f.label} <span className="muted">({v.toFixed(0)}/100)</span></li>)}
          </ul>
        </Section>

        <Section title="Relocation need">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="chip static" style={{ background: TIER_COLOR[d.reloc.tier], color: "#fff", borderColor: TIER_COLOR[d.reloc.tier] }}>{TIER_LABEL[d.reloc.tier]}</span>
            <b className="num">priority {d.reloc.score.toFixed(0)}/100</b>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>{TIER_ACTION[d.reloc.tier]}</p>
          {safe && (
            <p className="small" style={{ marginTop: 6 }}>
              Nearest green-zone district: <b>{safe.n}</b> ({safe.s}), {d.reloc.safe_km} km away.{" "}
              <a href={googleDirections(d, safe)} target="_blank" rel="noreferrer">Directions ↗</a>
            </p>
          )}
        </Section>

        <Section title="Disaster history">
          <dl className="kv">
            <dt>Landslides within 30 km</dt><dd>{d.hist.ls}{d.hist.lsf ? ` · ${lakh(d.hist.lsf)} lives lost` : ""}</dd>
            <dt>Cyclones within 150 km (1990–2023)</dt><dd>{d.hist.cyc}{d.hist.cycs ? ` · ${d.hist.cycs} severe+` : ""}</dd>
          </dl>
          {events.length > 0 && (
            <ul className="plain small" style={{ marginTop: 6 }}>
              {events.map((e, i) => (
                <li key={i}><b>{e.year ?? "—"}</b> · {e.where || e.kind || "landslide"}{e.fat ? ` — ${e.fat} killed` : ""}{e.trigger ? ` (${e.trigger})` : ""}</li>
              ))}
            </ul>
          )}
          <div className="tiny muted" style={{ marginTop: 6 }}>Source: NASA Global Landslide Catalog (media-reported events) and NOAA IBTrACS.</div>
        </Section>

        <Section title="On Google Maps" aside={<button className="btn ghost sm" onClick={() => setSat(!sat)}>{sat ? "Map" : "Satellite"}</button>}>
          <iframe className="gmap" title={`Google Map of ${d.n}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={googleEmbed(d, 9, sat)} />
          <div className="row" style={{ marginTop: 6, gap: 8 }}>
            <a className="small" href={googlePlace(d)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
            <a className="small" href={googleStreetView(d)} target="_blank" rel="noreferrer">Street View ↗</a>
          </div>
        </Section>

        <div className="tiny muted">Hazard classes: ≥ {HAZARD_CUTS.red}% very high · ≥ {HAZARD_CUTS.orange}% high · ≥ {HAZARD_CUTS.yellow}% moderate (annual probability).</div>
      </div>
    </aside>
  );
}
