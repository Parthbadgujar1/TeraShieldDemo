/**
 * TeraShield Frontend - API Service
 * Handles all backend API calls via Vite proxy
 */

import axios, { AxiosInstance } from "axios";
import * as Types from "../types";

const API_BASE = "/api/v1";

class TeraShieldAPI {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Read the actual logged-in token on every request rather than a
    // fixed default — the Emergency Response Team login issues a
    // different token/scope than the admin login, and a hardcoded admin
    // token here would silently 403 every emergency-portal request
    // regardless of who's actually signed in.
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem("auth_token") || "demo-token-sih";
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("API Error:", error.response?.data || error.message);
        throw error;
      }
    );
  }

  // ========================================================================
  // ENGINE 1: HAZARD INTELLIGENCE
  // ========================================================================

  hazard = {
    getDistricts: () =>
      this.client.get<{ districts: Types.District[] }>("/hazard/districts"),

    getDistrictDetail: (districtId: string) =>
      this.client.get<Types.District>(`/hazard/districts/${districtId}`),

    getVillages: (districtId: string, riskFilter?: string) =>
      this.client.get<{ villages: Types.Village[] }>(
        `/hazard/districts/${districtId}/villages`,
        { params: riskFilter ? { risk_filter: riskFilter } : {} }
      ),

    getVillageDetail: (districtId: string, villageId: string) =>
      this.client.get<Types.HazardDetail>(
        `/hazard/districts/${districtId}/villages/${villageId}`
      ),

    getVillageRisk: (districtId: string, villageId: string) =>
      this.client.get(
        `/hazard/districts/${districtId}/villages/${villageId}/risk`
      ),

    getVillageIntelligence: (districtId: string, villageId: string) =>
      this.client.get(
        `/hazard/districts/${districtId}/villages/${villageId}/intelligence`
      ),

    getHazardRasters: (districtId: string) =>
      this.client.get(`/hazard/districts/${districtId}/hazard-rasters`),

    runHazardAnalysis: (districtId: string) =>
      this.client.post("/hazard/run-hazard-analysis", {
        district_id: districtId,
      }),

    getHazardReport: (districtId: string) =>
      this.client.get(`/hazard/districts/${districtId}/hazard-report`),
  };

  // ========================================================================
  // ENGINE 2: EXPOSURE & VULNERABILITY
  // ========================================================================

  exposure = {
    getExposureSummary: (districtId: string) =>
      this.client.get<Types.ExposureSummary>(
        `/exposure/districts/${districtId}/summary`
      ),

    getVillageExposure: (districtId: string, villageId: string) =>
      this.client.get<Types.VillageExposure>(
        `/exposure/districts/${districtId}/villages/${villageId}/exposure`
      ),

    getVillageExposureProfile: (districtId: string, villageId: string) =>
      this.client.get(`/exposure/districts/${districtId}/villages/${villageId}/profile`),

    getDistrictExposureProfileSummary: (districtId: string) =>
      this.client.get(`/exposure/districts/${districtId}/profile-summary`),

    getAssetTypes: () => this.client.get("/exposure/assets/types"),

    getVulnerabilityByDistrict: (districtId: string) =>
      this.client.get(
        `/exposure/vulnerability/districts/${districtId}/summary`
      ),

    getVillageVulnerability: (villageId: string) =>
      this.client.get<Types.VulnerabilityScore>(
        `/exposure/vulnerability/villages/${villageId}`
      ),

    getImpactAssessment: (villageId: string) =>
      this.client.get(`/exposure/impact/villages/${villageId}`),

    getRiskMatrix: (districtId: string) =>
      this.client.get(`/exposure/risk-matrix/districts/${districtId}`),

    runExposureAnalysis: (districtId: string) =>
      this.client.post("/exposure/run-exposure-vulnerability-analysis", {
        district_id: districtId,
      }),

    getExposureReport: (districtId: string) =>
      this.client.get(`/exposure/districts/${districtId}/exposure-report`),
  };

  // ========================================================================
  // ENGINE 3: RELOCATION INTELLIGENCE
  // ========================================================================

  relocation = {
    getSites: (districtId?: string, suitabilityGrade?: string) =>
      this.client.get<{ total_sites: number; sites: Types.RelocationSite[] }>(
        "/relocation/sites",
        {
          params: {
            ...(districtId && { district_id: districtId }),
            ...(suitabilityGrade && { suitability_grade: suitabilityGrade }),
          },
        }
      ),

    getSiteDetail: (siteId: string) =>
      this.client.get(`/relocation/sites/${siteId}`),

    getPrioritySummary: (districtId: string) =>
      this.client.get(
        `/relocation/priority/districts/${districtId}/summary`
      ),

    getVillagePriority: (villageId: string) =>
      this.client.get<Types.RelocationPriority>(
        `/relocation/priority/villages/${villageId}`
      ),

    runPrioritization: (districtId: string) =>
      this.client.post("/relocation/prioritize", {
        district_id: districtId,
      }),

    getAssignments: (tier?: string, status?: string, districtId?: string) =>
      this.client.get("/relocation/assignments", {
        params: {
          ...(tier && { tier }),
          ...(status && { status }),
          ...(districtId && { district_id: districtId }),
        },
      }),

    getAssignmentDetail: (assignmentId: string) =>
      this.client.get(`/relocation/assignments/${assignmentId}`),

    getEvacuationRoutes: (
      sourceVillage?: string,
      destinationSite?: string
    ) =>
      this.client.get("/relocation/evacuation-routes", {
        params: {
          ...(sourceVillage && { source_village: sourceVillage }),
          ...(destinationSite && { destination_site: destinationSite }),
        },
      }),

    getRouteDetail: (routeId: string) =>
      this.client.get(`/relocation/evacuation-routes/${routeId}`),

    runRelocationAnalysis: (districtId: string) =>
      this.client.post("/relocation/run-relocation-analysis", {
        district_id: districtId,
      }),

    getVillageRelocationPlan: (villageId: string, timeOfDay: "day" | "night" = "day") =>
      this.client.get(`/relocation/plan/villages/${villageId}`, {
        params: { time_of_day: timeOfDay },
      }),

    getPartialEvacuationSummary: (districtId: string) =>
      this.client.get(`/relocation/plan/districts/${districtId}/partial-evacuation`),

    getReturnReadiness: (villageId: string) =>
      this.client.get(`/relocation/plan/villages/${villageId}/return-readiness`),

    downloadOfflinePlanPdf: (villageId: string, timeOfDay: "day" | "night" = "day") =>
      this.client.get(`/relocation/plan/villages/${villageId}/offline-pdf`, {
        params: { time_of_day: timeOfDay },
        responseType: "blob",
      }),

    simulateSiteUnavailable: (villageId: string, siteIds: string[]) =>
      this.client.post(`/relocation/plan/villages/${villageId}/scenario/site-unavailable`, {
        site_ids: siteIds,
      }),

    simulateRouteFailure: (villageId: string, siteId: string) =>
      this.client.post(`/relocation/plan/villages/${villageId}/scenario/route-failure`, {
        site_id: siteId,
      }),

    getRelocationPlan: (districtId: string) =>
      this.client.get(`/relocation/relocation-plan/${districtId}`),
  };

  // ========================================================================
  // ENGINE 4: GIS DASHBOARD
  // ========================================================================

  dashboard = {
    getSummary: () =>
      this.client.get<Types.DashboardSummary>("/dashboard/summary"),

    getDistrictsStatus: () => this.client.get("/dashboard/districts-status"),

    getEvents: (districtId?: string) =>
      this.client.get("/dashboard/events", {
        params: districtId ? { district_id: districtId } : {},
      }),

    getEventDetail: (eventId: number) =>
      this.client.get<Types.DisasterEvent>(`/dashboard/events/${eventId}`),

    getAlerts: (severity?: string, activeOnly: boolean = true, districtId?: string) =>
      this.client.get<{ alerts: Types.Alert[] }>("/dashboard/alerts", {
        params: {
          ...(severity && { severity }),
          active_only: activeOnly,
          ...(districtId && { district_id: districtId }),
        },
      }),

    resolveAlert: (alertId: number) =>
      this.client.post(`/dashboard/alerts/${alertId}/resolve`),

    getReports: (reportType?: string, districtId?: string) =>
      this.client.get("/dashboard/reports", {
        params: {
          ...(reportType && { report_type: reportType }),
          ...(districtId && { district_id: districtId }),
        },
      }),

    generateReport: (
      reportType: string,
      districtId?: string,
      eventId?: number
    ) =>
      this.client.post("/dashboard/generate-report", {
        report_type: reportType,
        ...(districtId && { district_id: districtId }),
        ...(eventId && { event_id: eventId }),
      }),

    getResponseActions: (eventId?: number) =>
      this.client.get("/dashboard/response-actions", {
        params: eventId ? { event_id: eventId } : {},
      }),

    recordResponseAction: (
      eventId: number,
      actionType: string,
      description: string
    ) =>
      this.client.post("/dashboard/response-actions", {
        event_id: eventId,
        action_type: actionType,
        description,
      }),

    getEvacuationProgress: (districtId?: string) =>
      this.client.get("/dashboard/metrics/evacuation-progress", {
        params: districtId ? { district_id: districtId } : {},
      }),

    getRelocationProgress: (districtId?: string) =>
      this.client.get("/dashboard/metrics/relocation-progress", {
        params: districtId ? { district_id: districtId } : {},
      }),

    getSiteCapacityMetrics: () =>
      this.client.get("/dashboard/metrics/site-capacity"),

    getNotifications: (limit: number = 20) =>
      this.client.get("/dashboard/notifications", { params: { limit } }),

    exportGeoJSON: (districtId: string) =>
      this.client.post("/dashboard/export/geojson", {
        district_id: districtId,
      }),

    exportCSV: (reportType: string, districtId?: string) =>
      this.client.post("/dashboard/export/csv", {
        report_type: reportType,
        ...(districtId && { district_id: districtId }),
      }),

    exportPDF: (reportType: string, districtId?: string) =>
      this.client.post("/dashboard/export/pdf", {
        report_type: reportType,
        ...(districtId && { district_id: districtId }),
      }),
  };

  // ========================================================================
  // DEV TOOLS: TEST DATA & SCENARIO SIMULATION
  // ========================================================================

  testdata = {
    addVillage: (
      districtId: string,
      name: string,
      lat: number,
      lon: number,
      population: number,
      block?: string
    ) =>
      this.client.post("/testdata/villages", {
        district_id: districtId,
        name,
        lat,
        lon,
        population,
        ...(block && { block }),
      }),

    listVillages: (districtId?: string) =>
      this.client.get("/testdata/villages", {
        params: districtId ? { district_id: districtId } : {},
      }),

    deleteVillage: (villageId: string, districtId: string) =>
      this.client.delete(`/testdata/villages/${villageId}`, {
        params: { district_id: districtId },
      }),

    listScenarioPresets: () => this.client.get("/testdata/scenarios/presets"),

    applyScenario: (villageId: string, preset: string) =>
      this.client.post(`/testdata/villages/${villageId}/scenario`, { preset }),

    applyCustomScenario: (
      villageId: string,
      fields: { daily_rainfall_mm?: number; current_rain_rate_mm_hr?: number; slope_deg?: number }
    ) => this.client.post(`/testdata/villages/${villageId}/scenario`, fields),

    clearScenario: (villageId: string) =>
      this.client.delete(`/testdata/villages/${villageId}/scenario`),

    downloadSamplePdf: (districtId: string) =>
      this.client.get(`/testdata/sample-pdf`, {
        params: { district_id: districtId },
        responseType: "blob",
      }),

    uploadVillagesPdf: (districtId: string, file: File) => {
      const formData = new FormData();
      formData.append("district_id", districtId);
      formData.append("file", file);
      return this.client.post("/testdata/villages/upload-pdf", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
  };

  // ========================================================================
  // INTELLIGENCE PIPELINE (joined view across all 4 engines)
  // ========================================================================

  pipeline = {
    getVillagePipeline: (villageId: string) =>
      this.client.get(`/pipeline/villages/${villageId}`),
  };

  // ========================================================================
  // EMERGENCY RESPONSE TEAM (separate operational role/portal)
  // ========================================================================

  emergency = {
    getIncidentsSummary: (districtId?: string) =>
      this.client.get("/emergency/incidents/summary", {
        params: districtId ? { district_id: districtId } : {},
      }),

    getRescuePriority: (districtId?: string, limit?: number) =>
      this.client.get("/emergency/rescue-priority", {
        params: {
          ...(districtId && { district_id: districtId }),
          ...(limit && { limit }),
        },
      }),

    getRescueMission: (villageId: string) =>
      this.client.get(`/emergency/rescue-mission/${villageId}`),
  };

  // ========================================================================
  // INTEGRATED ENDPOINTS
  // ========================================================================

  integrated = {
    getVillageProfile: (villageId: string) =>
      this.client.get(`/integrated/village/${villageId}`),

    getDistrictSummary: (districtId: string) =>
      this.client.get(`/integrated/district/${districtId}/summary`),

    runFullAnalysis: (districtId: string) =>
      this.client.post("/integrated/run-analysis", {
        district_id: districtId,
      }),
  };

  // ========================================================================
  // HEALTH & INFO (root-level endpoints, not under /api/v1)
  // ========================================================================

  getHealth = () => axios.get("/health");

  getInfo = () => axios.get("/info");
}

// Export singleton instance
export const api = new TeraShieldAPI();
export default api;
