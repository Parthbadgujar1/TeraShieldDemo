import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import * as Types from "../types";
import { googleMapsDirectionsUrl } from "../utils/maps";
import "../styles/RelocationPage.css";

const RelocationPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>();
  const navigate = useNavigate();
  const [sites, setSites] = useState<Types.RelocationSite[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sites" | "assignments" | "plan">("sites");

  useEffect(() => {
    if (!districtId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [sitesRes, assignmentsRes, planRes] = await Promise.all([
          api.relocation.getSites(districtId),
          api.relocation.getAssignments(undefined, undefined, districtId),
          api.relocation.getRelocationPlan(districtId),
        ]);

        setSites(sitesRes.data.sites);
        setAssignments(assignmentsRes.data.assignments || []);
        setPlan(planRes.data);
      } catch (error) {
        console.error("Failed to load relocation data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [districtId]);

  if (loading) {
    return <div className="loading">Loading relocation data...</div>;
  }

  return (
    <div className="relocation-container">
      <button onClick={() => navigate(-1)} className="back-button">
        ← Back
      </button>

      <h1>Relocation Intelligence - {districtId}</h1>

      <div className="tabs">
        <button
          className={`tab ${activeTab === "sites" ? "active" : ""}`}
          onClick={() => setActiveTab("sites")}
        >
          Available Sites
        </button>
        <button
          className={`tab ${activeTab === "assignments" ? "active" : ""}`}
          onClick={() => setActiveTab("assignments")}
        >
          Assignments
        </button>
        <button
          className={`tab ${activeTab === "plan" ? "active" : ""}`}
          onClick={() => setActiveTab("plan")}
        >
          Relocation Plan
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "sites" && (
          <div className="sites-section">
            <h2>Available Relocation Sites</h2>
            <div className="sites-grid">
              {sites.map((site) => (
                <div key={site.site_id} className="site-card">
                  <div className="site-grade">{site.suitability.grade}</div>
                  <h3>{site.name}</h3>
                  <div className="site-details">
                    <p>
                      <strong>Suitability:</strong> {site.suitability.score}/100
                    </p>
                    <p>
                      <strong>Capacity:</strong> {site.carrying_capacity.total_capacity_people.toLocaleString()} people
                    </p>
                    <p>
                      <strong>Land:</strong> {site.carrying_capacity.land_hectares} hectares
                    </p>
                    <p>
                      <strong>Available Slots:</strong> {site.carrying_capacity.available_slots_people.toLocaleString()}
                    </p>
                  </div>
                  <div className={`availability ${site.is_available ? "available" : "unavailable"}`}>
                    {site.is_available ? "Available" : "Not Available"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "assignments" && (
          <div className="assignments-section">
            <h2>Relocation Assignments</h2>
            <div className="assignments-list">
              {assignments && assignments.length > 0 ? (
                assignments.map((assignment: any, idx) => (
                  <div key={idx} className="assignment-card">
                    <div className="assignment-header">
                      <h3>{assignment.village_name || `Village ${assignment.assignment_id}`}</h3>
                      <span className={`priority ${assignment.priority_tier}`}>
                        {assignment.priority_tier}
                      </span>
                    </div>
                    <div className="assignment-details">
                      <p>
                        <strong>Population:</strong> {assignment.population?.toLocaleString() || "N/A"}
                      </p>
                      <p>
                        <strong>Target Site:</strong> {assignment.target_site_name || assignment.target_site || "TBD"}
                      </p>
                      <p>
                        <strong>Status:</strong> {assignment.status || "Planned"}
                      </p>
                      {assignment.village_location && assignment.target_site_location && (
                        <a
                          className="get-directions-link"
                          href={googleMapsDirectionsUrl(assignment.village_location, assignment.target_site_location)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          🧭 Get Directions
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p>No assignments found</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "plan" && plan && (
          <div className="plan-section">
            <h2>Relocation Plan Summary</h2>
            <div className="plan-overview">
              <div className="plan-card">
                <h3>Villages Requiring Relocation</h3>
                <div className="plan-value">{plan.executive_summary?.villages_requiring_relocation || 0}</div>
              </div>
              <div className="plan-card">
                <h3>Population to Relocate</h3>
                <div className="plan-value">{plan.executive_summary?.population_to_relocate?.toLocaleString() || 0}</div>
              </div>
              <div className="plan-card">
                <h3>Available Sites</h3>
                <div className="plan-value">{plan.executive_summary?.suitable_sites_identified || 0}</div>
              </div>
              <div className="plan-card">
                <h3>Timeline</h3>
                <div className="plan-value">{plan.executive_summary?.timeline_months || 0} months</div>
              </div>
            </div>

            {plan.relocation_tiers && (
              <div className="tiers-breakdown">
                <h3>Relocation by Tier</h3>
                <div className="tiers-grid">
                  <div className="tier-card immediate">
                    <h4>Immediate</h4>
                    <p>Villages: {plan.relocation_tiers.immediate?.villages || 0}</p>
                    <p>Population: {plan.relocation_tiers.immediate?.population?.toLocaleString() || 0}</p>
                    <p>Timeline: {plan.relocation_tiers.immediate?.timeline_days || 0} days</p>
                  </div>
                  <div className="tier-card short-term">
                    <h4>Short-term</h4>
                    <p>Villages: {plan.relocation_tiers.short_term?.villages || 0}</p>
                    <p>Population: {plan.relocation_tiers.short_term?.population?.toLocaleString() || 0}</p>
                    <p>Timeline: {plan.relocation_tiers.short_term?.timeline_months || 0} months</p>
                  </div>
                  <div className="tier-card medium-term">
                    <h4>Medium-term</h4>
                    <p>Villages: {plan.relocation_tiers.medium_term?.villages || 0}</p>
                    <p>Population: {plan.relocation_tiers.medium_term?.population?.toLocaleString() || 0}</p>
                    <p>Timeline: {plan.relocation_tiers.medium_term?.timeline_months || 0} months</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RelocationPage;
