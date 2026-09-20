import { LIFECYCLE, LIFECYCLE_LABEL, append, unitStates, type LifecycleState, type RegisterEntry } from "./lifecycle";
import { FIELD_CHECKS, assessReport, type FieldReport } from "./ops";
import type { Zone } from "./types";

/**
 * How a District Collector's decisions reach the Zone Register. A verified field report becomes evidence for the Screened → Verified step;
 * every later stage needs an approving officer's name and (for Notified) the order reference — the register itself enforces that.
 */
export const unitIdOfReport = (r: FieldReport): string =>
  r.pilotId != null ? `wayanad-${r.pilotId}` : `field-${r.districtId ?? "x"}-${r.habitation.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export function signsOf(r: FieldReport): string {
  return FIELD_CHECKS.filter((c) => r.checks[c.key]).map((c) => c.en.toLowerCase()).join(", ") || "no warning signs ticked";
}

/** Adds the habitation to the register if needed, then records the field report as the evidence that verifies it. */
export function verifyFieldReport(chain: RegisterEntry[], r: FieldReport, approver: string, fallbackZone: Zone = "ORANGE"): { chain: RegisterEntry[]; error?: string; unit: string } {
  const unit = unitIdOfReport(r);
  let c = chain;
  const a = assessReport(r.checks);
  if (!unitStates(c).has(unit)) {
    const made = append(c, {
      unit, name: r.habitation, kind: "create", zone: r.zone ?? fallbackZone, evidence: "Added from a field report",
      snapshot: { source: "field report", report: r.id, reported_by: r.by, signs: signsOf(r), urgency: a.level },
    });
    if (made.error) return { chain, error: made.error, unit };
    c = made.chain;
  }
  const cur = unitStates(c).get(unit)!;
  const evidence = `Field report ${r.id} by ${r.by}: ${signsOf(r)}${r.note ? ` — ${r.note}` : ""}`;
  if (cur.state === "SCREENED") {
    const step = append(c, { unit, name: r.habitation, kind: "advance", to: "VERIFIED", evidence, evidenceKind: "field_survey", approver, snapshot: { report: r.id, urgency: a.level, score: a.score } });
    return step.error ? { chain, error: step.error, unit } : { chain: step.chain, unit };
  }
  // already past Screened: keep the report on record as a watch note rather than moving the stage
  const note = append(c, { unit, name: r.habitation, kind: "watch", evidence, evidenceKind: "observed_event", approver, snapshot: { report: r.id, urgency: a.level } });
  return note.error ? { chain, error: note.error, unit } : { chain: note.chain, unit };
}

export const nextStage = (s: LifecycleState): LifecycleState | null => LIFECYCLE[LIFECYCLE.indexOf(s) + 1] ?? null;

/** Draft notification text — a template for legal review, never an order. */
export function draftNotification(o: { unit: string; name: string; district: string; state: string; zone: Zone; stage: LifecycleState; reasons: string[]; approver: string; date: Date }): string {
  return [
    "DRAFT — FOR LEGAL REVIEW. NOT AN ORDER.",
    "",
    `Office of the District Collector, ${o.district}, ${o.state}`,
    `Subject: Proposed identification of ${o.name} as an area unsuitable for permanent habitation (${o.zone} zone)`,
    `Date of draft: ${o.date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
    "",
    "1. Basis: the habitation-level screening by TeraShield (open-data terrain, drainage and hazard analysis), followed by field verification " +
      `(current register stage: ${LIFECYCLE_LABEL[o.stage]}).`,
    `2. Reasons recorded: ${o.reasons.length ? o.reasons.join("; ") : "as per the attached field report and screening snapshot"}.`,
    "3. Proposed action: consultation with the Gram Sabha / residents, identification of a receiving site (revenue land first; forest or private land only with the statutory approvals), and a phased relocation plan.",
    "4. Entitlements: as provided under the applicable State Rehabilitation & Resettlement policy and, where land is acquired, the RFCTLARR Act 2013 [officer to confirm].",
    "5. Interim safety: evacuation triggers, warning arrangements and re-entry monitoring remain in force until relocation is complete.",
    "",
    `Proposed by: ${o.approver}`,
    `Register reference: ${o.unit}`,
    "",
    "Attachments to be added by the officer: field verification report, screening snapshot, site proposal, consultation record.",
  ].join("\n");
}
