import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, useMap } from "react-leaflet";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import "leaflet/dist/leaflet.css";
import api from "../services/api";
import * as Types from "../types";
import DistrictSelector from "../components/DistrictSelector";
import { googleMapsDirectionsUrl } from "../utils/maps";
import "../styles/GISDashboardPage.css";

const RISK_COLORS: Record<string, string> = {
  RED: "#c62828",
  ORANGE: "#e0761a",
  YELLOW: "#b8860b",
  GREEN: "#0d6006",
};

const DISTRICT_CENTERS: Record<string, [number, number]> = {
  chamoli: [30.3, 79.35],
  kendrapara: [20.55, 86.5],
};

// react-leaflet's MapContainer only applies `center`/`zoom` on first mount —
// it does not re-pan when those props change later. This child component
// (rendered inside MapContainer, so useMap() has a map instance to grab)
// explicitly re-centers the view whenever the district changes.
const RecenterOnDistrictChange: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    // invalidateSize() re-measures the container (the side panel loads
    // asynchronously and can shift the grid after Leaflet's first paint)
    // but it can itself leave the tile layer and the vector markers
    // disagreeing about zoom for a frame. Always re-apply setView right
    // after, in the same tick, so tiles and markers can never drift apart.
    const resync = () => {
      map.invalidateSize();
      map.setView(center, zoom, { animate: false });
    };
    resync();
    const id = window.setTimeout(resync, 150); // catch layout settling after async data loads
    window.addEventListener("resize", resync);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", resync);
    };
  }, [center[0], center[1], zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

const GISDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<Types.District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [villages, setVillages] = useState<Types.Village[]>([]);
  const [sites, setSites] = useState<Types.RelocationSite[]>([]);
  const [alerts, setAlerts] = useState<Types.Alert[]>([]);
  const [assignmentByVillage, setAssignmentByVillage] = useState<Record<string, any>>({});
  const [showVillages, setShowVillages] = useState(true);
  const [showSites, setShowSites] = useState(true);
  const [riskFilter, setRiskFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.hazard
      .getDistricts()
      .then((res) => {
        setDistricts(res.data.districts);
        const saved = localStorage.getItem("ts_selected_district");
        const validSaved = saved && res.data.districts.some((d) => d.district_id === saved);
        setSelectedDistrict(validSaved ? (saved as string) : res.data.districts[0]?.district_id || null);
      })
      .catch(() => setError("Failed to load districts"));
  }, []);

  useEffect(() => {
    if (!selectedDistrict) return;
    localStorage.setItem("ts_selected_district", selectedDistrict);

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [villagesRes, sitesRes, alertsRes, assignmentsRes] = await Promise.all([
          api.hazard.getVillages(selectedDistrict, riskFilter || undefined),
          api.relocation.getSites(selectedDistrict),
          api.dashboard.getAlerts(undefined, true, selectedDistrict),
          api.relocation.getAssignments(undefined, undefined, selectedDistrict),
        ]);
        setVillages(villagesRes.data.villages);
        setSites(sitesRes.data.sites);
        setAlerts(alertsRes.data.alerts);
        const byVillage: Record<string, any> = {};
        (assignmentsRes.data.assignments || []).forEach((a: any) => {
          byVillage[a.village_id] = a;
        });
        setAssignmentByVillage(byVillage);
      } catch (err) {
        setError("Failed to load GIS layers");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedDistrict, riskFilter]);

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0 };
    villages.forEach((v) => {
      counts[v.risk_category] = (counts[v.risk_category] || 0) + 1;
    });
    return counts;
  }, [villages]);

  const chartData = useMemo(
    () =>
      Object.entries(riskCounts)
        .filter(([, count]) => count > 0)
        .map(([risk, count]) => ({ name: risk, value: count })),
    [riskCounts]
  );

  const center = (selectedDistrict && DISTRICT_CENTERS[selectedDistrict]) || [22, 82];

  if (loading && villages.length === 0) {
    return <div className="loading">Loading GIS dashboard...</div>;
  }

  return (
    <div className="gis-container">
      <h1>Integrated GIS Decision Support Dashboard</h1>

      {error && <div className="error-banner">{error}</div>}

      <div className="gis-controls">
        <DistrictSelector
          districts={districts}
          selectedDistrict={selectedDistrict}
          onSelectDistrict={setSelectedDistrict}
        />

        <div className="filter-controls">
          <label htmlFor="gis-risk-filter">Filter by Risk:</label>
          <select id="gis-risk-filter" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
            <option value="">All Risk Levels</option>
            <option value="RED">RED Zones</option>
            <option value="ORANGE">ORANGE Zones</option>
            <option value="YELLOW">YELLOW Zones</option>
            <option value="GREEN">GREEN Zones</option>
          </select>
        </div>

        <div className="layer-toggles">
          <label>
            <input type="checkbox" checked={showVillages} onChange={(e) => setShowVillages(e.target.checked)} />
            Villages ({villages.length})
          </label>
          <label>
            <input type="checkbox" checked={showSites} onChange={(e) => setShowSites(e.target.checked)} />
            Relocation Sites ({sites.length})
          </label>
        </div>
      </div>

      <div className="gis-layout">
        <div className="gis-map-panel">
          <MapContainer center={center} zoom={9} className="gis-map" scrollWheelZoom={true}>
            <RecenterOnDistrictChange center={center} zoom={9} />
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Street Map">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Terrain">
                <TileLayer
                  attribution='&copy; OpenTopoMap contributors'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            {showVillages &&
              villages.map((v) => (
                <CircleMarker
                  key={v.village_id}
                  center={[v.geometry.coordinates[1], v.geometry.coordinates[0]]}
                  radius={6}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 1.5,
                    fillColor: RISK_COLORS[v.risk_category] || "#888",
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <div className="map-popup">
                      <strong>{v.name}</strong>
                      {v.is_test_data && <span className="popup-test-badge">TEST</span>}
                      <div>Population: {v.population.toLocaleString()}</div>
                      <div>
                        Risk: <span style={{ color: RISK_COLORS[v.risk_category] }}>{v.risk_category}</span> (
                        {v.multi_hazard_score.toFixed(2)})
                      </div>
                      <div>Dominant hazard: {v.dominant_hazard}</div>
                      <button
                        className="popup-link"
                        onClick={() => selectedDistrict && navigate(`/villages/${selectedDistrict}/${v.village_id}`)}
                      >
                        View full details →
                      </button>
                      {assignmentByVillage[v.village_id] && (
                        <a
                          className="popup-directions-link"
                          href={googleMapsDirectionsUrl(
                            { lat: v.geometry.coordinates[1], lon: v.geometry.coordinates[0] },
                            assignmentByVillage[v.village_id].target_site_location
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          🧭 Directions to {assignmentByVillage[v.village_id].target_site_name}
                        </a>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

            {showSites &&
              sites.map((s) => (
                <CircleMarker
                  key={s.site_id}
                  center={[s.location.lat, s.location.lon]}
                  radius={8}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#0b3d6e",
                    fillOpacity: 0.85,
                  }}
                >
                  <Popup>
                    <div className="map-popup">
                      <strong>{s.name}</strong>
                      <div>Suitability: {s.suitability.score}/100 (Grade {s.suitability.grade})</div>
                      <div>Capacity: {s.carrying_capacity.total_capacity_people.toLocaleString()} people</div>
                      <div>Available slots: {s.carrying_capacity.available_slots_people.toLocaleString()}</div>
                      <button
                        className="popup-link"
                        onClick={() => selectedDistrict && navigate(`/relocation/${selectedDistrict}`)}
                      >
                        View relocation plan →
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
          </MapContainer>

          <div className="map-legend">
            <span className="legend-item"><i style={{ background: RISK_COLORS.RED }} /> RED</span>
            <span className="legend-item"><i style={{ background: RISK_COLORS.ORANGE }} /> ORANGE</span>
            <span className="legend-item"><i style={{ background: RISK_COLORS.YELLOW }} /> YELLOW</span>
            <span className="legend-item"><i style={{ background: RISK_COLORS.GREEN }} /> GREEN</span>
            <span className="legend-item"><i style={{ background: "#0b3d6e" }} /> Relocation Site</span>
          </div>
        </div>

        <div className="gis-side-panel">
          <div className="gis-panel-card">
            <h2>Risk Distribution</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={RISK_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-note">No village data for this filter</p>
            )}
          </div>

          <div className="gis-panel-card">
            <h2>Active Alerts ({alerts.length})</h2>
            {alerts.length === 0 ? (
              <p className="empty-note">No active alerts for this district</p>
            ) : (
              <div className="gis-alerts-list">
                {alerts.map((a) => (
                  <div key={a.alert_id} className={`gis-alert ${a.severity.toLowerCase()}`}>
                    <div className="gis-alert-title">{a.title}</div>
                    <div className="gis-alert-desc">{a.description}</div>
                    <div className="gis-alert-action">→ {a.recommended_action}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GISDashboardPage;
