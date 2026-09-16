import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import * as Types from "../types";
import DistrictSelector from "../components/DistrictSelector";
import "../styles/ExposurePage.css";

const ExposurePage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<Types.District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(districtId || null);
  const [summary, setSummary] = useState<Types.ExposureSummary | null>(null);
  const [vulnerability, setVulnerability] = useState<any>(null);
  const [riskMatrix, setRiskMatrix] = useState<any>(null);
  const [profileSummary, setProfileSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.hazard.getDistricts().then((res) => {
      setDistricts(res.data.districts);
      if (!selectedDistrict && res.data.districts.length > 0) {
        setSelectedDistrict(res.data.districts[0].district_id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDistrict) return;
    localStorage.setItem("ts_selected_district", selectedDistrict);
    navigate(`/exposure/${selectedDistrict}`, { replace: true });

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [summaryRes, vulnRes, matrixRes, profileRes] = await Promise.all([
          api.exposure.getExposureSummary(selectedDistrict),
          api.exposure.getVulnerabilityByDistrict(selectedDistrict),
          api.exposure.getRiskMatrix(selectedDistrict),
          api.exposure.getDistrictExposureProfileSummary(selectedDistrict),
        ]);
        setSummary(summaryRes.data);
        setVulnerability(vulnRes.data);
        setRiskMatrix(matrixRes.data);
        setProfileSummary(profileRes.data);
      } catch (err) {
        setError("Failed to load exposure & vulnerability data");
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistrict]);

  if (loading && !summary) {
    return <div className="loading">Loading exposure & vulnerability data...</div>;
  }

  return (
    <div className="exposure-container">
      <h1>Exposure &amp; Vulnerability Assessment</h1>

      <DistrictSelector
        districts={districts}
        selectedDistrict={selectedDistrict}
        onSelectDistrict={setSelectedDistrict}
      />

      {error && <div className="error-banner">{error}</div>}

      {profileSummary?.cascading_dependency && (
        <div className="cascading-dependency-banner">
          ⚠ Cascading infrastructure risk: {profileSummary.cascading_dependency.note}
        </div>
      )}

      {summary && (
        <>
          <div className="kpi-panel">
            <div className="kpi-card danger">
              <div className="kpi-icon">👥</div>
              <div className="kpi-content">
                <div className="kpi-value">{summary.exposure_summary.population_exposed.toLocaleString()}</div>
                <div className="kpi-label">Population Exposed</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">🏠</div>
              <div className="kpi-content">
                <div className="kpi-value">{summary.exposure_summary.households_exposed.toLocaleString()}</div>
                <div className="kpi-label">Households Exposed</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">🏢</div>
              <div className="kpi-content">
                <div className="kpi-value">{summary.assets_exposed.buildings.toLocaleString()}</div>
                <div className="kpi-label">Buildings Exposed</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">🌾</div>
              <div className="kpi-content">
                <div className="kpi-value">{summary.assets_exposed.agricultural_land_hectares.toLocaleString()}</div>
                <div className="kpi-label">Agri Land (ha)</div>
              </div>
            </div>
            <div className="kpi-card alert">
              <div className="kpi-icon">🏥</div>
              <div className="kpi-content">
                <div className="kpi-value">{summary.critical_infrastructure.hospitals_in_hazard}</div>
                <div className="kpi-label">Hospitals in Hazard</div>
              </div>
            </div>
            <div className="kpi-card alert">
              <div className="kpi-icon">🏫</div>
              <div className="kpi-content">
                <div className="kpi-value">{summary.critical_infrastructure.schools_in_hazard}</div>
                <div className="kpi-label">Schools in Hazard</div>
              </div>
            </div>
          </div>

          {vulnerability && (
            <div className="exposure-section">
              <h2>Vulnerability Distribution</h2>
              <div className="vuln-bands">
                <div className="vuln-band high">
                  <div className="vuln-band-value">{vulnerability.vulnerability_distribution.high_vulnerability_villages}</div>
                  <div className="vuln-band-label">High Vulnerability Villages</div>
                </div>
                <div className="vuln-band medium">
                  <div className="vuln-band-value">{vulnerability.vulnerability_distribution.medium_vulnerability_villages}</div>
                  <div className="vuln-band-label">Medium Vulnerability Villages</div>
                </div>
                <div className="vuln-band low">
                  <div className="vuln-band-value">{vulnerability.vulnerability_distribution.low_vulnerability_villages}</div>
                  <div className="vuln-band-label">Low Vulnerability Villages</div>
                </div>
              </div>

              {vulnerability.key_vulnerability_factors?.length > 0 && (
                <>
                  <h3>Key Vulnerability Factors</h3>
                  <table className="factors-table">
                    <thead>
                      <tr>
                        <th>Factor</th>
                        <th>Affected Villages</th>
                        <th>Severity</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vulnerability.key_vulnerability_factors.map((f: any, idx: number) => (
                        <tr key={idx}>
                          <td className="factor-name">{f.factor.replace(/_/g, " ")}</td>
                          <td>{f.affected_villages.toLocaleString()}</td>
                          <td>
                            <span className={`severity ${f.severity}`}>{f.severity}</span>
                          </td>
                          <td>{f.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {riskMatrix && (
            <div className="exposure-section">
              <h2>Combined Risk Matrix</h2>
              <div className="risk-matrix-grid">
                <div className="risk-matrix-card very-high">
                  <div className="rm-value">{riskMatrix.risk_matrix.very_high_risk.hazard_high_exposure_high_vulnerability_high}</div>
                  <div className="rm-label">Very High Risk</div>
                  <div className="rm-desc">{riskMatrix.risk_matrix.very_high_risk.description}</div>
                </div>
                <div className="risk-matrix-card high">
                  <div className="rm-value">{riskMatrix.risk_matrix.high_risk.hazard_high_exposure_medium_or_high_vulnerability}</div>
                  <div className="rm-label">High Risk</div>
                  <div className="rm-desc">{riskMatrix.risk_matrix.high_risk.description}</div>
                </div>
                <div className="risk-matrix-card medium">
                  <div className="rm-value">{riskMatrix.risk_matrix.medium_risk.hazard_medium_or_exposure_high_vulnerability}</div>
                  <div className="rm-label">Medium Risk</div>
                  <div className="rm-desc">{riskMatrix.risk_matrix.medium_risk.description}</div>
                </div>
                <div className="risk-matrix-card low">
                  <div className="rm-value">{riskMatrix.risk_matrix.low_risk.hazard_low_or_exposure_low_vulnerability_low}</div>
                  <div className="rm-label">Low Risk</div>
                  <div className="rm-desc">{riskMatrix.risk_matrix.low_risk.description}</div>
                </div>
              </div>
            </div>
          )}

          {profileSummary && (
            <div className="exposure-section">
              <h2>Multi-Sector Exposure (District Total)</h2>
              <p className="sector-hint">
                Scaled to the full district village count. Open a village for the full per-sector
                breakdown (people, housing, healthcare, water, energy, transport, livelihood,
                environment).
              </p>
              <div className="sector-grid">
                <div className="sector-card">
                  <span className="sector-icon">👥</span>
                  <span className="sector-value">{profileSummary.people.vulnerable_population_exposed.toLocaleString()}</span>
                  <span className="sector-label">Vulnerable Population Exposed</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">🏠</span>
                  <span className="sector-value">{profileSummary.housing.high_risk_structures.toLocaleString()}</span>
                  <span className="sector-label">High-Risk Structures</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">🏥</span>
                  <span className="sector-value">{profileSummary.healthcare.phc_count + profileSummary.healthcare.chc_hospital_count}</span>
                  <span className="sector-label">Health Facilities (PHC/CHC)</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">🎓</span>
                  <span className="sector-value">{profileSummary.education.students_exposed.toLocaleString()}</span>
                  <span className="sector-label">Students Exposed</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">💧</span>
                  <span className="sector-value">{profileSummary.water.treatment_plants + profileSummary.water.pumping_stations}</span>
                  <span className="sector-label">Water Treatment/Pumping Assets</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">⚡</span>
                  <span className="sector-value">{profileSummary.energy.substations.toLocaleString()}</span>
                  <span className="sector-label">Substations</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">🛣</span>
                  <span className="sector-value">{profileSummary.transport.roads_affected_km.toLocaleString()} km</span>
                  <span className="sector-label">Roads Affected</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">🌾</span>
                  <span className="sector-value">{profileSummary.livelihood.livestock_exposed.toLocaleString()}</span>
                  <span className="sector-label">Livestock Exposed</span>
                </div>
                <div className="sector-card">
                  <span className="sector-icon">🌳</span>
                  <span className="sector-value">{profileSummary.environment.forest_affected_sqkm.toLocaleString()} km²</span>
                  <span className="sector-label">Forest Affected</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExposurePage;
