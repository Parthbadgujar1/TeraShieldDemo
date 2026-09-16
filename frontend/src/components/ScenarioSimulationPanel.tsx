import React, { useState } from "react";
import api from "../services/api";
import "../styles/ScenarioSimulationPanel.css";

interface ScenarioSimulationPanelProps {
  villageId: string;
  candidateSites: { site_id: string; site_name: string }[];
}

const ScenarioSimulationPanel: React.FC<ScenarioSimulationPanelProps> = ({ villageId, candidateSites }) => {
  const [mode, setMode] = useState<"site" | "route" | null>(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [failSiteId, setFailSiteId] = useState<string>(candidateSites[0]?.site_id || "");
  const [busy, setBusy] = useState(false);
  const [siteResult, setSiteResult] = useState<any>(null);
  const [routeResult, setRouteResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSite = (siteId: string) => {
    setSelectedSiteIds((prev) => (prev.includes(siteId) ? prev.filter((s) => s !== siteId) : [...prev, siteId]));
  };

  const runSiteUnavailable = async () => {
    if (selectedSiteIds.length === 0) {
      setError("Select at least one shelter to mark unavailable");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const res = await api.relocation.simulateSiteUnavailable(villageId, selectedSiteIds);
      setSiteResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Simulation failed");
    } finally {
      setBusy(false);
    }
  };

  const runRouteFailure = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await api.relocation.simulateRouteFailure(villageId, failSiteId);
      setRouteResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Simulation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ssp-container">
      <div className="ssp-header">
        <h3>🧪 Scenario Simulation — "What if…?"</h3>
        <p>Decision intelligence, not just a static plan. Ask what happens if a shelter or route becomes unavailable, before it actually does.</p>
      </div>

      <div className="ssp-mode-tabs">
        <button className={mode === "site" ? "active" : ""} onClick={() => { setMode("site"); setError(null); }}>
          Shelter Unavailable
        </button>
        <button className={mode === "route" ? "active" : ""} onClick={() => { setMode("route"); setError(null); }}>
          Route / Bridge Failure
        </button>
      </div>

      {error && <div className="ssp-error">{error}</div>}

      {mode === "site" && (
        <div className="ssp-body">
          <p className="ssp-instruction">Select shelter(s) to mark unavailable:</p>
          <div className="ssp-site-checkboxes">
            {candidateSites.map((s) => (
              <label key={s.site_id} className="ssp-checkbox">
                <input type="checkbox" checked={selectedSiteIds.includes(s.site_id)} onChange={() => toggleSite(s.site_id)} />
                {s.site_name}
              </label>
            ))}
          </div>
          <button className="ssp-run-btn" onClick={runSiteUnavailable} disabled={busy}>
            {busy ? "Simulating…" : "Run Simulation"}
          </button>

          {siteResult && !siteResult.error && (
            <div className="ssp-result">
              <div className="ssp-compare">
                <div className="ssp-compare-col">
                  <h4>Baseline</h4>
                  {siteResult.baseline_allocation.allocations.map((a: any) => (
                    <div key={a.site_id} className="ssp-alloc-row">
                      <span>{a.site_name}</span>
                      <strong>{a.allocated.toLocaleString()}</strong>
                    </div>
                  ))}
                  <div className="ssp-alloc-row ssp-shortfall-row">
                    <span>Unaccommodated</span>
                    <strong>{siteResult.baseline_allocation.unaccommodated.toLocaleString()}</strong>
                  </div>
                </div>
                <div className="ssp-compare-arrow">→</div>
                <div className="ssp-compare-col">
                  <h4>{siteResult.unavailable_sites.join(", ")} UNAVAILABLE</h4>
                  {siteResult.scenario_allocation.allocations.map((a: any) => (
                    <div key={a.site_id} className="ssp-alloc-row">
                      <span>{a.site_name}</span>
                      <strong>{a.allocated.toLocaleString()}</strong>
                    </div>
                  ))}
                  <div className="ssp-alloc-row ssp-shortfall-row">
                    <span>Unaccommodated</span>
                    <strong>{siteResult.scenario_allocation.unaccommodated.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
              {siteResult.additional_capacity_required > 0 && (
                <div className="ssp-alert">
                  ⚠ {siteResult.additional_capacity_required.toLocaleString()} people would need additional capacity
                  (+{siteResult.delta_unaccommodated.toLocaleString()} vs. baseline) — find an additional site.
                </div>
              )}
              <p className="ssp-note">{siteResult.note}</p>
            </div>
          )}
        </div>
      )}

      {mode === "route" && (
        <div className="ssp-body">
          <p className="ssp-instruction">Select which shelter's route/bridge fails:</p>
          <select value={failSiteId} onChange={(e) => setFailSiteId(e.target.value)} className="ssp-select">
            {candidateSites.map((s) => (
              <option key={s.site_id} value={s.site_id}>{s.site_name}</option>
            ))}
          </select>
          <button className="ssp-run-btn" onClick={runRouteFailure} disabled={busy}>
            {busy ? "Simulating…" : "Run Simulation"}
          </button>

          {routeResult && !routeResult.error && (
            <div className="ssp-result">
              <div className="ssp-route-flow">
                <div className="ssp-route-step">
                  <span className="ssp-route-label">{routeResult.failed_site} route fails</span>
                </div>
                <div className="ssp-route-arrow">↓</div>
                <div className="ssp-route-step">
                  <span className="ssp-route-label">Route recalculation</span>
                </div>
                <div className="ssp-route-arrow">↓</div>
                {routeResult.no_feasible_route_remains ? (
                  <div className="ssp-route-step ssp-route-fail">
                    <span>No feasible route remains — isolation protocol may apply</span>
                  </div>
                ) : (
                  <>
                    <div className="ssp-route-step">
                      <span className="ssp-route-label">
                        Travel time {routeResult.travel_time_delta_min >= 0 ? "+" : ""}{routeResult.travel_time_delta_min} min
                      </span>
                    </div>
                    {routeResult.previously_best_site_now_unreachable && (
                      <>
                        <div className="ssp-route-arrow">↓</div>
                        <div className="ssp-route-step ssp-route-warn">
                          <span>{routeResult.baseline_best_route.site_name} becomes unreachable</span>
                        </div>
                      </>
                    )}
                    <div className="ssp-route-arrow">↓</div>
                    <div className="ssp-route-step ssp-route-final">
                      <span>Select {routeResult.scenario_best_route.site_name}</span>
                    </div>
                  </>
                )}
              </div>
              <p className="ssp-note">{routeResult.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScenarioSimulationPanel;
