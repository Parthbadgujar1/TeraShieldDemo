import React from "react";
import { googleMapsDirectionsUrl } from "../utils/maps";
import ScenarioSimulationPanel from "./ScenarioSimulationPanel";
import "../styles/RelocationPlanView.css";

interface RelocationPlanViewProps {
  plan: any;
  villageLocation: { lat: number; lon: number };
  timeOfDay: "day" | "night";
  onTimeOfDayChange: (v: "day" | "night") => void;
  onDownloadPdf: () => void;
  downloadingPdf: boolean;
}

const STATE_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE_DISASTER: { label: "Active Disaster", cls: "active" },
  IMMINENT: { label: "Imminent Event", cls: "imminent" },
  PREDICTED: { label: "Predicted / Pre-Disaster Planning", cls: "predicted" },
  MONITOR: { label: "Monitor", cls: "monitor" },
};

const RelocationPlanView: React.FC<RelocationPlanViewProps> = ({
  plan,
  villageLocation,
  timeOfDay,
  onTimeOfDayChange,
  onDownloadPdf,
  downloadingPdf,
}) => {
  const stateInfo = STATE_LABELS[plan.time_state.state] || { label: plan.time_state.state, cls: "monitor" };

  return (
    <div className="rpv-container">
      <div className="rpv-toolbar">
        <div className={`rpv-time-state rpv-time-state-${stateInfo.cls}`}>
          {stateInfo.label}
        </div>
        <div className="rpv-toolbar-controls">
          <div className="rpv-daynight-toggle">
            <button
              className={timeOfDay === "day" ? "active" : ""}
              onClick={() => onTimeOfDayChange("day")}
            >
              ☀ Day
            </button>
            <button
              className={timeOfDay === "night" ? "active" : ""}
              onClick={() => onTimeOfDayChange("night")}
            >
              🌙 Night
            </button>
          </div>
          <button className="rpv-pdf-btn" onClick={onDownloadPdf} disabled={downloadingPdf}>
            {downloadingPdf ? "Preparing…" : "⬇ Offline Plan (PDF)"}
          </button>
        </div>
      </div>

      <p className="rpv-time-desc">{plan.time_state.description}</p>

      {plan.isolation ? (
        <div className="rpv-isolation-banner">
          <div className="rpv-isolation-title">🚨 CRITICAL ISOLATION</div>
          <div className="rpv-isolation-grid">
            <div><span>Population trapped</span><strong>{plan.isolation.population_trapped.toLocaleString()}</strong></div>
            <div><span>Vulnerable trapped</span><strong>{plan.isolation.vulnerable_population_trapped.toLocaleString()}</strong></div>
            <div><span>Children</span><strong>{plan.isolation.children.toLocaleString()}</strong></div>
            <div><span>Elderly</span><strong>{plan.isolation.elderly.toLocaleString()}</strong></div>
            <div><span>Water route feasible</span><strong>{plan.isolation.water_route_feasible ? "YES" : "NO"}</strong></div>
            <div><span>Nearest landing zone</span><strong>{plan.isolation.nearest_potential_landing_zone_km} km ({plan.isolation.landing_zone_block})</strong></div>
          </div>
          <div className="rpv-isolation-action">
            {plan.isolation.airlift_assessment_required
              ? "SPECIALIZED RESCUE / AIRLIFT ASSESSMENT RECOMMENDED"
              : "BOAT EVACUATION ASSESSMENT RECOMMENDED"}
          </div>
          <p className="rpv-note">{plan.isolation.note}</p>
        </div>
      ) : (
        <>
          <div className="rpv-grid">
            <div className="rpv-card">
              <h3>Population</h3>
              <div className="rpv-row"><span>Total</span><strong>{plan.population.total.toLocaleString()}</strong></div>
              <div className="rpv-row highlight"><span>Population exposed</span><strong>{plan.population.population_exposed.toLocaleString()}</strong></div>
              <div className="rpv-row highlight"><span>Vulnerable (assisted evac.)</span><strong>{plan.population.vulnerable_population_exposed.toLocaleString()}</strong></div>
            </div>

            <div className="rpv-card">
              <h3>Mobility Recommendation</h3>
              <div className={`rpv-mode-badge rpv-mode-${plan.mobility_recommendation.escalation_level}`}>
                {plan.mobility_recommendation.recommended_mode.replace(/_/g, " ").toUpperCase()}
              </div>
              <p className="rpv-reasoning">{plan.mobility_recommendation.reasoning}</p>
              {plan.best_route?.night_adjustment && (
                <p className="rpv-night-note">🌙 {plan.best_route.night_adjustment}</p>
              )}
            </div>
          </div>

          <div className="rpv-section">
            <h3>Candidate Routes (safest feasible, not shortest)</h3>
            <table className="rpv-routes-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Safety</th>
                  <th>Distance</th>
                  <th>ETA</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plan.routes.map((r: any) => (
                  <tr key={r.site_id} className={r.site_id === plan.best_route?.site_id ? "rpv-best-route" : ""}>
                    <td>{r.site_name}{r.site_id === plan.best_route?.site_id && <span className="rpv-best-tag">BEST</span>}</td>
                    <td><span className={`rpv-route-status rpv-status-${r.route_status.toLowerCase()}`}>{r.route_status}</span></td>
                    <td>{r.safety_score}/100</td>
                    <td>{r.distance_km} km</td>
                    <td>{r.travel_time_min} min</td>
                    <td>
                      {r.route_status !== "BLOCKED" && (
                        <a
                          className="rpv-directions-link"
                          href={googleMapsDirectionsUrl(villageLocation, r.location)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          🧭
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.site_allocation && (
            <div className="rpv-section">
              <h3>Site Allocation{plan.site_allocation.additional_site_search_required && " — ADDITIONAL SITE NEEDED"}</h3>
              <div className="rpv-allocations">
                {plan.site_allocation.allocations.map((a: any) => (
                  <div className="rpv-allocation-row" key={a.site_id}>
                    <span className="rpv-alloc-name">{a.site_name}</span>
                    <span className="rpv-alloc-pop">{a.allocated.toLocaleString()} people</span>
                    <span className="rpv-alloc-limit">limited by: {a.limiting_factor}</span>
                  </div>
                ))}
                {plan.site_allocation.unaccommodated > 0 && (
                  <div className="rpv-allocation-shortfall">
                    ⚠ {plan.site_allocation.unaccommodated.toLocaleString()} people unaccommodated — search for an additional site
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rpv-grid">
            <div className="rpv-card">
              <h3>Evacuation Waves</h3>
              {plan.waves.map((w: any) => (
                <div className="rpv-row highlight" key={w.wave}>
                  <span>Wave {w.wave} ({w.priority}) — {w.group.replace(/_/g, " ")}</span>
                  <strong>{w.population.toLocaleString()}</strong>
                </div>
              ))}
            </div>

            <div className="rpv-card">
              <h3>Resources Required</h3>
              <div className="rpv-row"><span>Buses</span><strong>{plan.resource_requirements.buses_required}</strong></div>
              <div className="rpv-row"><span>Ambulances</span><strong>{plan.resource_requirements.ambulances_required}</strong></div>
              <div className="rpv-row"><span>Boats</span><strong>{plan.resource_requirements.boats_required}</strong></div>
              <div className="rpv-row highlight">
                <span>Helicopter required</span>
                <strong>{plan.resource_requirements.helicopter_required ? "YES" : "NO"}</strong>
              </div>
            </div>
          </div>

          <div className={`rpv-feasibility ${plan.feasibility.feasible === false ? "rpv-feasibility-fail" : ""}`}>
            <strong>{plan.feasibility.feasible === false ? "⚠ NOT FEASIBLE within available time" : "✓ Feasible within available time"}</strong>
            <p>{plan.feasibility.note}</p>
          </div>
        </>
      )}

      <ScenarioSimulationPanel
        villageId={plan.village_id}
        candidateSites={plan.routes.map((r: any) => ({ site_id: r.site_id, site_name: r.site_name }))}
      />

      <div className="rpv-footer">
        <div className="rpv-footer-item">
          <span>Priority Tier</span>
          <strong>{plan.relocation_priority_tier.toUpperCase()}</strong>
        </div>
        <div className="rpv-footer-item">
          <span>Confidence</span>
          <strong>{plan.confidence}%</strong>
        </div>
        <div className="rpv-footer-item rpv-status">
          <strong>{plan.status}</strong>
        </div>
      </div>
      <p className="rpv-human-note">{plan.human_in_the_loop_note}</p>
    </div>
  );
};

export default RelocationPlanView;
