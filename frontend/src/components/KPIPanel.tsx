import React from "react";
import * as Types from "../types";
import "../styles/KPIPanel.css";

interface KPIPanelProps {
  summary: Types.DashboardSummary;
}

const KPIPanel: React.FC<KPIPanelProps> = ({ summary }) => {
  return (
    <div className="kpi-panel">
      <div className="kpi-card">
        <div className="kpi-icon">📊</div>
        <div className="kpi-content">
          <div className="kpi-value">{summary.national_overview.districts_monitored}</div>
          <div className="kpi-label">Districts Monitored</div>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon">🏘️</div>
        <div className="kpi-content">
          <div className="kpi-value">{summary.national_overview.villages_assessed.toLocaleString()}</div>
          <div className="kpi-label">Villages Assessed</div>
        </div>
      </div>

      <div className="kpi-card danger">
        <div className="kpi-icon">⚠️</div>
        <div className="kpi-content">
          <div className="kpi-value">{summary.national_overview.population_at_risk_millions.toFixed(1)}M</div>
          <div className="kpi-label">Population at Risk</div>
        </div>
      </div>

      <div className="kpi-card danger">
        <div className="kpi-icon">🔴</div>
        <div className="kpi-content">
          <div className="kpi-value">{summary.national_overview.red_zones_identified.toLocaleString()}</div>
          <div className="kpi-label">RED Zones Identified</div>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon">📍</div>
        <div className="kpi-content">
          <div className="kpi-value">{summary.national_overview.suitable_sites_identified}</div>
          <div className="kpi-label">Suitable Sites</div>
        </div>
      </div>

      <div className="kpi-card alert">
        <div className="kpi-icon">🚨</div>
        <div className="kpi-content">
          <div className="kpi-value">{summary.alerts_summary.critical}</div>
          <div className="kpi-label">Critical Alerts</div>
        </div>
      </div>
    </div>
  );
};

export default KPIPanel;
