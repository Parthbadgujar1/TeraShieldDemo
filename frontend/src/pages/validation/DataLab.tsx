import { useEffect, useMemo, useRef, useState } from "react";
import { UPLOAD_KEY } from "../ActionPlan";
import { ZoneBadge } from "../../components/ui";
import { CSV_TEMPLATE, SCHEMA, autoMap, classify, districtBoxes, parseCsv, parseGeoJson, validateRows, type Classified, type Habitation, type Issue, type Parsed } from "../../lib/dataLab";
import { loadDistrictGeo, loadPilot, useDataset } from "../../lib/data";
import { download, reasonText } from "../../lib/plan";
import { TIER_COLOR, TIER_LABEL, lakh } from "../../lib/risk";
import type { Pilot } from "../../lib/types";

export default function DataLab() {
  const { data } = useDataset();
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [geo, setGeo] = useState<{ id?: number | string; geometry: any }[] | null>(null);
  const [habs, setHabs] = useState<Habitation[]>([]);
  const [zones, setZones] = useState<{ geometry: any; name: string }[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [saved, setSaved] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const zoneInp = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPilot().then(setPilot).catch(() => undefined);
    loadDistrictGeo().then((g) => setGeo(g.features)).catch(() => undefined);
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setSaved(false);
    setFileName(file.name);
    const text = await file.text();
    if (/\.(geo)?json$/i.test(file.name) || text.trim().startsWith("{")) {
      const r = parseGeoJson(text);
      setHabs(r.habitations); setIssues(r.issues); setParsed(null);
      if (r.zones.length) setZones((z) => [...z, ...r.zones]);
    } else {
      const rows = parseCsv(text);
      const p = validateRows(rows, autoMap(rows[0] ?? []));
      setParsed(p); setHabs(p.habitations); setIssues(p.issues);
    }
  };

  const onZones = async (file: File | undefined) => {
    if (!file) return;
    const r = parseGeoJson(await file.text());
    setZones(r.zones);
    setIssues((i) => [...i.filter((x) => !x.text.startsWith("Red-zone layer")), ...r.issues.map((x) => ({ ...x, text: `Red-zone layer: ${x.text}` })), ...(r.zones.length ? [] : [{ row: null, level: "error" as const, text: "Red-zone layer: no Polygon features found." }])]);
    setSaved(false);
  };

  const results: Classified[] = useMemo(() => {
    if (!data || !geo || !habs.length) return [];
    const boxes = districtBoxes();
    return habs.map((h) => classify(h, { data, districtGeo: geo, pilot, userZones: zones }, boxes)).sort((a, b) => b.item.score - a.item.score);
  }, [data, geo, habs, pilot, zones]);

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warning");
  const unmatched = results.filter((r) => !r.matched).length;

  const save = () => {
    try { localStorage.setItem(UPLOAD_KEY, JSON.stringify(results.filter((r) => r.matched).map((r) => r.item))); setSaved(true); window.dispatchEvent(new StorageEvent("storage", { key: UPLOAD_KEY })); } catch { setSaved(false); }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="notice info small">
        Bring your own habitation list. Files are read <b>in your browser</b> and never uploaded anywhere. Columns are auto-mapped and validated; each point is placed in its district and scored with the same
        priority formula as the national model. Inside a pilot district, terrain red/orange polygons override the district tier; an optional GeoJSON of your own red-zone polygons overrides both.
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <h3>1 · Habitations</h3>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn saffron" onClick={() => inp.current?.click()}>Choose CSV or GeoJSON</button>
            <button className="btn ghost" onClick={() => download("terashield-habitations-template.csv", "text/csv", CSV_TEMPLATE)}>Download template</button>
            <input ref={inp} type="file" accept=".csv,.tsv,.txt,.json,.geojson" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="small muted">{fileName ? `Loaded ${fileName}` : "No file yet."}</div>
          <table className="t">
            <thead><tr><th>Column</th><th>Required</th><th>Accepted headers</th><th>Mapped</th></tr></thead>
            <tbody>
              {SCHEMA.map((c) => (
                <tr key={c.key}>
                  <td><b>{c.key}</b><div className="tiny muted">{c.desc}</div></td>
                  <td>{c.required ? "yes" : "no"}</td>
                  <td className="tiny">{c.aliases.slice(0, 5).join(", ")}</td>
                  <td>{parsed ? (parsed.mapping[c.key] != null ? <span className="tag osm">{parsed.headers[parsed.mapping[c.key]!]}</span> : <span className={`tag ${c.required ? "gap" : "derived"}`}>{c.required ? "missing" : "auto"}</span>) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card card-pad stack" style={{ gap: 10 }}>
          <h3>2 · Your red-zone polygons (optional)</h3>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => zoneInp.current?.click()}>Choose GeoJSON polygons</button>
            {zones.length > 0 && <button className="btn ghost" onClick={() => setZones([])}>Clear ({zones.length})</button>}
            <input ref={zoneInp} type="file" accept=".json,.geojson" hidden onChange={(e) => { onZones(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <p className="small muted">Any Polygon / MultiPolygon in WGS-84 (e.g. a state landslide-susceptibility layer or a survey). Points inside become RED with reason “inside uploaded red-zone polygon”.</p>
          <h3>Validation</h3>
          {!fileName && <div className="muted small">Upload a file to see the validation report.</div>}
          {fileName && errors.length === 0 && <div className="notice info small">✓ {habs.length} habitation{habs.length === 1 ? "" : "s"} passed validation{parsed ? ` (${parsed.rowsRead} rows read)` : ""}.{warns.length ? ` ${warns.length} warning${warns.length === 1 ? "" : "s"}.` : ""}</div>}
          {errors.length > 0 && <div className="notice err small"><b>{errors.length} problem{errors.length === 1 ? "" : "s"} — those rows were skipped.</b></div>}
          {issues.length > 0 && (
            <ul className="plain tiny" style={{ maxHeight: 190, overflow: "auto" }}>
              {issues.slice(0, 60).map((i, k) => <li key={k} style={{ color: i.level === "error" ? "var(--red)" : "var(--orange)" }}>{i.row ? `Row ${i.row}: ` : ""}{i.text}</li>)}
              {issues.length > 60 && <li className="muted">…and {issues.length - 60} more</li>}
            </ul>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>3 · Classified habitations</h3>
            <span className="tiny muted">{results.length} rows{unmatched ? ` · ${unmatched} outside every district polygon` : ""}</span>
            <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
              <button className="btn sm saffron" onClick={save}>{saved ? "Saved ✓ — open the Action Plan" : "Use in the Action Plan"}</button>
            </div>
          </div>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 420 }}>
            <table className="t">
              <thead><tr><th>Habitation</th><th>District</th><th>Zone</th><th className="r">Priority</th><th>Horizon</th><th className="r">People</th><th>Basis</th></tr></thead>
              <tbody>
                {results.slice(0, 300).map(({ item, how, matched }) => (
                  <tr key={item.id}>
                    <td><b>{item.name}</b></td>
                    <td>{matched ? <>{item.district}<div className="tiny muted">{item.state}</div></> : <span className="tag gap">no district</span>}</td>
                    <td>{matched && <ZoneBadge zone={item.zone} label={item.zone[0] + item.zone.slice(1).toLowerCase()} />}</td>
                    <td className="r"><b>{matched ? item.score.toFixed(0) : "—"}</b></td>
                    <td>{matched && <span className="chip static" style={{ background: TIER_COLOR[item.tier], color: "#fff", borderColor: TIER_COLOR[item.tier], fontSize: "0.7rem", padding: "1px 7px" }}>{item.tier === "monitor" ? "Monitor" : TIER_LABEL[item.tier].split(" (")[0]}</span>}</td>
                    <td className="r">{lakh(item.pop)}</td>
                    <td className="small">{how}{item.reasons.length ? ` · ${item.reasons.map(reasonText).join(", ")}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
