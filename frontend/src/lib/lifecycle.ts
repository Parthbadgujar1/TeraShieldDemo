import type { Zone } from "./types";

/**
 * Red-zone lifecycle register: a state machine that only ratchets upward, with a hash-chained, tamper-evident log.
 *
 *   Screened → Verified → Notified → Relocating → Vacated → Monitored
 *
 * Live data may push a zone UP (or add a watch note) at any time. Moving a zone DOWN needs recorded evidence (completed mitigation,
 * field survey, expert review) plus an officer's sign-off, and is refused once relocation is under way. Each transition stores a snapshot of the
 * inputs the system saw and is chained to the previous entry with SHA-256, so an edited or deleted entry breaks verification.
 *
 * In this static demo the chain lives in the browser (localStorage) and proves internal consistency only; production would keep it in
 * append-only server storage anchored to a notarised digest.
 */
export type LifecycleState = "SCREENED" | "VERIFIED" | "NOTIFIED" | "RELOCATING" | "VACATED" | "MONITORED";
export const LIFECYCLE: LifecycleState[] = ["SCREENED", "VERIFIED", "NOTIFIED", "RELOCATING", "VACATED", "MONITORED"];

export const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  SCREENED: "Screened (model)", VERIFIED: "Verified (field / GSI survey)", NOTIFIED: "Notified (DM order)",
  RELOCATING: "Relocating", VACATED: "Vacated", MONITORED: "Monitored (re-entry watch)",
};

export const ZONE_RANK: Record<Zone, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

export type EntryKind = "create" | "advance" | "escalate" | "downgrade" | "watch";
export type EvidenceKind = "" | "mitigation_completed" | "field_survey" | "expert_review" | "observed_event" | "forecast_alert";
export const EVIDENCE_LABEL: Record<Exclude<EvidenceKind, "">, string> = {
  mitigation_completed: "Mitigation works completed",
  field_survey: "Field / GSI survey",
  expert_review: "Expert review",
  observed_event: "Observed event (new scar, erosion, crack)",
  forecast_alert: "Forecast / official alert",
};
const DOWNGRADE_EVIDENCE: EvidenceKind[] = ["mitigation_completed", "field_survey", "expert_review"];

export interface RegisterEntry {
  seq: number;
  ts: string;
  unit: string;
  name: string;
  kind: EntryKind;
  from: LifecycleState | null;
  to: LifecycleState;
  zone: Zone;
  prevZone: Zone | null;
  evidenceKind: EvidenceKind;
  evidence: string;
  approver: string;
  snapshot: Record<string, string | number | null>;
  prev: string;
  hash: string;
}

export interface UnitState { unit: string; name: string; state: LifecycleState; zone: Zone; watch: string | null; entries: number; last: string }

export const GENESIS = "0".repeat(64);

// ---------------------------------------------------------------- SHA-256 (sync, dependency-free)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const l = bytes.length;
  const withPad = new Uint8Array((((l + 9 + 63) >> 6) << 6));
  withPad.set(bytes);
  withPad[l] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 8, Math.floor((l * 8) / 0x100000000));
  dv.setUint32(withPad.length - 4, (l * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

// ---------------------------------------------------------------- chain
type Payload = Omit<RegisterEntry, "hash">;

function canonical(p: Payload): string {
  return JSON.stringify([p.seq, p.ts, p.unit, p.name, p.kind, p.from, p.to, p.zone, p.prevZone, p.evidenceKind, p.evidence, p.approver, Object.entries(p.snapshot).sort(([a], [b]) => a.localeCompare(b)), p.prev]);
}

export const hashEntry = (p: Payload) => sha256(canonical(p));

export function verifyChain(chain: RegisterEntry[]): { ok: boolean; brokenAt: number | null; reason: string } {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (e.seq !== i + 1) return { ok: false, brokenAt: i, reason: `entry ${i + 1} has sequence ${e.seq} (an entry was removed or reordered)` };
    if (e.prev !== prev) return { ok: false, brokenAt: i, reason: `entry ${e.seq} does not link to the previous entry` };
    const { hash, ...rest } = e;
    if (hashEntry(rest) !== hash) return { ok: false, brokenAt: i, reason: `entry ${e.seq} was edited after it was recorded` };
    prev = hash;
  }
  return { ok: true, brokenAt: null, reason: "" };
}

export function unitStates(chain: RegisterEntry[]): Map<string, UnitState> {
  const m = new Map<string, UnitState>();
  for (const e of chain) {
    const cur = m.get(e.unit);
    m.set(e.unit, {
      unit: e.unit, name: e.name, state: e.to, zone: e.zone, entries: (cur?.entries ?? 0) + 1, last: e.ts,
      watch: e.kind === "watch" ? e.evidence : cur?.watch ?? null,
    });
  }
  return m;
}

export interface Draft {
  unit: string;
  name: string;
  kind: EntryKind;
  /** target lifecycle state for "advance"; ignored otherwise */
  to?: LifecycleState;
  /** target zone for escalate/downgrade/create */
  zone?: Zone;
  evidenceKind?: EvidenceKind;
  evidence?: string;
  approver?: string;
  snapshot?: Record<string, string | number | null>;
  ts?: string;
}

/** Applies the rules and returns the new chain, or the reason the transition is refused. */
export function append(chain: RegisterEntry[], d: Draft): { chain: RegisterEntry[]; error?: string } {
  const cur = unitStates(chain).get(d.unit);
  const fail = (error: string) => ({ chain, error });
  const evidence = (d.evidence ?? "").trim();
  const approver = (d.approver ?? "").trim();
  let to: LifecycleState;
  let zone: Zone;

  if (d.kind === "create") {
    if (cur) return fail("This habitation is already in the register.");
    if (!d.zone) return fail("Choose the screened zone.");
    to = "SCREENED"; zone = d.zone;
  } else {
    if (!cur) return fail("Add the habitation to the register first.");
    to = cur.state; zone = cur.zone;
    if (d.kind === "advance") {
      const next = LIFECYCLE[LIFECYCLE.indexOf(cur.state) + 1];
      if (!next) return fail("Already at the final state (Monitored).");
      if (d.to !== next) return fail(`Only the next stage is allowed: ${LIFECYCLE_LABEL[next]}. States cannot be skipped or reversed.`);
      if (!approver) return fail("An approving officer is required to advance a stage.");
      if (next === "NOTIFIED" && !evidence) return fail("Record the notification order / reference before marking Notified.");
      to = next;
    } else if (d.kind === "escalate") {
      if (!d.zone || ZONE_RANK[d.zone] <= ZONE_RANK[cur.zone]) return fail("Escalation must raise the zone; live evidence can only push a zone up.");
      if (!evidence) return fail("Describe the evidence (new scar, forecast alert, event).");
      zone = d.zone;
    } else if (d.kind === "downgrade") {
      if (!d.zone || ZONE_RANK[d.zone] >= ZONE_RANK[cur.zone]) return fail("Downgrade must lower the zone.");
      if (["RELOCATING", "VACATED"].includes(cur.state)) return fail("A zone cannot be lowered while relocation is under way or the land is vacated.");
      if (!DOWNGRADE_EVIDENCE.includes(d.evidenceKind ?? "")) return fail("Lowering a zone needs evidence: completed mitigation works, a field survey or an expert review.");
      if (!evidence) return fail("Describe the evidence in words (report reference, date).");
      if (!approver) return fail("An approving officer's sign-off is required to lower a zone.");
      zone = d.zone;
    } else if (d.kind === "watch") {
      if (!evidence) return fail("Describe what is being watched.");
    }
  }

  const payload: Payload = {
    seq: chain.length + 1, ts: d.ts ?? new Date().toISOString(), unit: d.unit, name: d.name, kind: d.kind,
    from: cur?.state ?? null, to, zone, prevZone: cur?.zone ?? null, evidenceKind: d.evidenceKind ?? "", evidence, approver,
    snapshot: d.snapshot ?? {}, prev: chain.length ? chain[chain.length - 1].hash : GENESIS,
  };
  return { chain: [...chain, { ...payload, hash: hashEntry(payload) }] };
}

const KEY = "ts_register_v1";
export function loadRegister(): RegisterEntry[] {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as RegisterEntry[]) : []; } catch { return []; }
}
export function saveRegister(chain: RegisterEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(chain)); } catch { /* private mode */ }
}
