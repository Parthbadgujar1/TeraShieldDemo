import { useEffect, useMemo, useRef, useState } from "react";
import { DistrictPicker, ErrorBox, Loading } from "../components/ui";
import { currentSession } from "../lib/auth";
import { loadPilot, useDataset } from "../lib/data";
import { FIELD_CHECKS, KEYS, REPORT_STATUS, assessReport, compressPhoto, uid, useStore, type FieldCheck, type FieldReport } from "../lib/ops";
import { reasonText } from "../lib/plan";
import type { Pilot, Zone } from "../lib/types";

const LEVEL = {
  routine: { en: "Routine", hi: "सामान्य", color: "var(--good)" },
  watch: { en: "Watch", hi: "निगरानी", color: "var(--orange)" },
  urgent: { en: "URGENT", hi: "अत्यावश्यक", color: "var(--red)" },
} as const;

/**
 * Field Survey — for Aapda Mitra volunteers, ASHA / anganwadi workers and surveyors. Mobile-first, bilingual, works without a network
 * (the report is saved on the phone). Reports feed the emergency inbox and, once escalated, the District Collector's approvals queue.
 */
export default function FieldSurvey() {
  const { data, error } = useDataset();
  const user = currentSession()?.user ?? "field_surveyor";
  const [reports, setReports] = useStore<FieldReport>(KEYS.reports);
  const [pilot, setPilot] = useState<Pilot | null>(null);
  useEffect(() => { loadPilot().then(setPilot).catch(() => undefined); }, []);

  const [stateF, setStateF] = useState("");
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [pilotId, setPilotId] = useState<number | "">("");
  const [habitation, setHabitation] = useState("");
  const [where, setWhere] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const [checks, setChecks] = useState<Partial<Record<FieldCheck, boolean>>>({});
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const d = districtId != null ? data?.byId.get(districtId) ?? null : null;
  const isPilot = !!(pilot && d && pilot.district.id === d.id);
  const pilotList = useMemo(() => (isPilot && pilot ? [...pilot.villages].filter((v) => v.zone === "RED" || v.zone === "ORANGE").sort((a, b) => b.score - a.score) : []), [isPilot, pilot]);
  const a = assessReport(checks);
  const mine = reports.filter((r) => r.by === user).sort((x, y) => y.ts.localeCompare(x.ts));

  if (error) return <div className="page"><ErrorBox text={error} /></div>;
  if (!data) return <Loading text="Loading…" />;

  const locate = () => {
    if (!navigator.geolocation) { setMsg({ ok: false, text: "This device cannot give a location." }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setWhere({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) }); setMsg(null); },
      () => setMsg({ ok: false, text: "Location is off or not allowed. Tap the map link later or type the place name." }), { enableHighAccuracy: true, timeout: 15000 });
  };

  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const p = await compressPhoto(f);
    setBusy(false);
    if (!p) setMsg({ ok: false, text: "Could not read that photo." }); else { setPhoto(p); setMsg(null); }
  };

  const pickPilot = (v: number | "") => {
    setPilotId(v);
    const vv = pilot?.villages.find((x) => x.id === v);
    if (vv) { setHabitation(vv.name); setWhere((w) => (w.lat == null ? { lat: vv.lat, lon: vv.lon } : w)); }
  };

  const submit = () => {
    if (!habitation.trim()) { setMsg({ ok: false, text: "Enter the habitation name. / बस्ती का नाम लिखें।" }); return; }
    const pv = pilotId !== "" ? pilot?.villages.find((x) => x.id === pilotId) : null;
    const rep: FieldReport = {
      id: uid("fr"), ts: new Date().toISOString(), by: user, habitation: habitation.trim(), districtId: d?.id ?? null, district: d?.n ?? "", state: d?.s ?? "",
      pilotId: pv ? pv.id : null, zone: (pv?.zone as Zone | undefined) ?? null, lat: where.lat, lon: where.lon, checks, note: note.trim(), photo, status: "submitted",
    };
    setReports([rep, ...reports]);
    setChecks({}); setNote(""); setPhoto(null); setWhere({ lat: null, lon: null }); setHabitation(""); setPilotId("");
    if (fileRef.current) fileRef.current.value = "";
    setMsg({ ok: true, text: a.level === "urgent" ? "Saved. This looks URGENT — also call the district control room (1077) or 112 now. / सहेजा गया। यह अत्यावश्यक है — तुरंत 1077 या 112 पर कॉल करें।" : "Report saved. / रिपोर्ट सहेज ली गई।" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="page field">
      <div className="page-head">
        <div className="grow">
          <h1>Field Survey <span className="muted" style={{ fontWeight: 500 }}>· क्षेत्र सर्वेक्षण</span></h1>
          <p>Report warning signs in a habitation in a minute. Your report goes to the district control room and, if serious, to the District Collector. The form works without internet; the report is saved on this phone.</p>
        </div>
      </div>

      {msg && <div className={`notice ${msg.ok ? "info" : "err"}`} role="status" style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>1 · Where? <span className="muted">कहाँ?</span></h3></div>
        <div className="card-pad stack" style={{ gap: 12 }}>
          <div className="filters">
            <DistrictPicker states={data.states} byState={data.byState} stateValue={stateF} districtId={districtId}
              onState={(s) => { setStateF(s); setDistrictId(null); setPilotId(""); }} onDistrict={(id) => { setDistrictId(id); setPilotId(""); }} />
          </div>
          {isPilot && (
            <div className="field">
              <label htmlFor="pv">Habitation from the screening list (red / orange first)</label>
              <select id="pv" value={pilotId} onChange={(e) => pickPilot(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">— choose, or type the name below —</option>
                {pilotList.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.zone} · ~{v.pop} people</option>)}
              </select>
              {pilotId !== "" && (() => { const v = pilot!.villages.find((x) => x.id === pilotId); return v ? <span className="tiny muted">Why screened {v.zone}: {v.reasons.map(reasonText).join("; ") || "surrounding terrain"}</span> : null; })()}
            </div>
          )}
          <div className="field"><label htmlFor="hb">Habitation / village name · बस्ती का नाम</label><input id="hb" type="text" value={habitation} onChange={(e) => setHabitation(e.target.value)} autoComplete="off" /></div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn ghost" onClick={locate}>📍 Use my location · मेरी लोकेशन</button>
            <span className="small muted">{where.lat != null ? `${where.lat}, ${where.lon}` : "optional · वैकल्पिक"}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>2 · What do you see? <span className="muted">आप क्या देख रहे हैं?</span></h3><span className="tiny muted">tap all that apply · जो लागू हो दबाएँ</span></div>
        <div className="card-pad stack" style={{ gap: 8 }}>
          {FIELD_CHECKS.map((c) => (
            <button key={c.key} type="button" className={`sign${checks[c.key] ? " on" : ""}`} aria-pressed={!!checks[c.key]} onClick={() => setChecks({ ...checks, [c.key]: !checks[c.key] })}>
              <span className="box">{checks[c.key] ? "✓" : ""}</span>
              <span><b>{c.en}</b><span className="hi">{c.hi}</span></span>
            </button>
          ))}
          <div className="notice small" style={{ borderColor: LEVEL[a.level].color, background: "#fff", color: "var(--ink)" }}>
            <b style={{ color: LEVEL[a.level].color }}>{LEVEL[a.level].en} · {LEVEL[a.level].hi}</b> — {a.text}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>3 · Details <span className="muted">विवरण</span></h3></div>
        <div className="card-pad stack" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="nt">Note · टिप्पणी</label><textarea id="nt" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. crack about 2 m long behind the temple, widened after last night's rain" style={{ width: "100%", padding: 8, border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", font: "inherit" }} /></div>
          <div className="field">
            <span className="label">Photo · फोटो</span>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
            {busy && <span className="small"><span className="spinner" /> processing…</span>}
            {photo && <img src={photo} alt="Attached" style={{ maxHeight: 130, borderRadius: 6, border: "1px solid var(--line)", marginTop: 6 }} />}
          </div>
          <button type="button" className="btn saffron" style={{ justifyContent: "center", padding: "13px 14px", fontSize: "1rem" }} onClick={submit}>Submit report · रिपोर्ट भेजें</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>My reports <span className="muted">मेरी रिपोर्ट</span></h3><span className="tiny muted">{mine.length}</span></div>
        <ul className="incidents">
          {mine.slice(0, 20).map((r) => {
            const as = assessReport(r.checks);
            return (
              <li key={r.id} style={{ borderLeftColor: LEVEL[as.level].color }}>
                <div className="row small" style={{ justifyContent: "space-between", gap: 8 }}><b>{r.habitation}</b><span className="tiny muted">{new Date(r.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                <div className="small"><b style={{ color: LEVEL[as.level].color }}>{LEVEL[as.level].en}</b> · {REPORT_STATUS[r.status]}{r.review?.note ? ` — ${r.review.note}` : ""}</div>
              </li>
            );
          })}
          {mine.length === 0 && <li className="muted small" style={{ borderLeftColor: "transparent" }}>No reports yet.</li>}
        </ul>
      </div>

      <div className="notice warn small">
        <b>In danger? खतरे में हैं?</b> Do not wait to submit a report — call <b>112</b> (emergency) or your district control room <b>1077</b>, and move people away from the slope, stream and cracks.
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>Prototype: reports are saved in this browser and appear in the emergency inbox on the same browser. Production would sync them to the SDMA server (SMS / WhatsApp / IVR channels planned).</p>
    </div>
  );
}
