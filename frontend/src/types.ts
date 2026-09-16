/**
 * TeraShield Frontend - TypeScript Types
 * Interfaces for all data structures
 */

// ============================================================================
// ENGINE 1: HAZARD INTELLIGENCE
// ============================================================================

export interface District {
  district_id: string;
  name: string;
  state: string;
  village_count: number;
  red_zones: number;
  orange_zones: number;
  yellow_zones: number;
  green_zones: number;
  hazard_types: string[];
  last_assessment: string;
  hazard_summary: Record<string, { score: number; affected_villages: number }>;
}

export interface Village {
  village_id: string;
  name: string;
  population: number;
  geometry: { type: string; coordinates: [number, number] }; // GeoJSON Point: [lon, lat]
  multi_hazard_score: number;
  risk_category: "RED" | "ORANGE" | "YELLOW" | "GREEN";
  dominant_hazard: string;
  hazard_scores: Record<string, number>;
  is_test_data?: boolean;
}

export interface HazardDetail {
  village_id: string;
  name: string;
  district_id: string;
  is_test_data?: boolean;
  population: number;
  households: number;
  hazard_assessment: {
    multi_hazard_score: number;
    risk_category: string;
    dominant_hazard: string;
    assessment_date: string;
  };
  individual_hazards: Array<{
    hazard_type: string;
    score: number;
    intensity: string;
    confidence: number;
    affected_area_sqkm: number;
  }>;
  risk_drivers: string[];
  historical_incidents: Array<{
    date: string;
    type: string;
    casualties: number;
    property_damage: number;
  }>;
}

// ============================================================================
// ENGINE 2: EXPOSURE & VULNERABILITY
// ============================================================================

export interface ExposureSummary {
  district_id: string;
  assessment_date: string;
  exposure_summary: {
    total_population: number;
    population_exposed: number;
    households: number;
    households_exposed: number;
  };
  assets_exposed: {
    buildings: number;
    agricultural_land_hectares: number;
    livestock_heads: number;
    roads_km: number;
    water_bodies: number;
  };
  critical_infrastructure: {
    hospitals_in_hazard: number;
    schools_in_hazard: number;
    power_plants_in_hazard: number;
    water_systems_in_hazard: number;
  };
}

export interface VillageExposure {
  village_id: string;
  name: string;
  district_id: string;
  exposure: {
    population: {
      total: number;
      breakdown: {
        children_0_5: number;
        children_6_14: number;
        adults_15_59: number;
        elderly_60plus: number;
      };
      at_risk: number;
    };
    buildings: {
      total: number;
      residential: number;
      commercial: number;
      industrial: number;
      institutional: number;
      at_risk: number;
    };
    critical_facilities: Array<{
      type: string;
      name: string;
      beds?: number;
      students?: number;
      coverage?: number;
      in_hazard_zone: boolean;
      criticality: "critical" | "high" | "medium" | "low";
    }>;
    economic_assets: {
      agricultural_land_hectares: number;
      livestock_heads: number;
      market_presence: boolean;
      estimated_annual_income_lakhs: number;
    };
  };
}

export interface VulnerabilityScore {
  village_id: string;
  name: string;
  vulnerability_assessment: {
    composite_score: number;
    vulnerability_band: "HIGH" | "MEDIUM" | "LOW";
    interpretation: string;
  };
  factor_scores: Array<{
    factor: string;
    score: number;
    evidence: string;
    contribution: number;
  }>;
  confidence: {
    overall: number;
    data_quality: string;
    data_sources: string[];
  };
}

// ============================================================================
// ENGINE 3: RELOCATION INTELLIGENCE
// ============================================================================

export interface RelocationSite {
  site_id: string;
  name: string;
  district: string;
  location: { lat: number; lon: number };
  suitability: {
    score: number;
    grade: "A" | "B" | "C" | "D";
    factors: Record<string, number>;
  };
  carrying_capacity: {
    total_capacity_people: number;
    land_hectares: number;
    current_occupancy_people: number;
    available_slots_people: number;
  };
  is_available: boolean;
}

export interface RelocationPriority {
  village_id: string;
  name: string;
  location: { lat: number; lon: number };
  relocation_priority: {
    tier: "immediate" | "short_term" | "medium_term" | "monitor";
    score: number;
    interpretation: string;
  };
  priority_score_breakdown: Record<string, { value: any; score: number; weight: number }>;
  assigned_site: {
    site_id: string;
    name: string;
    location: { lat: number; lon: number };
    distance_km: number;
    suitability_score: number;
    matching_score: number;
  };
  relocation_plan: {
    population_to_relocate: number;
    households_to_relocate: number;
    estimated_timeline_days: number;
  };
}

// ============================================================================
// ENGINE 4: GIS DASHBOARD
// ============================================================================

export interface DashboardSummary {
  timestamp: string;
  national_overview: {
    districts_monitored: number;
    villages_assessed: number;
    population_at_risk_millions: number;
    red_zones_identified: number;
    suitable_sites_identified: number;
  };
  active_incidents: {
    hazard_events: number;
    active_evacuations: number;
    ongoing_relocations: number;
  };
  alerts_summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  performance_metrics: {
    avg_response_time_hours: number;
    villages_evacuated_month: number;
    population_relocated_month: number;
  };
}

export interface Alert {
  alert_id: number;
  type: "Hazard" | "Capacity" | "Timeline";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  affected_villages: number;
  recommended_action: string;
  created_at: string;
  is_active: boolean;
}

export interface DisasterEvent {
  event_id: number;
  name: string;
  type: string;
  district: string;
  start_date: string;
  end_date?: string;
  severity: "low" | "medium" | "high" | "extreme";
  casualties: number;
  population_affected: number;
  people_evacuated: number;
  property_damage_lakhs: number;
}

// ============================================================================
// APP STATE
// ============================================================================

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: string | null;
}

export interface AppState {
  auth: AuthState;
  selectedDistrict: string | null;
  selectedVillage: string | null;
  districts: District[];
  villages: Village[];
  loading: boolean;
  error: string | null;
}
