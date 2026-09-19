import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "../lib/auth";
import { logout } from "../lib/auth";

const Icon = {
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" /><path d="M9 4v13M15 7v13" />
    </svg>
  ),
  hazard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c.4-3.6 3-5.6 6.2-5.6s5.8 2 6.2 5.6" /><circle cx="17.5" cy="9" r="2.4" /><path d="M17.8 14.2c2.2.2 3.6 1.7 4 4.3" />
    </svg>
  ),
  route: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="18" r="2.2" /><path d="M12 22s5-4.6 5-9.2a5 5 0 0 0-10 0C7 17.4 12 22 12 22Z" transform="translate(5 -12) scale(.7)" /><path d="M8.3 18H15a3 3 0 0 0 0-6H9.5a3 3 0 0 1 0-6H14" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 12h6M10 16h6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /><path d="m14 6 2 2 4-4" />
    </svg>
  ),
  siren: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18v-5a6 6 0 0 1 12 0v5" /><path d="M4 18h16v3H4zM12 3v2M4.5 6l1.4 1.4M19.5 6l-1.4 1.4" />
    </svg>
  ),
};

interface NavItem { to: string; label: string; icon: ReactNode }

const ADMIN_NAV: NavItem[] = [
  { to: "/gis", label: "GIS Dashboard", icon: Icon.map },
  { to: "/hazards", label: "Hazard Intelligence", icon: Icon.hazard },
  { to: "/exposure", label: "Exposure & Vulnerability", icon: Icon.people },
  { to: "/relocation", label: "Relocation Intelligence", icon: Icon.route },
  { to: "/plan", label: "Action Plan", icon: Icon.plan },
  { to: "/validation", label: "Validation & Data", icon: Icon.check },
];
const RESCUE_NAV: NavItem[] = [
  { to: "/emergency", label: "Emergency Response", icon: Icon.siren },
  { to: "/relocation", label: "Evacuation Planner", icon: Icon.route },
];

export default function Layout({ session, children }: { session: Session; children: ReactNode }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const [size, setSize] = useState(0);
  const nav = session.scope === "admin" ? ADMIN_NAV : RESCUE_NAV;
  const carry = new URLSearchParams(loc.search).get("d");
  const home = nav[0].to;
  const headerRef = useRef<HTMLElement>(null);

  // Publish the header height so full-height views (the GIS map) can fill exactly the rest of the screen.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--chrome-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applySize = (next: number) => {
    const n = Math.max(-1, Math.min(2, next));
    setSize(n);
    document.documentElement.style.fontSize = `${15 + n * 1.5}px`;
  };

  return (
    <>
      <a className="skip" href="#main">Skip to main content</a>
      <header ref={headerRef}>
        <div className="gov-top">
          <div className="gov-top-in">
            <span>भारत | India · Smart India Hackathon 2026 · Problem Statement 26191 — Ministry of Home Affairs · NDRF</span>
            <span className="size-btns" aria-label="Text size">
              <button type="button" onClick={() => applySize(size - 1)} aria-label="Decrease text size">A-</button>
              <button type="button" onClick={() => applySize(0)} aria-label="Reset text size">A</button>
              <button type="button" onClick={() => applySize(size + 1)} aria-label="Increase text size">A+</button>
            </span>
          </div>
        </div>
        <div className="brandbar">
          <div className="brandbar-in">
            <NavLink to={home} className="brand" aria-label="TeraShield home">
              <Emblem />
              <span>
                <div className="brand-title">TeraShield<i>.</i></div>
                <div className="brand-sub">National Disaster Risk Intelligence &amp; Relocation Portal</div>
              </span>
            </NavLink>
            <span className="spacer" />
            <span className="badge-ps">SIH 2026 · PS 26191</span>
            <div className="session">
              <span className="who" aria-label="Signed in as">👤 {session.user}</span>
              <button
                className="btn danger sm"
                onClick={() => { logout(); navigate("/login", { replace: true }); window.location.reload(); }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
        <div className="tri" aria-hidden="true" />
        <nav className="nav" aria-label="Primary">
          <div className="nav-in">
            {nav.map((n) => (
              <NavLink key={n.to} to={{ pathname: n.to, search: carry ? `?d=${carry}` : "" }} className={({ isActive }) => (isActive ? "active" : "")}>
                {n.icon}
                {n.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main id="main" style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</main>
      <footer className="footer">
        <div className="footer-in">
          <span>
            TeraShield · Intelligent identification of hazard-based red zones, carrying-capacity assessment and immediate relocation needs for vulnerable habitations.
          </span>
          <span>
            Data: Census 2011 · NASA POWER · NOAA IBTrACS · NASA GLC · SRTM · USGS · WorldPop · NDMA SACHET · OpenStreetMap · Open-Meteo. District boundaries are 2011-era (594 districts) and indicative, not the Survey of India depiction. Prototype with a browser-side demo login (production: SDMA single sign-on) — not for operational decisions.
          </span>
        </div>
      </footer>
    </>
  );
}

export function Emblem({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="#0b3d6e" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#ff9933" strokeWidth="1.3" />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = ((i * 360) / 24) * (Math.PI / 180);
        return <line key={i} x1={32 + 15 * Math.cos(a)} y1={32 + 15 * Math.sin(a)} x2={32 + 22 * Math.cos(a)} y2={32 + 22 * Math.sin(a)} stroke="#0b3d6e" strokeWidth="1" />;
      })}
      <circle cx="32" cy="32" r="6" fill="#138808" />
      <circle cx="32" cy="32" r="3" fill="#fff" />
    </svg>
  );
}
