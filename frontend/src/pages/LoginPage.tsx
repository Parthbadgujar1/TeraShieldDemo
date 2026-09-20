import { useState, type FormEvent } from "react";
import { Emblem } from "../components/Layout";
import { login, type Session } from "../lib/auth";

const FEATURES = [
  ["Multi-hazard screening → habitation red zones", "Flood, landslide, cloudburst, cyclone and coastal-erosion screening for 594 districts, with habitation-level red-zone polygons for a pilot district."],
  ["Exposure & vulnerability", "Who and what sits in each hazard footprint, and how badly they would be hurt."],
  ["Relocation intelligence", "Safe destinations, carrying capacity, hazard-aware road routes and a phased evacuation plan."],
  ["72-hour alert overlay", "Forecast rain and wind raise alerts on top of the evidence-based baseline — a dry week never relabels land as safe."],
];

export default function LoginPage({ onLogin }: { onLogin: (s: Session) => void }) {
  const [user, setUser] = useState("sih");
  const [pass, setPass] = useState("sih2026");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = login(user, pass);
    if (!s) setError("Incorrect user ID or password. Use one of the demo accounts below.");
    else onLogin(s);
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-info" aria-label="About TeraShield">
          <Emblem size={58} />
          <p className="eyebrow">Smart India Hackathon 2026 · PS 26191</p>
          <h1>TeraShield</h1>
          <p className="lead">
            Intelligent identification of hazard-based red zones, carrying-capacity assessment and immediate relocation
            needs for vulnerable habitations.
          </p>
          <ul>
            {FEATURES.map(([t, d]) => (
              <li key={t}><b>{t}</b><span>{d}</span></li>
            ))}
          </ul>
          <p className="foot">Ministry of Home Affairs · National Disaster Response Force (NDRF), DM Division</p>
        </section>

        <section className="login-form" aria-label="Sign in">
          <form onSubmit={submit}>
            <h2>Secure portal login</h2>
            <p className="muted small">Authorised personnel only</p>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="u">User ID</label>
              <input id="u" type="text" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="p">Password</label>
              <input id="p" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
            </div>
            {error && <div className="notice err" role="alert" style={{ marginTop: 12 }}>{error}</div>}
            <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 16, padding: "11px 14px" }} type="submit">
              Sign in to portal →
            </button>
          </form>

          <div className="demo-creds">
            <div className="label">Demo access</div>
            <button type="button" onClick={() => { setUser("sih"); setPass("sih2026"); setError(""); }}>
              <span>Admin · State Disaster Management</span><code>sih / sih2026</code>
            </button>
            <button type="button" onClick={() => { setUser("rescue"); setPass("rescue2026"); setError(""); }}>
              <span>Emergency Response Team</span><code>rescue / rescue2026</code>
            </button>
          </div>
          <p className="tiny muted">
            Prototype environment. The demo credentials are checked in the browser; a production deployment would use the
            SDMA's single sign-on.
          </p>
        </section>
      </div>
    </div>
  );
}
