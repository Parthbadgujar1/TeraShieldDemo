import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { googleMapsDirectionsUrl } from "../utils/maps";
import "../styles/RescueMissionPage.css";

const RESCUE_ICONS: Record<string, string> = {
  bus: "🚍", truck_4wd: "🚚", boat: "🚤", helicopter_assessment_required: "🚁",
};

const RescueMissionPage: React.FC = () => {
  const { villageId } = useParams<{ villageId: string }>();
  const navigate = useNavigate();
  const [mission, setMission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!villageId) return;
    api.emergency.getRescueMission(villageId)
      .then((res) => setMission(res.data))
      .catch(() => setError("Failed to load rescue mission data"))
      .finally(() => setLoading(false));
  }, [villageId]);

  if (loading) return <div className="loading">Loading rescue mission…</div>;
  if (error || !mission) return <div className="error-banner">{error || "Mission not found"}</div>;

  return (
    <div className="rmp-container">
      <button className="rmp-back" onClick={() => navigate("/emergency")}>← Back to Dashboard</button>

      <div className="rmp-header">
        <h1>{mission.name}</h1>
        <span className={`rmp-hazard-badge rmp-risk-${mission.hazard.risk_category.toLowerCase()}`}>
          {mission.hazard.risk_category}
        </span>
      </div>
      <p className="rmp-subtitle">{mission.district_id} — {mission.hazard.type} (score {mission.hazard.multi_hazard_score.toFixed(2)})</p>

      {mission.isolation ? (
        <div className="rmp-isolation-banner">
          <div className="rmp-isolation-title">🚨 CRITICAL ISOLATION</div>
          <div className="rmp-isolation-grid">
            <div><span>Population trapped</span><strong>{mission.isolation.population_trapped.toLocaleString()}</strong></div>
            <div><span>Vulnerable trapped</span><strong>{mission.isolation.vulnerable_population_trapped.toLocaleString()}</strong></div>
            <div><span>Children</span><strong>{mission.isolation.children.toLocaleString()}</strong></div>
            <div><span>Elderly</span><strong>{mission.isolation.elderly.toLocaleString()}</strong></div>
            <div><span>Water route feasible</span><strong>{mission.isolation.water_route_feasible ? "YES" : "NO"}</strong></div>
            <div><span>Landing zone</span><strong>{mission.isolation.nearest_potential_landing_zone_km} km ({mission.isolation.landing_zone_block})</strong></div>
          </div>
          <div className="rmp-isolation-action">
            {mission.recommended_operation}
          </div>
          <p className="rmp-note">{mission.isolation.note}</p>
        </div>
      ) : (
        <div className="rmp-grid">
          <div className="rmp-card">
            <h3>Population</h3>
            <div className="rmp-row highlight"><span>Immediate rescue</span><strong>{mission.population.immediate_rescue.toLocaleString()}</strong></div>
            <div className="rmp-row highlight"><span>Assisted rescue</span><strong>{mission.population.assisted_rescue.toLocaleString()}</strong></div>
            <div className="rmp-row"><span>Medical priority</span><strong>{mission.population.medical_priority_est.toLocaleString()}</strong></div>
            <div className="rmp-row"><span>Children</span><strong>{mission.population.children.toLocaleString()}</strong></div>
            <div className="rmp-row"><span>Elderly</span><strong>{mission.population.elderly.toLocaleString()}</strong></div>
          </div>

          <div className="rmp-card">
            <h3>Access Status</h3>
            <div className="rmp-row"><span>Road</span><strong className={`rmp-access-${mission.access_status.road.toLowerCase()}`}>{mission.access_status.road === "OPEN" ? "✅ OPEN" : mission.access_status.road === "AT_RISK" ? "⚠️ AT RISK" : "❌ BLOCKED"}</strong></div>
            <div className="rmp-row"><span>Bridge</span><strong>{mission.access_status.bridge}</strong></div>
            <div className="rmp-row"><span>Communication</span><strong className="rmp-comm">{mission.access_status.communication}</strong></div>
          </div>
        </div>
      )}

      {!mission.isolation && (
        <>
          <div className="rmp-section">
            <h3>Recommended Operation</h3>
            <div className="rmp-operation-badge">
              {RESCUE_ICONS[mission.mobility_recommendation.recommended_mode] || "🚨"} {mission.recommended_operation}
            </div>
            <p className="rmp-reasoning">{mission.mobility_recommendation.reasoning}</p>
          </div>

          <div className="rmp-section">
            <h3>Route Options</h3>
            <table className="rmp-routes-table">
              <thead>
                <tr><th>Site</th><th>Status</th><th>Safety</th><th>Distance</th><th>ETA</th><th></th></tr>
              </thead>
              <tbody>
                {mission.routes.map((r: any) => (
                  <tr key={r.site_id} className={r.site_id === mission.best_route?.site_id ? "rmp-best" : ""}>
                    <td>{r.site_name}{r.site_id === mission.best_route?.site_id && <span className="rmp-best-tag">BEST</span>}</td>
                    <td><span className={`rmp-route-status rmp-status-${r.route_status.toLowerCase()}`}>{r.route_status}</span></td>
                    <td>{r.safety_score}/100</td>
                    <td>{r.distance_km} km</td>
                    <td>{r.travel_time_min} min</td>
                    <td>
                      {r.route_status !== "BLOCKED" && (
                        <a href={googleMapsDirectionsUrl(mission.location, r.location)} target="_blank" rel="noopener noreferrer" className="rmp-directions">🧭</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rmp-card">
            <h3>Resources Required</h3>
            <div className="rmp-resources">
              <div><span>Buses</span><strong>{mission.resource_requirements.buses_required}</strong></div>
              <div><span>Ambulances</span><strong>{mission.resource_requirements.ambulances_required}</strong></div>
              <div><span>Boats</span><strong>{mission.resource_requirements.boats_required}</strong></div>
              <div><span>Helicopter</span><strong>{mission.resource_requirements.helicopter_required ? "YES" : "NO"}</strong></div>
            </div>
            <p className="rmp-resource-note">
              Resource registry not connected in this prototype — these are REQUIRED counts only, not a live availability match against verified NDRF/SDRF/district assets.
            </p>
          </div>
        </>
      )}

      <div className="rmp-footer">
        <div><span>Confidence</span><strong>{mission.confidence}%</strong></div>
        <div className="rmp-status"><strong>{mission.status}</strong></div>
      </div>
      <p className="rmp-human-note">{mission.human_in_the_loop_note}</p>
    </div>
  );
};

export default RescueMissionPage;
