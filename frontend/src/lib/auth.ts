/**
 * Client-side demo authentication.
 *
 * TeraShield ships as a static site, so there is no server to check credentials against. These are the
 * published demo accounts for the Smart India Hackathon prototype — anyone reading the bundle can see them.
 * A production deployment would put these behind the SDMA's identity provider (SSO / OAuth) with server-side
 * role checks; here the role only decides which screens are offered.
 */
export type Scope = "admin" | "emergency_team" | "district_officer" | "field_team";

export interface Session { user: string; scope: Scope; at: number }

export interface RoleInfo { scope: Scope; label: string; short: string; home: string; who: string; can: string[] }

/** What each role is for — used by the login screen, the header and the docs. */
export const ROLES: Record<Scope, RoleInfo> = {
  admin: {
    scope: "admin", label: "SDMA analyst (admin)", short: "SDMA analyst", home: "/gis",
    who: "State Disaster Management Authority planners",
    can: ["Hazard, exposure and relocation analysis", "Action Plan with budget and exports", "Validation, Data Lab and Zone Register"],
  },
  emergency_team: {
    scope: "emergency_team", label: "Emergency response team", short: "Emergency team", home: "/emergency",
    who: "NDRF / SDRF, district control room, response commanders",
    can: ["Live operations picture and official alerts", "Shelter and resource registers", "Incident log and field-report inbox", "Situation report and evacuation planner"],
  },
  district_officer: {
    scope: "district_officer", label: "District Collector (approving officer)", short: "District officer", home: "/district",
    who: "District Collector, revenue and resettlement officers",
    can: ["Approvals queue: verify field reports, advance red-zone stages", "Draft notifications for legal review", "Action Plan and Zone Register"],
  },
  field_team: {
    scope: "field_team", label: "Field survey team", short: "Field team", home: "/field",
    who: "Aapda Mitra volunteers, ASHA/anganwadi workers, revenue and geology surveyors",
    can: ["Report cracks, seepage and slope movement with GPS and photo", "Works offline; bilingual checklist (English / हिन्दी)"],
  },
};

const ACCOUNTS: Record<string, { password: string; scope: Scope; display: string }> = {
  sih: { password: "sih2026", scope: "admin", display: "sih_admin" },
  rescue: { password: "rescue2026", scope: "emergency_team", display: "rescue_team" },
  dm: { password: "dm2026", scope: "district_officer", display: "district_collector" },
  field: { password: "field2026", scope: "field_team", display: "field_surveyor" },
};

export const DEMO_ACCOUNTS = Object.entries(ACCOUNTS).map(([id, a]) => ({ id, password: a.password, scope: a.scope }));

const KEY = "ts_session_v2";
const MAX_AGE_MS = 8 * 3600 * 1000;

export function login(username: string, password: string): Session | null {
  const acc = ACCOUNTS[username.trim().toLowerCase()];
  if (!acc || acc.password !== password) return null;
  const s: Session = { user: acc.display, scope: acc.scope, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: session lives in memory only */ }
  return s;
}

export function currentSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!(s.scope in ROLES)) return null; // a session from an older build with an unknown role
    return Date.now() - s.at < MAX_AGE_MS ? s : null;
  } catch {
    return null;
  }
}

export function logout() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
