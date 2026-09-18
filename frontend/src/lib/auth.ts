/**
 * Client-side demo authentication.
 *
 * TeraShield ships as a static site, so there is no server to check credentials against. These are the
 * published demo accounts for the Smart India Hackathon prototype — anyone reading the bundle can see them.
 * A production deployment would put these behind the SDMA's identity provider (SSO / OAuth).
 */
export type Scope = "admin" | "emergency_team";

export interface Session { user: string; scope: Scope; at: number }

const ACCOUNTS: Record<string, { password: string; scope: Scope; display: string }> = {
  sih: { password: "sih2026", scope: "admin", display: "sih_admin" },
  rescue: { password: "rescue2026", scope: "emergency_team", display: "rescue_team" },
};

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
    return Date.now() - s.at < MAX_AGE_MS ? s : null;
  } catch {
    return null;
  }
}

export function logout() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
