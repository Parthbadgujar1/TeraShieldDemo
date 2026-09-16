import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import * as Types from "../types";
import "../styles/EmergencyDashboardPage.css";

const EmergencyDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<Types.District[]>([]);
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [summary, setSummary] = useState<any>(null);
  const [priorityList, setPriorityList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.hazard.getDistricts().then((res) => setDistricts(res.data.districts)).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [summaryRes, priorityRes] = await Promise.all([
          api.emergency.getIncidentsSummary(districtFilter || undefined),
          api.emergency.getRescuePriority(districtFilter || undefined),
        ]);
        setSummary(summaryRes.data);
        setPriorityList(priorityRes.data.villages);
      } catch (err) {
        setError("Failed to load emergency dashboard data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [districtFilter]);

  if (loading && !summary) {
    return <div className="loading">Loading emergency dashboard…</div>;
  }

  return (
    <div className="edp-container">
      <h1>Emergency Response Dashboard</h1>

      {error && <div className="error-banner">{error}</div>}

      <div className="edp-controls">
        <label>
          District
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
            <option value="">All Districts</option>
            {districts.map((d) => (
              <option key={d.district_id} value={d.district_id}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>

      {summary && (
        <div className="edp-stats">
          <div className="edp-stat critical">
            <span className="edp-stat-value">{summary.active_incidents.CRITICAL}</span>
            <span className="edp-stat-label">🔴 Critical</span>
          </div>
          <div className="edp-stat high">
            <span className="edp-stat-value">{summary.active_incidents.HIGH}</span>
            <span className="edp-stat-label">🟠 High</span>
          </div>
          <div className="edp-stat moderate">
            <span className="edp-stat-value">{summary.active_incidents.MODERATE}</span>
            <span className="edp-stat-label">🟡 Moderate</span>
          </div>
          <div className="edp-stat">
            <span className="edp-stat-value">{summary.people_requiring_immediate_rescue.toLocaleString()}</span>
            <span className="edp-stat-label">People Requiring Rescue</span>
          </div>
          <div className="edp-stat">
            <span className="edp-stat-value">{summary.people_isolated.toLocaleString()}</span>
            <span className="edp-stat-label">People Isolated</span>
          </div>
          <div className="edp-stat">
            <span className="edp-stat-value">{summary.blocked_or_at_risk_routes.toLocaleString()}</span>
            <span className="edp-stat-label">Blocked / At-Risk Routes</span>
          </div>
          <div className="edp-stat">
            <span className="edp-stat-value">{summary.hospitals_affected.toLocaleString()}</span>
            <span className="edp-stat-label">Hospitals Affected</span>
          </div>
        </div>
      )}
      {summary && <p className="edp-note">{summary.note}</p>}

      <div className="edp-priority-section">
        <h2>Rescue Priority ({priorityList.length})</h2>
        {priorityList.length === 0 ? (
          <p className="edp-empty">No active incidents right now — all monitored villages are below incident threshold.</p>
        ) : (
          <div className="edp-priority-list">
            {priorityList.map((v, idx) => (
              <div
                key={v.village_id}
                className={`edp-priority-card edp-severity-${v.severity.toLowerCase()}`}
                onClick={() => navigate(`/emergency/mission/${v.village_id}`)}
              >
                <div className="edp-priority-rank">{idx + 1}</div>
                <div className="edp-priority-body">
                  <div className="edp-priority-header">
                    <strong>{v.name}</strong>
                    <span className={`edp-severity-badge edp-severity-${v.severity.toLowerCase()}`}>{v.severity}</span>
                  </div>
                  <div className="edp-priority-metrics">
                    <span>Population: {v.population_exposed.toLocaleString()}</span>
                    <span>Vulnerable: {v.vulnerable_population_exposed.toLocaleString()}</span>
                    <span>Road: {v.road_status}</span>
                    <span>Medical: {v.medical_priority_est}</span>
                  </div>
                  <p className="edp-priority-reasoning">{v.reasoning}</p>
                </div>
                <div className="edp-priority-action">View Mission →</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmergencyDashboardPage;
