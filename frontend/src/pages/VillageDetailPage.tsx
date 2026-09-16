import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import * as Types from "../types";
import ExposureProfileView from "../components/ExposureProfileView";
import HazardIntelligenceView from "../components/HazardIntelligenceView";
import RelocationPlanView from "../components/RelocationPlanView";
import "../styles/VillageDetailPage.css";

const VillageDetailPage: React.FC = () => {
  const { districtId, villageId } = useParams<{ districtId: string; villageId: string }>();
  const navigate = useNavigate();
  const [hazard, setHazard] = useState<Types.HazardDetail | null>(null);
  const [hazardIntel, setHazardIntel] = useState<any>(null);
  const [exposureProfile, setExposureProfile] = useState<any>(null);
  const [vulnerability, setVulnerability] = useState<Types.VulnerabilityScore | null>(null);
  const [relocation, setRelocation] = useState<Types.RelocationPriority | null>(null);
  const [relocationPlan, setRelocationPlan] = useState<any>(null);
  const [planTimeOfDay, setPlanTimeOfDay] = useState<"day" | "night">("day");
  const [planLoading, setPlanLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"hazard" | "exposure" | "vulnerability" | "relocation">(
    "hazard"
  );
  const [scenarioPresets, setScenarioPresets] = useState<any[]>([]);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [activeOverride, setActiveOverride] = useState<any>(null);
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  const loadData = async (silent: boolean = false) => {
    if (!districtId || !villageId) return;
    try {
      if (!silent) setLoading(true);
      const [hazardRes, intelRes, profileRes, vulnerabilityRes, relocationRes] = await Promise.all([
        api.hazard.getVillageDetail(districtId, villageId),
        api.hazard.getVillageIntelligence(districtId, villageId),
        api.exposure.getVillageExposureProfile(districtId, villageId),
        api.exposure.getVillageVulnerability(villageId),
        api.relocation.getVillagePriority(villageId),
      ]);

      setHazard(hazardRes.data);
      setHazardIntel(intelRes.data);
      setExposureProfile(profileRes.data);
      setVulnerability(vulnerabilityRes.data);
      setRelocation(relocationRes.data);
      setActiveOverride((hazardRes.data as any).live_inputs?.is_simulated ? (hazardRes.data as any).live_inputs : null);
    } catch (error) {
      console.error("Failed to load village data:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    api.testdata.listScenarioPresets().then((res) => setScenarioPresets(res.data.presets)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtId, villageId]);

  const applyPreset = async (presetId: string) => {
    if (!villageId) return;
    try {
      setScenarioBusy(true);
      await api.testdata.applyScenario(villageId, presetId);
      await loadData(true);
    } catch (error) {
      console.error("Failed to apply scenario:", error);
    } finally {
      setScenarioBusy(false);
    }
  };

  const clearOverride = async () => {
    if (!villageId) return;
    try {
      setScenarioBusy(true);
      await api.testdata.clearScenario(villageId);
      await loadData(true);
    } catch (error) {
      console.error("Failed to clear scenario:", error);
    } finally {
      setScenarioBusy(false);
    }
  };

  const loadRelocationPlan = async (timeOfDay: "day" | "night") => {
    if (!villageId) return;
    try {
      setPlanLoading(true);
      const res = await api.relocation.getVillageRelocationPlan(villageId, timeOfDay);
      setRelocationPlan(res.data);
    } catch (error) {
      console.error("Failed to load relocation plan:", error);
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "relocation" && villageId) {
      loadRelocationPlan(planTimeOfDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, villageId]);

  const handleTimeOfDayChange = (v: "day" | "night") => {
    setPlanTimeOfDay(v);
    loadRelocationPlan(v);
  };

  const handleDownloadPdf = async () => {
    if (!villageId) return;
    try {
      setDownloadingPdf(true);
      const res = await api.relocation.downloadOfflinePlanPdf(villageId, planTimeOfDay);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `terashield_emergency_plan_${villageId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download offline plan:", error);
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading village details...</div>;
  }

  if (!hazard) {
    return <div className="error">Village data not found</div>;
  }

  return (
    <div className="village-detail-container">
      <button onClick={() => navigate(-1)} className="back-button">
        ← Back
      </button>

      <div className="village-header">
        <h1>{hazard.name}</h1>
        <div className={`risk-badge ${hazard.hazard_assessment.risk_category.toLowerCase()}`}>
          {hazard.hazard_assessment.risk_category}
        </div>
        {(hazard as any).is_test_data && <span className="test-data-badge">TEST</span>}
        <p>District: {hazard.district_id}</p>
      </div>

      {activeOverride && (
        <div className="scenario-banner">
          ⚠ Simulated scenario active — hazard inputs are overridden for testing, not the live
          reading. <button onClick={clearOverride} disabled={scenarioBusy}>Clear override</button>
        </div>
      )}

      <div className="dev-tools-panel">
        <button className="dev-tools-toggle" onClick={() => setDevToolsOpen(!devToolsOpen)}>
          🧪 Developer Tools: Simulate Scenario {devToolsOpen ? "▲" : "▼"}
        </button>
        {devToolsOpen && (
          <div className="dev-tools-body">
            <p>
              Force live hazard inputs for this village to see the whole pipeline (hazard →
              exposure → vulnerability → relocation) react, without waiting for real weather.
            </p>
            <div className="scenario-buttons">
              {scenarioPresets.map((p) => (
                <button
                  key={p.id}
                  className="scenario-btn"
                  disabled={scenarioBusy}
                  onClick={() => applyPreset(p.id)}
                  title={p.label}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === "hazard" ? "active" : ""}`}
          onClick={() => setActiveTab("hazard")}
        >
          Hazard Intelligence
        </button>
        <button
          className={`tab ${activeTab === "exposure" ? "active" : ""}`}
          onClick={() => setActiveTab("exposure")}
        >
          Exposure & Vulnerability
        </button>
        <button
          className={`tab ${activeTab === "relocation" ? "active" : ""}`}
          onClick={() => setActiveTab("relocation")}
        >
          Relocation Plan
        </button>
      </div>

      <div className="tab-content">
        {/* HAZARD TAB */}
        {activeTab === "hazard" && hazard && (
          <div className="hazard-section">
            <h2>Hazard Assessment</h2>
            <div className="hazard-summary">
              <div className="summary-item">
                <span>Multi-Hazard Score:</span>
                <span className="value">{hazard.hazard_assessment.multi_hazard_score.toFixed(2)}</span>
              </div>
              <div className="summary-item">
                <span>Risk Category:</span>
                <span className="value">{hazard.hazard_assessment.risk_category}</span>
              </div>
              <div className="summary-item">
                <span>Dominant Hazard:</span>
                <span className="value">{hazard.hazard_assessment.dominant_hazard}</span>
              </div>
            </div>

            <h3>Individual Hazards</h3>
            <div className="hazards-grid">
              {hazard.individual_hazards.map((h) => (
                <div key={h.hazard_type} className="hazard-card">
                  <h4>{h.hazard_type}</h4>
                  <div className="hazard-details">
                    <p>Score: {h.score.toFixed(2)}</p>
                    <p>Intensity: {h.intensity}</p>
                    <p>Confidence: {(h.confidence * 100).toFixed(0)}%</p>
                    <p>Area Affected: {h.affected_area_sqkm} sq km</p>
                  </div>
                </div>
              ))}
            </div>

            <h3>Risk Drivers</h3>
            <ul className="risk-drivers">
              {hazard.risk_drivers.map((driver, idx) => (
                <li key={idx}>{driver}</li>
              ))}
            </ul>

            {hazardIntel && <HazardIntelligenceView intel={hazardIntel} />}
          </div>
        )}

        {/* EXPOSURE TAB */}
        {activeTab === "exposure" && exposureProfile && vulnerability && (
          <div className="exposure-section">
            <h2>Exposure & Vulnerability Assessment</h2>

            <div className="exposure-cards">
              <div className="card">
                <h3>Vulnerability</h3>
                <div className="metric">
                  <span>Score:</span>
                  <span className={`score ${vulnerability.vulnerability_assessment.vulnerability_band.toLowerCase()}`}>
                    {vulnerability.vulnerability_assessment.composite_score.toFixed(2)}
                  </span>
                </div>
                <div className="metric">
                  <span>Band:</span>
                  <span>{vulnerability.vulnerability_assessment.vulnerability_band}</span>
                </div>
              </div>
            </div>

            <ExposureProfileView profile={exposureProfile} />
          </div>
        )}

        {/* RELOCATION TAB */}
        {activeTab === "relocation" && (
          <div className="relocation-section">
            <h2>Relocation Intelligence</h2>

            {planLoading && !relocationPlan && (
              <div className="loading">Building relocation plan (live forecast + route assessment)…</div>
            )}

            {relocationPlan && relocation && (
              <RelocationPlanView
                plan={relocationPlan}
                villageLocation={relocation.location}
                timeOfDay={planTimeOfDay}
                onTimeOfDayChange={handleTimeOfDayChange}
                onDownloadPdf={handleDownloadPdf}
                downloadingPdf={downloadingPdf}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VillageDetailPage;
