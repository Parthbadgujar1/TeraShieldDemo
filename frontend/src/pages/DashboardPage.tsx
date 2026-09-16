import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import * as Types from "../types";
import KPIPanel from "../components/KPIPanel";
import DistrictSelector from "../components/DistrictSelector";
import VillageTable from "../components/VillageTable";
import AddTestVillageModal from "../components/AddTestVillageModal";
import UploadVillagesPdfModal from "../components/UploadVillagesPdfModal";
import "../styles/DashboardPage.css";

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<Types.District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [villages, setVillages] = useState<Types.Village[]>([]);
  const [summary, setSummary] = useState<Types.DashboardSummary | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddTestVillage, setShowAddTestVillage] = useState(false);
  const [showUploadPdf, setShowUploadPdf] = useState(false);

  // Load districts on mount
  useEffect(() => {
    const loadDistricts = async () => {
      try {
        setLoading(true);
        const response = await api.hazard.getDistricts();
        setDistricts(response.data.districts);
        const saved = localStorage.getItem("ts_selected_district");
        const validSaved = saved && response.data.districts.some((d) => d.district_id === saved);
        if (validSaved) {
          setSelectedDistrict(saved as string);
        } else if (response.data.districts.length > 0) {
          setSelectedDistrict(response.data.districts[0].district_id);
        }
      } catch (err) {
        setError("Failed to load districts");
      } finally {
        setLoading(false);
      }
    };

    const loadSummary = async () => {
      try {
        const response = await api.dashboard.getSummary();
        setSummary(response.data);
      } catch (err) {
        console.error("Failed to load summary");
      }
    };

    loadDistricts();
    loadSummary();
  }, []);

  const loadVillages = async (districtId: string) => {
    try {
      setLoading(true);
      const response = await api.hazard.getVillages(districtId, riskFilter || undefined);
      setVillages(response.data.villages);
    } catch (err) {
      setError("Failed to load villages");
    } finally {
      setLoading(false);
    }
  };

  // Load villages when district changes
  useEffect(() => {
    if (!selectedDistrict) return;
    loadVillages(selectedDistrict);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistrict, riskFilter]);

  const handleTestVillageCreated = (districtId: string) => {
    if (districtId === selectedDistrict) {
      loadVillages(districtId);
    } else {
      setSelectedDistrict(districtId);
    }
  };

  useEffect(() => {
    if (selectedDistrict) {
      localStorage.setItem("ts_selected_district", selectedDistrict);
    }
  }, [selectedDistrict]);

  const handleVillageClick = (villageId: string) => {
    if (selectedDistrict) {
      navigate(`/villages/${selectedDistrict}/${villageId}`);
    }
  };

  const handleRelocationPlan = () => {
    if (selectedDistrict) {
      navigate(`/relocation/${selectedDistrict}`);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard-container">
      <h1>TeraShield Platform - Disaster Management Dashboard</h1>

      {error && <div className="error-banner">{error}</div>}

      {summary && <KPIPanel summary={summary} />}

      <div className="dashboard-controls">
        <DistrictSelector
          districts={districts}
          selectedDistrict={selectedDistrict}
          onSelectDistrict={setSelectedDistrict}
        />

        <div className="filter-controls">
          <label htmlFor="risk-filter">Filter by Risk:</label>
          <select
            id="risk-filter"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="">All Risk Levels</option>
            <option value="RED">RED Zones (Immediate Risk)</option>
            <option value="ORANGE">ORANGE Zones (High Risk)</option>
            <option value="YELLOW">YELLOW Zones (Medium Risk)</option>
            <option value="GREEN">GREEN Zones (Low Risk)</option>
          </select>
        </div>

        <button onClick={handleRelocationPlan} className="relocation-button">
          📍 Relocation Plan
        </button>

        <button onClick={() => setShowAddTestVillage(true)} className="add-test-village-button">
          🧪 Add Test Village
        </button>

        <button onClick={() => setShowUploadPdf(true)} className="add-test-village-button">
          📄 Upload Village Data (PDF)
        </button>
      </div>

      <div className="dashboard-stats">
        {districts.find((d) => d.district_id === selectedDistrict) && (
          <div className="stats-grid">
            <div className="stat-card red-zone">
              <div className="stat-value">
                {districts.find((d) => d.district_id === selectedDistrict)?.red_zones}
              </div>
              <div className="stat-label">RED Zones</div>
            </div>
            <div className="stat-card orange-zone">
              <div className="stat-value">
                {districts.find((d) => d.district_id === selectedDistrict)?.orange_zones}
              </div>
              <div className="stat-label">ORANGE Zones</div>
            </div>
            <div className="stat-card yellow-zone">
              <div className="stat-value">
                {districts.find((d) => d.district_id === selectedDistrict)?.yellow_zones}
              </div>
              <div className="stat-label">YELLOW Zones</div>
            </div>
            <div className="stat-card green-zone">
              <div className="stat-value">
                {districts.find((d) => d.district_id === selectedDistrict)?.green_zones}
              </div>
              <div className="stat-label">GREEN Zones</div>
            </div>
          </div>
        )}
      </div>

      <div className="villages-section">
        <h2>Villages ({villages.length})</h2>
        <VillageTable villages={villages} onVillageClick={handleVillageClick} />
      </div>

      {showAddTestVillage && (
        <AddTestVillageModal
          districts={districts}
          defaultDistrict={selectedDistrict}
          onClose={() => setShowAddTestVillage(false)}
          onCreated={handleTestVillageCreated}
        />
      )}

      {showUploadPdf && (
        <UploadVillagesPdfModal
          districts={districts}
          defaultDistrict={selectedDistrict}
          onClose={() => setShowUploadPdf(false)}
          onCreated={handleTestVillageCreated}
        />
      )}
    </div>
  );
};

export default DashboardPage;
