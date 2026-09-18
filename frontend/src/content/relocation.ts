/**
 * Module 3 framework — where people can safely move, how many can be accommodated, how fast they get there,
 * and whether the route stays usable as the hazard evolves.
 *   live    = read from a live feed (forecast, road routing) during the analysis
 *   model   = computed by the planner from terrain, hazard model and OpenStreetMap
 *   input   = an operator input in the planner (population, fleet, time to impact)
 *   gap     = needs a department dataset (shelter registers, road-condition surveys, cost tables)
 */
export type RStatus = "live" | "model" | "input" | "gap";

export const RSTATUS_LABEL: Record<RStatus, string> = {
  live: "Live feed",
  model: "Computed here",
  input: "Operator input",
  gap: "Needs department data",
};

export interface RVar { name: string; status: RStatus }
export interface RCategory { title: string; icon: string; vars: RVar[] }

const r = (name: string, status: RStatus): RVar => ({ name, status });

export const RELOCATION_FRAMEWORK: RCategory[] = [
  {
    title: "Hazard safety", icon: "🛡️",
    vars: [
      r("Current hazard probability", "model"), r("Predicted hazard probability (72 h)", "live"), r("Hazard intensity", "live"), r("Hazard severity", "model"),
      r("Hazard extent", "gap"), r("Hazard propagation direction", "gap"), r("Hazard arrival time", "live"), r("Time-to-impact", "live"),
      r("Multi-hazard exposure", "model"), r("Secondary hazard probability", "model"), r("Future hazard probability", "model"), r("Safety buffer from hazard zone", "model"),
    ],
  },
  {
    title: "Candidate safe location", icon: "📍",
    vars: [
      r("Location coordinates", "model"), r("Elevation", "live"), r("Slope", "live"), r("Distance from hazard zone", "model"), r("Distance from rivers", "live"),
      r("Distance from coastline", "model"), r("Distance from unstable slopes", "model"), r("Historical hazard frequency", "model"), r("Current hazard status", "live"),
      r("Future hazard exposure", "model"), r("Multi-hazard risk", "model"), r("Land availability", "gap"), r("Land-use type", "gap"),
    ],
  },
  {
    title: "Capacity", icon: "🏫",
    vars: [
      r("Shelter capacity (schools, halls, colleges)", "model"), r("Available beds (hospitals nearby)", "model"), r("Available floor space", "gap"), r("Population currently present", "gap"),
      r("Remaining capacity", "model"), r("Maximum safe occupancy", "model"), r("Temporary shelter capacity", "model"), r("Hospital capacity", "gap"),
      r("School / public-building capacity", "model"), r("Water availability", "gap"), r("Food availability", "gap"), r("Electricity availability", "gap"), r("Sanitation capacity", "gap"), r("Medical capacity", "gap"),
    ],
  },
  {
    title: "Accessibility", icon: "🛣️",
    vars: [
      r("Road connectivity", "live"), r("Road width", "gap"), r("Road condition", "gap"), r("Bridge availability", "gap"), r("Railway connectivity", "gap"), r("Public transportation", "gap"),
      r("Distance to major roads", "live"), r("Distance to shelters", "model"), r("Distance to hospitals", "model"), r("Distance to emergency services", "model"),
      r("Travel time", "live"), r("Traffic congestion", "gap"), r("Road network density", "gap"), r("Alternative routes", "live"), r("Route redundancy", "live"),
    ],
  },
  {
    title: "Dynamic route safety", icon: "🚧",
    vars: [
      r("Current road status", "live"), r("Flooded roads (forecast wetness × low-lying)", "live"), r("Landslide-blocked roads (forecast wetness × steep grade)", "live"), r("Coastal inundation", "gap"),
      r("Cloudburst waterlogging (hourly intensity)", "live"), r("Road closures (simulated in the planner)", "input"), r("Bridge status", "gap"), r("Traffic conditions", "gap"),
      r("Weather conditions", "live"), r("Hazard propagation", "gap"), r("Estimated route travel time", "live"), r("Remaining evacuation time", "model"), r("Alternative route availability", "live"),
    ],
  },
  {
    title: "Population requirements", icon: "👨‍👩‍👧",
    vars: [
      r("People requiring relocation", "input"), r("Population density", "model"), r("Elderly population (50+, Census)", "model"), r("Children (0–14, national share)", "model"),
      r("Persons with disabilities (national prevalence)", "model"), r("Hospitalised population", "gap"), r("Mobility limitations", "gap"), r("Household size", "model"),
      r("Special medical requirements", "gap"), r("Transportation requirements (buses, waves)", "model"), r("Pet / livestock requirements", "gap"),
    ],
  },
  {
    title: "Emergency services", icon: "🚑",
    vars: [
      r("Distance to hospital", "model"), r("Hospital capacity", "gap"), r("Ambulance availability", "gap"), r("Fire-station proximity", "model"), r("Police-station proximity", "model"),
      r("Search-and-rescue availability", "gap"), r("Emergency response time", "live"), r("Medical supply availability", "gap"), r("Emergency communication coverage", "gap"),
    ],
  },
  {
    title: "Essential services at destination", icon: "🚰",
    vars: [
      r("Drinking water", "gap"), r("Food supply", "gap"), r("Electricity", "gap"), r("Sanitation", "gap"), r("Healthcare (nearest hospital)", "model"), r("Pharmacy access", "model"),
      r("Communication network", "gap"), r("Internet connectivity", "gap"), r("Heating / cooling", "gap"), r("Toilets", "gap"), r("Waste management", "gap"), r("Fuel availability", "model"),
    ],
  },
  {
    title: "Social & community", icon: "🤝",
    vars: [
      r("Household-separation risk", "gap"), r("Community compatibility (closeness)", "model"), r("Accessibility for vulnerable groups", "model"), r("Cultural requirements", "gap"),
      r("Language accessibility", "gap"), r("Family reunification", "gap"), r("Social-support availability", "gap"), r("School availability", "model"), r("Employment accessibility", "gap"),
    ],
  },
  {
    title: "Economic", icon: "💰",
    vars: [
      r("Relocation cost", "gap"), r("Transportation cost (distance proxy)", "model"), r("Shelter cost", "gap"), r("Distance-related cost", "model"),
      r("Economic disruption", "gap"), r("Property-loss exposure", "gap"), r("Employment accessibility", "gap"), r("Local economic capacity", "gap"),
    ],
  },
  {
    title: "Environmental", icon: "🌿",
    vars: [
      r("Protected areas", "gap"), r("Ecologically sensitive areas", "gap"), r("Water availability", "gap"), r("Environmental carrying capacity", "gap"),
      r("Land-use restrictions", "gap"), r("Pollution levels", "gap"), r("Waste-management capacity", "gap"), r("Ecosystem sensitivity", "gap"),
    ],
  },
  {
    title: "Temporal", icon: "⏱️",
    vars: [
      r("Time until hazard arrival", "live"), r("Evacuation start time", "input"), r("Travel time", "live"), r("Shelter preparation time", "input"),
      r("Shelter opening time", "input"), r("Hazard duration", "gap"), r("Expected recovery period", "gap"), r("Future hazard progression (72 h)", "live"),
    ],
  },
];

export const CORE_OBJECTIVES = [
  { title: "Safety", items: ["Hazard probability", "Hazard intensity", "Hazard arrival time", "Distance from hazard", "Multi-hazard exposure", "Future hazard exposure"] },
  { title: "Capacity", items: ["Available capacity", "Current occupancy", "Water capacity", "Food capacity", "Medical capacity", "Sanitation capacity"] },
  { title: "Route", items: ["Travel distance", "Travel time", "Road condition", "Traffic", "Route hazard probability", "Road-closure status", "Alternative-route availability"] },
  { title: "Population", items: ["People requiring evacuation", "Elderly %", "Children %", "Disability %", "Medical requirements", "Mobility requirements"] },
  { title: "Destination quality", items: ["Hospital accessibility", "Emergency-service accessibility", "Essential-service availability", "Communication coverage", "Public transport", "Environmental constraints"] },
];

export const ARCHITECTURE = [
  "Hazard prediction", "Exposure & vulnerability", "Affected population", "Candidate destinations", "Safety filtering",
  "Route calculation", "Capacity check", "Multi-objective optimisation", "Recommended plan", "Dynamic rerouting",
];
