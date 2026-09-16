import React from "react";
import "../styles/HazardIntelligenceView.css";

interface HazardIntelligenceViewProps {
  intel: any;
}

const RISK_COLORS: Record<string, string> = {
  RED: "#c62828", ORANGE: "#e0761a", YELLOW: "#b8860b", GREEN: "#0d6006",
};

const HazardIntelligenceView: React.FC<HazardIntelligenceViewProps> = ({ intel }) => {
  const { flood_analysis, landslide_analysis, extreme_rainfall_indicator, coastal_erosion_analysis, historical_context, temporal_risk, confidence_detail } = intel;

  return (
    <div className="hiv-container">
      <div className="hiv-grid">
        <div className="hiv-card">
          <h3>🌊 Flood — Susceptibility vs. Severity</h3>
          <div className="hiv-split">
            <div className="hiv-split-item">
              <span>Susceptibility</span>
              <strong>{flood_analysis.susceptibility.toFixed(2)} ({flood_analysis.susceptibility_label})</strong>
              <em>where flooding is more likely</em>
            </div>
            <div className="hiv-split-item">
              <span>Severity if it occurs</span>
              <strong>{flood_analysis.severity_if_it_occurs.toFixed(2)} ({flood_analysis.severity_label})</strong>
              <em>how deep/damaging</em>
            </div>
            <div className="hiv-split-item highlight">
              <span>Combined</span>
              <strong>{flood_analysis.combined_score.toFixed(2)}</strong>
              <em>used for risk category</em>
            </div>
          </div>
          <p className="hiv-note">{flood_analysis.note}</p>
        </div>

        <div className="hiv-card">
          <h3>⛰️ Landslide — Terrain + Trigger + History</h3>
          <div className="hiv-split">
            <div className="hiv-split-item">
              <span>Terrain susceptibility</span>
              <strong>{landslide_analysis.terrain_susceptibility.toFixed(2)}</strong>
            </div>
            <div className="hiv-split-item">
              <span>Trigger conditions</span>
              <strong>{landslide_analysis.trigger_conditions.toFixed(2)}</strong>
            </div>
            <div className="hiv-split-item highlight">
              <span>Historical evidence</span>
              <strong className={landslide_analysis.historical_evidence === "DOCUMENTED" ? "hiv-documented" : ""}>
                {landslide_analysis.historical_evidence.replace(/_/g, " ")}
              </strong>
            </div>
          </div>
          <p className="hiv-note">{landslide_analysis.note}</p>
        </div>

        <div className="hiv-card">
          <h3>⚡ {extreme_rainfall_indicator.label}</h3>
          <div className="hiv-row">
            <span>Short-duration intensity</span>
            <strong>{extreme_rainfall_indicator.short_duration_intensity.toFixed(2)}</strong>
          </div>
          <div className="hiv-row">
            <span>Combined score</span>
            <strong>{extreme_rainfall_indicator.combined_score.toFixed(2)}</strong>
          </div>
          <p className="hiv-note">{extreme_rainfall_indicator.note}</p>
        </div>

        {coastal_erosion_analysis && (
          <div className="hiv-card">
            <h3>🏖️ Coastal Erosion</h3>
            <div className="hiv-row">
              <span>Proximity factor</span>
              <strong>{coastal_erosion_analysis.proximity_factor.toFixed(2)}</strong>
            </div>
            <div className="hiv-row">
              <span>Shoreline trend</span>
              <strong>{coastal_erosion_analysis.historical_shoreline_trend}</strong>
            </div>
            <p className="hiv-note">{coastal_erosion_analysis.note}</p>
          </div>
        )}
      </div>

      <div className="hiv-section">
        <h3>📜 Historical Context ({historical_context.event_count} documented event{historical_context.event_count !== 1 ? "s" : ""})</h3>
        {historical_context.documented_events.length > 0 ? (
          <div className="hiv-events">
            {historical_context.documented_events.map((e: any, idx: number) => (
              <div key={idx} className="hiv-event">
                <span className="hiv-event-date">{e.date}</span>
                <span className="hiv-event-type">{e.type.replace(/_/g, " ")}</span>
                <span className="hiv-event-desc">{e.description}{e.casualties != null && ` (${e.casualties} casualties reported)`}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="hiv-empty">No major documented events on record for this block.</p>
        )}
        <p className="hiv-note">{historical_context.note}</p>
      </div>

      <div className="hiv-section">
        <h3>⏱ Temporal Risk Trajectory</h3>
        <div className="hiv-trajectory">
          {temporal_risk.horizons.map((h: any) => (
            <div key={h.horizon} className="hiv-horizon">
              <span className="hiv-horizon-label">{h.horizon === "now" ? "NOW" : h.horizon}</span>
              <span className="hiv-horizon-badge" style={{ background: RISK_COLORS[h.risk_category] }}>
                {h.risk_category}
              </span>
              <span className="hiv-horizon-score">{h.multi_hazard_score.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <p className="hiv-note">{temporal_risk.note}</p>
      </div>

      <div className="hiv-confidence">
        <div className="hiv-confidence-header">
          <strong>Confidence: {Math.round(confidence_detail.value * 100)}%</strong>
          <span>Uncertainty band: {confidence_detail.uncertainty.lower.toFixed(2)} – {confidence_detail.uncertainty.upper.toFixed(2)}</span>
        </div>
        <ul className="hiv-confidence-factors">
          {confidence_detail.factors_reducing_confidence.map((f: string, idx: number) => (
            <li key={idx}>{f}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default HazardIntelligenceView;
