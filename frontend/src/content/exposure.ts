/**
 * Module 2 framework: what is exposed, and who is vulnerable.
 * Every variable carries an honest data status:
 *   census  = real Census-of-India 2011 district value shown
 *   derived = computed by the model from data we already hold
 *   osm     = counted live from OpenStreetMap for the selected district
 *   gap     = needs a department / survey dataset — the integration point is defined, the value is not invented
 */
export type Status = "census" | "derived" | "osm" | "gap";

export interface Var { name: string; status: Status; key?: string }
export interface Category { id: string; title: string; icon: string; blurb: string; vars: Var[] }

export const STATUS_LABEL: Record<Status, string> = {
  census: "Census 2011",
  derived: "Model-derived",
  osm: "OpenStreetMap · live",
  gap: "Needs survey data",
};

const v = (name: string, status: Status, key?: string): Var => ({ name, status, key });

export const EXPOSURE_CATEGORIES: Category[] = [
  {
    id: "population", title: "Population exposure", icon: "👥", blurb: "Who lives in the hazard footprint.",
    vars: [
      v("Total population", "census", "pop"), v("Population density", "census", "dens"), v("Age distribution", "census", "age"),
      v("Children population (age 0–29 share)", "census", "a30"), v("Elderly population (age 50+ share)", "census", "a50"),
      v("Working-age population", "census", "work"), v("Population with disabilities (national prevalence)", "derived", "dis"),
      v("Household density", "derived", "hhdens"), v("Household size", "census", "hhsize"), v("Population growth", "gap"),
      v("Seasonal population", "gap"), v("Tourist population (hotel-capacity proxy)", "osm", "osm:hotel"), v("Migrant population", "gap"),
      v("Population in hazard zones", "derived", "expo_pop"),
    ],
  },
  {
    id: "residential", title: "Residential exposure", icon: "🏘️", blurb: "Homes and their ability to withstand the hazard.",
    vars: [
      v("Number of residential units (households)", "census", "hh"), v("Residential building density", "gap"), v("Building footprints", "gap"),
      v("Building height", "gap"), v("Number of floors", "gap"), v("Building construction type (condition)", "census", "c:dil"),
      v("Building age", "gap"), v("Housing type — owned households", "gap"), v("Informal settlements (dilapidated-house proxy)", "derived", "c:dil"),
      v("Number of households", "census", "hh"), v("Residential property value", "gap"), v("Population per building", "derived", "hhsize"),
    ],
  },
  {
    id: "critical", title: "Critical infrastructure", icon: "🏥", blurb: "Facilities whose loss hurts the response.",
    vars: [
      v("Hospitals", "osm", "osm:hospital"), v("Clinics", "osm", "osm:clinic"), v("Schools", "osm", "osm:school"),
      v("Universities & colleges", "osm", "osm:college"), v("Fire stations", "osm", "osm:fire"), v("Police stations", "osm", "osm:police"),
      v("Ambulance stations", "gap"), v("Emergency shelters", "osm", "osm:shelter"), v("Government facilities", "gap"),
      v("Power plants", "osm", "osm:powerplant"), v("Electrical substations", "osm", "osm:substation"), v("Water-treatment plants & towers", "osm", "osm:water"),
      v("Water-supply infrastructure (tap-water households)", "census", "c:tap"), v("Sewage-treatment plants", "osm", "osm:sewage"),
      v("Telecommunication towers", "osm", "osm:mast"), v("Fuel stations", "osm", "osm:fuel"), v("Waste-treatment facilities", "gap"),
    ],
  },
  {
    id: "transport", title: "Transportation exposure", icon: "🛣️", blurb: "Roads, rail and hubs that evacuation depends on.",
    vars: [
      v("Roads", "gap"), v("Road length", "gap"), v("Road density", "gap"), v("Bridges", "osm", "osm:bridge"),
      v("Railway lines", "gap"), v("Railway stations", "osm", "osm:rail"), v("Airports", "osm", "osm:airport"), v("Ports", "gap"),
      v("Bus terminals", "osm", "osm:bus"), v("Public-transit infrastructure", "osm", "osm:bus+rail"),
      v("Evacuation routes (computed per habitation in Module 3)", "derived", "evac"), v("Transportation hubs", "osm", "osm:rail+bus+airport"),
    ],
  },
  {
    id: "economic", title: "Economic exposure", icon: "💼", blurb: "Livelihoods and assets at stake.",
    vars: [
      v("GDP", "gap"), v("GDP per capita", "gap"), v("Property value", "gap"), v("Building replacement value", "gap"),
      v("Business locations", "gap"), v("Business density", "gap"), v("Industrial facilities", "gap"), v("Industrial asset value", "gap"),
      v("Commercial facilities", "gap"), v("Employment density (workers per km²)", "derived", "workdens"),
      v("Agricultural assets (agriculture-dependent workers)", "census", "c:agri"), v("Tourism assets", "osm", "osm:hotel+attraction"), v("Supply-chain facilities", "gap"),
    ],
  },
  {
    id: "tourism", title: "Tourism & hospitality", icon: "🏨", blurb: "Visitors are exposed and unfamiliar with local hazards.",
    vars: [
      v("Hotels, resorts, hostels & guest houses", "osm", "osm:hotel"), v("Restaurants", "gap"), v("Tourist attractions", "osm", "osm:attraction"),
      v("Tourist population (proxy)", "osm", "osm:hotel"), v("Hotel capacity (≈ 30 beds per property, assumption)", "derived", "hotelcap"),
      v("Tourism density (properties per 100 km²)", "derived", "tourdens"), v("Seasonal tourism", "gap"), v("Tourism revenue", "gap"),
      v("Coastal recreational facilities", "gap"),
    ],
  },
  {
    id: "agri", title: "Agricultural exposure", icon: "🌾", blurb: "Crops, livestock and the food system.",
    vars: [
      v("Cropland & agricultural area", "gap"), v("Crop type", "gap"), v("Crop value", "gap"), v("Livestock", "gap"),
      v("Irrigation infrastructure", "gap"), v("Agricultural buildings", "gap"), v("Food-storage facilities", "gap"),
      v("Agricultural employment (cultivators + labourers)", "census", "c:agri"),
    ],
  },
  {
    id: "social", title: "Social vulnerability", icon: "🫂", blurb: "Who is least able to cope and recover.",
    vars: [
      v("Poverty (asset-deprivation index)", "derived", "assetdep"), v("Low-income households (no LPG, no lighting)", "derived", "c:lpg-"),
      v("Unemployment (non-workers)", "derived", "nonwork"), v("Elderly population", "census", "a50"), v("Children", "census", "a30"),
      v("Disability prevalence", "derived", "dis"), v("Female-headed households", "gap"), v("Single-person households", "gap"),
      v("Housing insecurity (dilapidated homes)", "census", "c:dil"), v("Informal settlements", "derived", "c:dil"),
      v("Vehicle ownership", "census", "veh"), v("Access to healthcare (hospitals per lakh people)", "osm", "hosp100k"),
      v("Access to transportation", "census", "veh"), v("Digital connectivity (phone / internet homes)", "census", "c:phone"),
      v("Education level (literacy)", "census", "c:lit"),
    ],
  },
  {
    id: "health", title: "Healthcare vulnerability", icon: "⚕️", blurb: "Can the health system absorb a surge?",
    vars: [
      v("Hospital accessibility", "osm", "osm:hospital"), v("Hospital capacity", "gap"), v("Hospital beds", "gap"), v("Healthcare-worker availability", "gap"),
      v("Distance to healthcare (computed per habitation)", "derived", "evac"), v("Emergency medical capacity", "gap"),
      v("Elderly-care facilities", "gap"), v("Nursing homes", "gap"), v("Population dependent on health services (aged 50+)", "census", "a50"),
    ],
  },
  {
    id: "access", title: "Accessibility & evacuation", icon: "🚌", blurb: "Can people actually get out?",
    vars: [
      v("Distance to hospitals", "derived", "evac"), v("Distance to emergency shelters", "derived", "evac"), v("Distance to roads", "derived", "evac"),
      v("Travel time to shelters (real road routing)", "derived", "evac"), v("Road accessibility", "derived", "evac"), v("Public-transport accessibility", "osm", "osm:bus"),
      v("Evacuation-route availability & redundancy (alternative routes)", "derived", "evac"), v("Population without vehicle access", "census", "noveh"),
      v("Isolated population", "gap"), v("Emergency response time", "derived", "evac"),
    ],
  },
  {
    id: "env", title: "Environmental exposure", icon: "🌿", blurb: "Ecosystems that buffer — and can be lost.",
    vars: [
      v("Wetlands", "gap"), v("Mangroves", "gap"), v("Forests", "gap"), v("Agricultural ecosystems", "gap"), v("Coastal ecosystems", "gap"),
      v("Coral reefs", "gap"), v("Seagrass", "gap"), v("Protected areas", "osm", "osm:protected"), v("Biodiversity areas", "gap"), v("Ecosystem-service value", "gap"),
    ],
  },
  {
    id: "culture", title: "Cultural exposure", icon: "🏛️", blurb: "Heritage that cannot be replaced.",
    vars: [
      v("Heritage sites", "osm", "osm:heritage"), v("Historical buildings", "osm", "osm:heritage"), v("Archaeological sites", "osm", "osm:heritage"),
      v("Museums", "osm", "osm:attraction"), v("Monuments", "osm", "osm:heritage"), v("Religious sites", "osm", "osm:worship"),
      v("UNESCO sites", "gap"), v("Libraries", "gap"), v("Archives", "gap"),
    ],
  },
  {
    id: "digital", title: "Digital & communication", icon: "📡", blurb: "Warnings only work if the network stays up.",
    vars: [
      v("Cellular towers", "osm", "osm:mast"), v("Communication networks (households with a phone)", "census", "c:phone"),
      v("Internet infrastructure (households with internet)", "census", "c:net"), v("Data centers", "gap"), v("Emergency communication systems", "gap"), v("Network coverage", "gap"),
    ],
  },
  {
    id: "lifeline", title: "Utility & lifeline", icon: "💡", blurb: "Power, water, fuel and drainage.",
    vars: [
      v("Electricity network (households with lighting)", "census", "c:elec"), v("Gas infrastructure (LPG/PNG households)", "census", "c:lpg"),
      v("Water network (tap-water households)", "census", "c:tap"), v("Sewer network (latrine within premises)", "census", "c:latrine"),
      v("Drainage network", "gap"), v("Telecommunications", "osm", "osm:mast"), v("Fuel infrastructure", "osm", "osm:fuel"), v("Waste-management infrastructure", "gap"),
    ],
  },
  {
    id: "location", title: "Location-based exposure", icon: "📍", blurb: "Computed for every asset, person or grid cell against the hazard layer.",
    vars: [
      v("Distance to hazard boundary (nearest safe district)", "derived", "safekm"), v("Distance to hazard source (river / coast)", "derived", "src"),
      v("Hazard-zone overlap", "derived", "zone"), v("Hazard intensity at location", "derived", "risk"), v("Population within hazard zone", "derived", "expo_pop"),
      v("Asset count within hazard zone", "derived", "assets_in"), v("Asset value within hazard zone", "gap"),
      v("Critical facilities within hazard zone", "derived", "crit_in"), v("Infrastructure length within hazard zone", "gap"),
      v("Percentage of population exposed", "derived", "expo_frac"), v("Percentage of assets exposed", "derived", "expo_frac"),
      v("Percentage of critical infrastructure exposed", "derived", "expo_frac"),
    ],
  },
];

export interface VulnFactor { id: string; label: string; weight: number; group: string; desc: string }

/** Order must match meta.vuln_factors and the `vf` array in districts.json. */
export const VULN_FACTORS: VulnFactor[] = [
  { id: "illiteracy", label: "Illiteracy", weight: 0.12, group: "Social", desc: "Share of people who cannot read and write — weaker uptake of written warnings and instructions." },
  { id: "scst", label: "Scheduled Caste / Tribe share", weight: 0.08, group: "Social", desc: "Historically marginalised groups more often live on hazardous land with less recovery support." },
  { id: "elderly", label: "Aged 50+ share", weight: 0.08, group: "Demographic", desc: "Older people are slower to evacuate and more exposed to health shocks (Census age bands: 0–29, 30–49, 50+)." },
  { id: "agri", label: "Agriculture-dependent workers", weight: 0.10, group: "Economic", desc: "Cultivators and agricultural labourers lose income directly when crops and land are damaged." },
  { id: "no_elec", label: "Homes without electric lighting", weight: 0.08, group: "Asset", desc: "A basic asset-deprivation marker — also less access to phone charging and alerts." },
  { id: "no_lpg", label: "Homes without clean cooking fuel", weight: 0.10, group: "Asset", desc: "Proxy for poverty; fuel-wood collection adds to slope and river exposure." },
  { id: "dilapidated", label: "Dilapidated houses", weight: 0.12, group: "Housing", desc: "Weak structures fail first in floods, cyclones and slides." },
  { id: "no_vehicle", label: "Households without a vehicle", weight: 0.10, group: "Access", desc: "No car, two-wheeler (and half-weighted bicycle) means dependence on public evacuation transport." },
  { id: "no_phone", label: "Households without a phone", weight: 0.06, group: "Communication", desc: "Cannot receive SMS / Sachet alerts or call for help." },
  { id: "water_far", label: "Drinking-water source away from home", weight: 0.08, group: "Services", desc: "Longer trips to water sources raise exposure and slow post-disaster recovery." },
  { id: "no_latrine", label: "No latrine within premises", weight: 0.08, group: "Services", desc: "Sanitation gaps multiply disease risk after flooding." },
];

export interface CoreGroup { title: string; items: { name: string; key: string }[] }

/** The compact feature set a first ML/decision model would actually use — the rest of the framework is largely redundant with it. */
export const CORE_FEATURES: CoreGroup[] = [
  { title: "Population", items: [{ name: "Population density", key: "dens" }, { name: "Total population", key: "pop" }, { name: "Elderly (50+) %", key: "a50" }, { name: "Age 0–29 %", key: "a30" }, { name: "Disability % (national)", key: "dis" }, { name: "Asset deprivation", key: "assetdep" }, { name: "Tourist capacity proxy", key: "hotelcap" }] },
  { title: "Buildings", items: [{ name: "Household density", key: "hhdens" }, { name: "Dilapidated houses %", key: "c:dil" }, { name: "Household size", key: "hhsize" }] },
  { title: "Infrastructure", items: [{ name: "Hospitals", key: "osm:hospital" }, { name: "Schools", key: "osm:school" }, { name: "Emergency facilities", key: "osm:fire+police" }, { name: "Power & water assets", key: "osm:substation+water" }, { name: "Bridges", key: "osm:bridge" }, { name: "Railway stations", key: "osm:rail" }] },
  { title: "Economy", items: [{ name: "Employment density", key: "workdens" }, { name: "Agricultural workers %", key: "c:agri" }, { name: "Tourism & hospitality assets", key: "osm:hotel+attraction" }] },
  { title: "Accessibility", items: [{ name: "Distance to nearest safe district", key: "safekm" }, { name: "Households without a vehicle", key: "noveh" }, { name: "Evacuation accessibility", key: "evac" }] },
  { title: "Hazard interaction", items: [{ name: "Flood probability", key: "p:flood" }, { name: "Coastal-erosion likelihood", key: "p:coastal" }, { name: "Cloudburst probability", key: "p:cloudburst" }, { name: "Landslide probability", key: "p:landslide" }] },
];

export const PIPELINE = [
  { title: "Hazard models", note: "Module 1 — six hazard probabilities" },
  { title: "Probability & intensity", note: "Annual occurrence + 72-h live outlook" },
  { title: "Exposure model", note: "Who and what sits in the footprint" },
  { title: "Vulnerability model", note: "How badly they are hurt" },
  { title: "Risk", note: "Hazard × exposure × vulnerability" },
  { title: "Relocation / decision support", note: "Module 3 — where people should move" },
];
