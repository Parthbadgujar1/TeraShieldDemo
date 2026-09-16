import React, { useState } from "react";
import api from "../services/api";
import * as Types from "../types";
import "../styles/AddTestVillageModal.css";

interface AddTestVillageModalProps {
  districts: Types.District[];
  defaultDistrict: string | null;
  onClose: () => void;
  onCreated: (districtId: string) => void;
}

// Rough district centers so the form starts with a plausible in-district
// coordinate; the user can still type any lat/lon they want.
const DISTRICT_CENTERS: Record<string, { lat: number; lon: number }> = {
  chamoli: { lat: 30.35, lon: 79.35 },
  kendrapara: { lat: 20.55, lon: 86.5 },
};

const AddTestVillageModal: React.FC<AddTestVillageModalProps> = ({
  districts,
  defaultDistrict,
  onClose,
  onCreated,
}) => {
  const [districtId, setDistrictId] = useState(defaultDistrict || districts[0]?.district_id || "");
  const [name, setName] = useState("");
  const [lat, setLat] = useState<string>(String(DISTRICT_CENTERS[defaultDistrict || ""]?.lat ?? ""));
  const [lon, setLon] = useState<string>(String(DISTRICT_CENTERS[defaultDistrict || ""]?.lon ?? ""));
  const [population, setPopulation] = useState<string>("2000");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleDistrictChange = (id: string) => {
    setDistrictId(id);
    const center = DISTRICT_CENTERS[id];
    if (center) {
      setLat(String(center.lat));
      setLon(String(center.lon));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give the test village a name.");
      return;
    }
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const popNum = parseInt(population, 10);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
      setError("Latitude and longitude must be numbers.");
      return;
    }
    if (!popNum || popNum <= 0) {
      setError("Population must be a positive number.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.testdata.addVillage(districtId, name.trim(), latNum, lonNum, popNum);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to add test village");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onCreated(districtId);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Sample Village for Testing</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="modal-body">
            <p className="modal-hint">
              Adds a village at the coordinates you choose. It runs through the exact same
              live hazard → exposure → vulnerability → relocation pipeline as every real
              village (real live rainfall &amp; terrain for that point). In-memory only —
              cleared on server restart.
            </p>

            <label>
              District
              <select value={districtId} onChange={(e) => handleDistrictChange(e.target.value)}>
                {districts.map((d) => (
                  <option key={d.district_id} value={d.district_id}>
                    {d.name} ({d.state})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Village name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Test Hamlet Alpha"
              />
            </label>

            <div className="modal-row">
              <label>
                Latitude
                <input type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} />
              </label>
              <label>
                Longitude
                <input type="number" step="0.0001" value={lon} onChange={(e) => setLon(e.target.value)} />
              </label>
            </div>

            <label>
              Population
              <input
                type="number"
                min="1"
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
              />
            </label>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Adding…" : "Add Village"}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-body">
            <div className="result-summary">
              <p>
                <strong>{result.village.name}</strong> added to {districtId} (block:{" "}
                {result.village.block}).
              </p>
              <div className="result-grid">
                <div>
                  <span className="result-label">Risk Category</span>
                  <span className={`risk-badge ${result.pipeline.hazard.risk_category.toLowerCase()}`}>
                    {result.pipeline.hazard.risk_category}
                  </span>
                </div>
                <div>
                  <span className="result-label">Multi-Hazard Score</span>
                  <span>{result.pipeline.hazard.multi_hazard_score.toFixed(2)}</span>
                </div>
                <div>
                  <span className="result-label">Dominant Hazard</span>
                  <span>{result.pipeline.hazard.dominant_hazard}</span>
                </div>
                <div>
                  <span className="result-label">Relocation Tier</span>
                  <span>{result.pipeline.relocation_priority.relocation_priority.tier}</span>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={handleDone}>
                Done — show it on the Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddTestVillageModal;
