import { INCIDENT_KIND, REPORT_STATUS, RESOURCE_TYPE, SHELTER_KIND, assessReport, shelterHeadroom, shelterSummary, type FieldReport, type Incident, type Resource, type Shelter } from "./ops";
import type { AlertItem, Zone } from "./types";

/**
 * Situation report (SITREP) for the emergency team, composed only from data on screen: the hazard picture, official alerts, and
 * what people have entered into the shelter, resource, incident and field-report registers. Nothing is estimated or filled in.
 */
export interface SitrepInput {
  scope: string; // "Kerala" | "All India" | district
  generated: Date;
  viewLabel: string; // e.g. "72 h alert overlay (live forecast)" or "Replay: Wayanad landslides"
  prepared: string;
  tiers: Record<Zone, number>;
  escalated: number | null;
  concern: { name: string; state: string; zone: Zone; value: number; dom: string; exposed: number }[];
  alerts: AlertItem[];
  shelters: Shelter[];
  resources: Resource[];
  incidents: Incident[];
  reports: FieldReport[];
}

const inr = (n: number) => n.toLocaleString("en-IN");

export function buildSitrep(i: SitrepInput): string {
  const L: string[] = [];
  const when = i.generated.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  L.push(`# Situation report — ${i.scope}`, "", `*${when} · prepared by ${i.prepared} · TeraShield (SIH 2026, PS 26191)*`, "");
  L.push("> Decision support compiled from open data, the NDMA SACHET feed and entries made by the response teams. It does not replace official IMD, CWC or state warnings.", "");

  L.push("## 1. Hazard picture", "", `- View: **${i.viewLabel}**`);
  L.push(`- District hazard tiers: ${i.tiers.RED} very high · ${i.tiers.ORANGE} high · ${i.tiers.YELLOW} moderate · ${i.tiers.GREEN} low`);
  if (i.escalated != null) L.push(`- Alerts raised by the forecast above the baseline: **${i.escalated}** district(s)`);
  L.push("");
  if (i.concern.length) {
    L.push("| # | District | Tier | Risk % | Main threat | People exposed |", "|---|---|---|---|---|---|");
    i.concern.forEach((c, k) => L.push(`| ${k + 1} | ${c.name}, ${c.state} | ${c.zone} | ${c.value.toFixed(0)} | ${c.dom} | ${inr(c.exposed)} |`));
    L.push("");
  }

  L.push("## 2. Official alerts (NDMA SACHET)", "");
  if (!i.alerts.length) L.push("_No active alert in the snapshot for this scope._", "");
  else { i.alerts.slice(0, 10).forEach((a) => L.push(`- **${a.source}** · severity ${a.severity}: ${a.title}`)); L.push(""); }

  const S = shelterSummary(i.shelters);
  L.push("## 3. Shelters", "");
  if (!i.shelters.length) L.push("_No shelters registered._", "");
  else {
    L.push(`${S.count} registered · capacity ${inr(S.capacity)} · occupied ${inr(S.occupied)} · usable headroom ${inr(S.headroom)}${S.lacking ? ` · **${S.lacking} lack water or sanitation**` : ""}${S.overloaded ? ` · **${S.overloaded} over capacity**` : ""}`, "");
    L.push("| Shelter | Type | Status | Occupied / capacity | Water | Sanitation | Contact |", "|---|---|---|---|---|---|---|");
    i.shelters.slice(0, 25).forEach((s) => L.push(`| ${s.name} (${s.district}) | ${SHELTER_KIND[s.kind]} | ${s.status} | ${s.occupied}/${s.capacity} (headroom ${shelterHeadroom(s)}) | ${s.water ? "yes" : "**no**"} | ${s.sanitation ? "yes" : "**no**"} | ${s.contact || "—"} |`));
    L.push("");
  }

  L.push("## 4. Resources", "");
  if (!i.resources.length) L.push("_No resources registered._", "");
  else { i.resources.forEach((r) => L.push(`- ${r.count} × ${RESOURCE_TYPE[r.type]}${r.label ? ` (${r.label})` : ""} — ${r.district || "unassigned"} — **${r.status}**${r.note ? ` — ${r.note}` : ""}`)); L.push(""); }

  const open = i.incidents.filter((x) => x.status === "open").sort((a, b) => b.severity - a.severity);
  L.push("## 5. Incidents", "", `${open.length} open · ${i.incidents.length - open.length} closed`, "");
  open.slice(0, 20).forEach((x) => L.push(`- **[sev ${x.severity}] ${INCIDENT_KIND[x.kind]}** — ${x.district || "—"}: ${x.text} (${new Date(x.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, ${x.by})`));
  if (open.length) L.push("");

  const pending = i.reports.filter((r) => r.status === "submitted" || r.status === "acknowledged" || r.status === "escalated");
  L.push("## 6. Field reports", "", `${i.reports.length} received · ${pending.length} awaiting action`, "");
  pending.slice(0, 15).forEach((r) => { const a = assessReport(r.checks); L.push(`- **${a.level.toUpperCase()}** — ${r.habitation}, ${r.district || "—"} — ${REPORT_STATUS[r.status]} — ${r.by}${r.note ? `: ${r.note}` : ""}`); });
  if (pending.length) L.push("");

  L.push("## Limits", "", "- Shelter, resource, incident and field entries are as typed by their authors; nothing has been independently verified.", "- In this demo the registers live in one browser; production would use a shared server database.");
  return L.join("\n");
}
