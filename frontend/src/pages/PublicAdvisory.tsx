import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Emblem } from "../components/Layout";
import { Bar, DistrictPicker, ErrorBox, Loading } from "../components/ui";
import { HAZARD_INFO } from "../content/hazards";
import { loadAlerts, useDataset } from "../lib/data";
import { NATIONAL_NUMBERS } from "../lib/ops";
import { HAZARDS, ZONE_COLOR, ZONE_HAZARDS } from "../lib/risk";
import type { AlertFeed } from "../lib/types";

type Lang = "en" | "hi";

const T = {
  title: { en: "Community advisory", hi: "समुदाय सलाह" },
  sub: { en: "Know your area's hazards and what to do. No sign-in needed.", hi: "अपने क्षेत्र के खतरे और क्या करना है — जानें। साइन-इन की ज़रूरत नहीं।" },
  pick: { en: "Choose your state and district", hi: "अपना राज्य और ज़िला चुनें" },
  tier: { en: "Hazard level in your district", hi: "आपके ज़िले में खतरे का स्तर" },
  tiers: {
    RED: { en: "Very high", hi: "बहुत अधिक" }, ORANGE: { en: "High", hi: "अधिक" }, YELLOW: { en: "Moderate", hi: "मध्यम" }, GREEN: { en: "Low", hi: "कम" },
  },
  main: { en: "Main hazards here", hi: "यहाँ मुख्य खतरे" },
  alerts: { en: "Official alerts naming your district", hi: "आपके ज़िले के लिए आधिकारिक चेतावनियाँ" },
  none: { en: "No official alert names your district right now.", hi: "अभी किसी आधिकारिक चेतावनी में आपका ज़िला नहीं है।" },
  before: { en: "Be ready", hi: "तैयार रहें" },
  during: { en: "If it happens", hi: "यदि आपदा आए" },
  after: { en: "Afterwards", hi: "आपदा के बाद" },
  help: { en: "Get help", hi: "मदद पाएँ" },
  find: { en: "Find near you (opens Google Maps)", hi: "अपने पास खोजें (Google Maps खुलेगा)" },
  warn: { en: "Warning signs on a slope — cracks, tilting trees or poles, muddy water, rumbling. Move away and call 1077 / 112.", hi: "ढलान पर चेतावनी के संकेत — दरारें, झुके पेड़/खंभे, मटमैला पानी, गड़गड़ाहट। तुरंत हट जाएँ और 1077 / 112 पर कॉल करें।" },
  disclaimer: {
    en: "This page is decision support built on open data. It is not an official warning and does not replace IMD, CWC, NDMA or your district administration. District levels are a screening tier, not a statement about your house or village.",
    hi: "यह पृष्ठ खुले डेटा पर आधारित निर्णय-सहायता है। यह आधिकारिक चेतावनी नहीं है और IMD, CWC, NDMA या ज़िला प्रशासन का विकल्प नहीं है। ज़िले का स्तर केवल प्राथमिक आकलन है, आपके घर या गाँव के बारे में कथन नहीं।",
  },
} as const;

const HAZ_HI: Record<string, string> = { flood: "बाढ़", landslide: "भूस्खलन", cloudburst: "बादल फटना", coastal: "तटीय कटाव", cyclone: "चक्रवात", heatwave: "लू" };

/** Public, no-login advisory: the district's hazard level, official alerts, plain-language actions and where to get help. */
export default function PublicAdvisory() {
  const { data, error } = useDataset();
  const [lang, setLang] = useState<Lang>(() => { try { return (localStorage.getItem("ts_lang") as Lang) || "en"; } catch { return "en"; } });
  const [stateF, setStateF] = useState("");
  const [id, setId] = useState<number | null>(null);
  const [feed, setFeed] = useState<AlertFeed | null>(null);
  useEffect(() => { loadAlerts().then(setFeed).catch(() => undefined); }, []);
  const setL = (l: Lang) => { setLang(l); try { localStorage.setItem("ts_lang", l); } catch { /* private mode */ } };
  const t = (k: { en: string; hi: string }) => k[lang];

  const d = data && id != null ? data.byId.get(id) ?? null : null;
  const top = useMemo(() => (d ? [...ZONE_HAZARDS].sort((a, b) => d.P[b.key] - d.P[a.key]).slice(0, 3) : []), [d]);
  const alerts = feed && d ? feed.alerts.filter((a) => a.districts.includes(d.id)) : [];
  const info = top.length ? HAZARD_INFO[top[0].key] : null;
  const near = (q: string) => d ? `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${d.lat},${d.lon},11z` : "#";

  return (
    <>
      <header>
        <div className="brandbar"><div className="brandbar-in">
          <Link to="/login" className="brand" aria-label="TeraShield"><Emblem /><span><div className="brand-title">TeraShield<i>.</i></div><div className="brand-sub">Community advisory · समुदाय सलाह</div></span></Link>
          <span className="spacer" />
          <div className="seg" role="group" aria-label="Language"><button className={lang === "en" ? "on" : ""} onClick={() => setL("en")}>English</button><button className={lang === "hi" ? "on" : ""} onClick={() => setL("hi")}>हिन्दी</button></div>
          <Link className="btn sm" to="/login">Officer sign-in</Link>
        </div></div>
      </header>
      <main className="page" style={{ maxWidth: 960 }}>
        <div className="page-head"><div className="grow"><h1>{t(T.title)}</h1><p>{t(T.sub)}</p></div></div>
        {error && <ErrorBox text={error} />}
        {!data && !error && <Loading text="Loading…" />}
        {data && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <div className="label">{t(T.pick)}</div>
              <div className="filters"><DistrictPicker states={data.states} byState={data.byState} stateValue={stateF} districtId={id} onState={(s) => { setStateF(s); setId(null); }} onDistrict={setId} /></div>
            </div>

            {d && (
              <>
                <div className="card" style={{ borderTop: `6px solid ${ZONE_COLOR[d.zone]}` }}>
                  <div className="card-pad stack" style={{ gap: 6 }}>
                    <div className="label">{t(T.tier)} · {d.n}, {d.s}</div>
                    <div style={{ fontSize: "1.9rem", fontWeight: 800, color: ZONE_COLOR[d.zone] }}>{t(T.tiers[d.zone])}</div>
                    <div className="small muted">{lang === "en" ? "Screening level from open data: rainfall, terrain, rivers, coast, cyclone and landslide history." : "खुले डेटा पर आधारित प्राथमिक स्तर: वर्षा, भू-आकृति, नदियाँ, तट, चक्रवात व भूस्खलन का इतिहास।"}</div>
                  </div>
                </div>

                <div className="card card-pad stack" style={{ gap: 10 }}>
                  <h3>{t(T.main)}</h3>
                  {top.map((h) => (
                    <div key={h.key}>
                      <div className="row" style={{ justifyContent: "space-between" }}><b>{h.icon} {lang === "hi" ? HAZ_HI[h.key] : HAZARDS.find((x) => x.key === h.key)!.label}</b><span className="small">{d.P[h.key].toFixed(0)}% {lang === "en" ? "chance in a year" : "प्रति वर्ष संभावना"}</span></div>
                      <Bar value={d.P[h.key]} color={HAZARDS.find((x) => x.key === h.key)!.color} />
                    </div>
                  ))}
                  <div className="notice warn small">{t(T.warn)}</div>
                </div>

                <div className="card card-pad stack" style={{ gap: 8 }}>
                  <h3>{t(T.alerts)}</h3>
                  {alerts.length === 0 ? <div className="small muted">{t(T.none)}</div> : (
                    <ul className="plain small">{alerts.slice(0, 4).map((a) => <li key={a.id}><b>{a.source}</b>: {a.title}</li>)}</ul>
                  )}
                  <div className="tiny muted">NDMA SACHET · {feed ? new Date(feed.fetched).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "…"}</div>
                </div>

                {info && (
                  <div className="card card-pad stack" style={{ gap: 8 }}>
                    <h3>{info.name} — {lang === "en" ? "what to do" : "क्या करें"}{lang === "hi" ? <span className="tiny muted"> (English)</span> : null}</h3>
                    {(["before", "during", "after"] as const).map((k) => (
                      <div key={k}><div className="label">{t(T[k])}</div><ul className="plain small">{info[k].slice(0, 5).map((x) => <li key={x}>{x}</li>)}</ul></div>
                    ))}
                  </div>
                )}

                <div className="grid g2" style={{ alignItems: "start" }}>
                  <div className="card card-pad stack" style={{ gap: 8 }}>
                    <h3>{t(T.help)}</h3>
                    <dl className="kv">{NATIONAL_NUMBERS.map(([n, l]) => [<dt key={`l${n}`}>{l}</dt>, <dd key={`n${n}`}><a href={`tel:${n}`}>{n}</a></dd>])}</dl>
                  </div>
                  <div className="card card-pad stack" style={{ gap: 8 }}>
                    <h3>{t(T.find)}</h3>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <a className="btn sm" href={near("relief camp OR shelter")} target="_blank" rel="noreferrer">{lang === "en" ? "Shelters" : "आश्रय"}</a>
                      <a className="btn sm" href={near("school")} target="_blank" rel="noreferrer">{lang === "en" ? "Schools" : "स्कूल"}</a>
                      <a className="btn sm" href={near("hospital")} target="_blank" rel="noreferrer">{lang === "en" ? "Hospitals" : "अस्पताल"}</a>
                      <a className="btn sm" href={near("police station")} target="_blank" rel="noreferrer">{lang === "en" ? "Police" : "पुलिस"}</a>
                    </div>
                    <p className="tiny muted">{lang === "en" ? "Listings are from Google Maps, not from the district's official shelter list — confirm with the control room (1077)." : "सूची Google Maps से है, ज़िले की आधिकारिक आश्रय सूची से नहीं — कृपया 1077 पर पुष्टि करें।"}</p>
                  </div>
                </div>
              </>
            )}
            <p className="tiny muted">{t(T.disclaimer)}</p>
          </div>
        )}
      </main>
    </>
  );
}
