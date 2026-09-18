import type { HazardKey } from "../lib/types";

export interface HazardInfo {
  key: HazardKey;
  name: string;
  tagline: string;
  definition: string;
  season: string;
  regions: string;
  /** Data behind each estimate, shown in "How we estimate this". */
  method: { formula: string; inputs: { factor: string; weight?: string; source: string; kind: "live-capable" | "climatology" | "history" | "static" }[]; occurrence: string };
  scale: { title: string; rows: [string, string][] };
  before: string[];
  during: string[];
  after: string[];
  warnings: { agency: string; what: string }[];
}

export const HAZARD_INFO: Record<HazardKey, HazardInfo> = {
  flood: {
    key: "flood",
    name: "Flood",
    tagline: "River overflow, flash flooding and urban waterlogging",
    definition:
      "Inundation of normally dry land when rainfall, river discharge or storm surge exceeds the carrying capacity of the terrain. India's floods concentrate in the Ganga–Brahmaputra basins and deltaic coasts, and are set off by monsoon rainfall over several days.",
    season: "June – September (SW monsoon); October – December for Tamil Nadu (NE monsoon)",
    regions: "Bihar, Assam, Uttar Pradesh, West Bengal, Odisha, Kerala, coastal Andhra Pradesh and Tamil Nadu",
    method: {
      formula: "S = 0.35·rain + 0.25·low-elevation + 0.20·river-proximity + 0.10·flat-terrain + 0.10·built-up   →   P = S × (0.3 + 0.7 × T)",
      inputs: [
        { factor: "Rain factor (5-day maximum rainfall)", weight: "0.35", source: "NASA POWER daily rainfall, 2014–2023", kind: "climatology" },
        { factor: "Low-elevation factor", weight: "0.25", source: "SRTM elevation (via Open-Meteo)", kind: "static" },
        { factor: "River-proximity / floodplain factor", weight: "0.20", source: "Natural Earth major rivers + floodplain proxy", kind: "static" },
        { factor: "Flat-terrain factor", weight: "0.10", source: "SRTM relief within 13 km", kind: "static" },
        { factor: "Built-up / runoff factor", weight: "0.10", source: "Census 2011 population density", kind: "static" },
        { factor: "Trigger frequency T", source: "Share of years with a ≥ 64.5 mm/day (IMD 'heavy rain') day", kind: "climatology" },
      ],
      occurrence: "P is the modelled chance that a damaging flood-generating rainfall event occurs in the district in a given year.",
    },
    scale: { title: "IMD 24-hour rainfall classes", rows: [["Heavy", "64.5 – 115.5 mm"], ["Very heavy", "115.6 – 204.4 mm"], ["Extremely heavy", "≥ 204.5 mm"]] },
    before: [
      "Find out your habitation's flood history and the nearest raised shelter; agree a family meeting point.",
      "Pack an emergency kit: drinking water, ORS, medicines, torch, radio, dry food and documents in a waterproof bag.",
      "Keep valuables, grain and fodder on upper floors or raised platforms; raise hand-pumps and toilets above flood level.",
      "Clear drains and nullahs near the house; keep sandbags and a rope ready.",
      "Track IMD and CWC flood advisories; do not wait for the water to rise before moving livestock.",
    ],
    during: [
      "Move to higher ground or the designated flood shelter as soon as the order is given — do not return for belongings.",
      "Never walk or drive through flowing water; even shallow fast water can sweep a person or vehicle away.",
      "Switch off electricity and gas at the mains; stay away from fallen wires.",
      "Drink only boiled or chlorinated water; keep children and the elderly together.",
    ],
    after: [
      "Return only when authorities declare the area safe; check the building for cracks before entering.",
      "Disinfect wells and stored water; discard food that touched flood water.",
      "Photograph damage for relief and insurance claims; report missing persons to the control room.",
    ],
    warnings: [
      { agency: "Central Water Commission (CWC)", what: "River flood forecasts and level alerts at gauge stations" },
      { agency: "India Meteorological Department (IMD)", what: "Heavy-rainfall colour-coded warnings by district" },
      { agency: "NDMA Sachet app", what: "Location-based CAP alerts on mobile" },
    ],
  },
  landslide: {
    key: "landslide",
    name: "Landslide",
    tagline: "Slope failure, debris flow and rockfall in hills",
    definition:
      "Downslope movement of rock, soil or debris. Steep, fractured and deforested slopes fail when intense or prolonged rain saturates them; road cutting and unplanned construction make it worse. Roughly one eighth of India's land area is landslide-prone.",
    season: "June – September; also post-monsoon in the NE hills and Nilgiris",
    regions: "Himalayan arc (J&K to Arunachal), North-East hills, Western Ghats, Nilgiris, Eastern Ghats",
    method: {
      formula: "S = gate(relief) × (0.45·slope + 0.25·rain + 0.20·history + 0.10·stream-proximity)   →   P = S × (0.3 + 0.7 × T)",
      inputs: [
        { factor: "Slope / relief factor", weight: "0.45", source: "SRTM elevation, relief within 13 km", kind: "static" },
        { factor: "Rain factor (1-day maximum rainfall)", weight: "0.25", source: "NASA POWER daily rainfall, 2014–2023", kind: "climatology" },
        { factor: "Observed landslide history", weight: "0.20", source: "NASA Global Landslide Catalog events within 30 km", kind: "history" },
        { factor: "Stream-proximity factor", weight: "0.10", source: "Natural Earth major rivers", kind: "static" },
        { factor: "Trigger frequency T", source: "Share of years with a ≥ 50 mm/day rainfall day", kind: "climatology" },
      ],
      occurrence:
        "NDVI and lithology layers (weights 0.15 + 0.05 in the field model) need licensed rasters, so this national layer folds their weight into observed landslide history. Flat terrain gates the score to near zero.",
    },
    scale: { title: "Warning signs on a slope", rows: [["Ground", "New cracks, bulging or sinking"], ["Trees & poles", "Tilting or leaning"], ["Water", "New springs, muddy streams, sudden drop in flow"], ["Sound", "Faint rumbling or cracking"]] },
    before: [
      "Ask the district office for the local landslide susceptibility map before building or buying land.",
      "Do not build on steep slopes, at the toe of a slope or in drainage lines; keep a safe setback from cuttings.",
      "Keep roof and surface drains clear so water does not soak the slope; plant deep-rooted vegetation.",
      "Learn the ground warning signs and agree an evacuation route that avoids the slide path.",
    ],
    during: [
      "Leave the area immediately if you see or hear signs of movement — run sideways out of the path, not downhill along it.",
      "Avoid river banks and valleys where debris flows collect; stay off slopes and roads during heavy rain.",
      "If escape is impossible, curl into a tight ball and protect your head.",
    ],
    after: [
      "Stay away from the slide area — further slips are common after the first.",
      "Check for injured people nearby and call 112; report broken roads, power lines and water pipes.",
      "Have the slope assessed by a geologist before anyone returns.",
    ],
    warnings: [
      { agency: "Geological Survey of India (GSI)", what: "Nodal agency for landslide susceptibility and early-warning pilots" },
      { agency: "India Meteorological Department (IMD)", what: "Heavy-rainfall warnings that act as the landslide trigger" },
      { agency: "State Disaster Management Authorities", what: "Local road closures and pilgrim/tourist advisories" },
    ],
  },
  cloudburst: {
    key: "cloudburst",
    name: "Cloudburst",
    tagline: "Extreme short-duration rain that triggers flash floods",
    definition:
      "A localised burst of very heavy rain — commonly taken as about 100 mm in an hour over a small area of some tens of square kilometres. On steep terrain it becomes a flash flood or debris flow within minutes, with almost no lead time.",
    season: "June – September, peaking July–August",
    regions: "Uttarakhand, Himachal Pradesh, J&K, Ladakh, Sikkim, Arunachal Pradesh, Western Ghats",
    method: {
      formula: "S = hill-gate × (0.70·intensity + 0.30·orographic-lift)   →   P = 0.9 × S × (0.3 + 0.7 × T)",
      inputs: [
        { factor: "Rainfall-intensity factor", weight: "0.70", source: "NASA POWER daily rainfall (annual 1-day maxima)", kind: "climatology" },
        { factor: "Orographic factor", weight: "0.30", source: "SRTM elevation and relief", kind: "static" },
        { factor: "Trigger frequency T", source: "Share of years with a ≥ 50 mm/day rainfall day", kind: "climatology" },
      ],
      occurrence:
        "Cloudbursts are too small for a 0.5° climate grid to see directly, so this layer scores where the physical conditions — intense rain over steep, high terrain — make them likely. Treat it as relative susceptibility.",
    },
    scale: { title: "How it differs from heavy rain", rows: [["Duration", "Minutes to about an hour"], ["Area", "Tens of km²"], ["Lead time", "Often under 30 minutes"], ["Typical result", "Flash flood + debris flow"]] },
    before: [
      "Avoid camping, parking or building in river beds, stream channels and narrow valley floors.",
      "Know the nearest high ground and how to reach it on foot in a few minutes.",
      "Follow pilgrimage and tourist advisories — delay travel when IMD issues an orange or red warning for your district.",
    ],
    during: [
      "Move immediately to higher ground away from streams; do not wait to see the water.",
      "Stay out of tunnels, underpasses and roadside gullies; do not cross swollen streams.",
      "Keep listening to the radio or SMS alerts for follow-up warnings — second bursts are common.",
    ],
    after: [
      "Expect flash floods and landslides downstream and on slopes for several hours.",
      "Do not return to low-lying campsites or shops until the stream level has fallen and authorities clear it.",
    ],
    warnings: [
      { agency: "India Meteorological Department (IMD)", what: "Nowcasts and very-heavy-rain warnings for hill districts" },
      { agency: "State Disaster Management Authorities", what: "Yatra and tourism holds; siren / SMS alerts" },
    ],
  },
  coastal: {
    key: "coastal",
    name: "Coastal erosion",
    tagline: "Shoreline retreat and storm-surge damage to coastal habitations",
    definition:
      "Loss of land as waves, currents, storm surge and sea-level rise remove sand and soil. Roughly a third of India's mainland coast shows some erosion in national shoreline-change assessments; the rate is highest in the Sundarbans, Kerala, Tamil Nadu and parts of Odisha.",
    season: "Year-round; sharply worse in the monsoon swell and cyclone seasons",
    regions: "West Bengal, Odisha, Andhra Pradesh, Tamil Nadu, Puducherry, Kerala, Karnataka, Gujarat",
    method: {
      formula: "S = 0.50·coast-distance + 0.30·cyclone-frequency + 0.20·shoreline-change-class   →   P = 0.9 × S",
      inputs: [
        { factor: "Distance-to-coast factor", weight: "0.50", source: "Natural Earth 10 m coastline, district centre point", kind: "static" },
        { factor: "Cyclone factor", weight: "0.30", source: "NOAA IBTrACS storms within 150 km, 1990–2023", kind: "history" },
        { factor: "Shoreline-change class", weight: "0.20", source: "State-level class (high / medium / lower) after NCCR shoreline-change studies — indicative", kind: "static" },
      ],
      occurrence:
        "Only districts within 30 km of the coast are scored; inland districts show 0. The state-level erosion class is an indicative categorisation, not a measured rate — refine it with NCCR shoreline-change data.",
    },
    scale: { title: "What it puts at risk", rows: [["Habitations", "Fishing hamlets on the shoreline"], ["Livelihood", "Fishing, salt-pans, coconut and casuarina belts"], ["Infrastructure", "Coastal roads, jetties, drinking-water sources"]] },
    before: [
      "Keep new construction outside the Coastal Regulation Zone setback; avoid rebuilding on the eroding front.",
      "Protect and restore mangroves, dunes and shelter-belt plantation — they are the cheapest sea wall.",
      "Keep boats, nets and cattle away from the surf line during swell alerts.",
    ],
    during: [
      "Heed INCOIS high-wave and swell-surge alerts; keep off the beach and jetties.",
      "Move to a cyclone shelter when a surge warning is issued.",
    ],
    after: [
      "Survey newly exposed houses and wells; register affected families for relocation assessment.",
      "Repair or reposition embankments only after an engineering assessment of the new shoreline.",
    ],
    warnings: [
      { agency: "INCOIS", what: "Swell-surge and high-wave alerts, tsunami advisories" },
      { agency: "NCCR", what: "National shoreline-change assessment" },
      { agency: "India Meteorological Department (IMD)", what: "Cyclone and surge warnings" },
    ],
  },
  cyclone: {
    key: "cyclone",
    name: "Cyclone",
    tagline: "Tropical cyclones from the Bay of Bengal and Arabian Sea",
    definition:
      "Intense low-pressure systems with winds of 62 km/h or more, storm surge and torrential rain. The North Indian Ocean has two seasons; the Bay of Bengal (east coast) produces most of the landfalling storms.",
    season: "April – June and October – December",
    regions: "Odisha, West Bengal, Andhra Pradesh, Tamil Nadu, Puducherry, Gujarat, Maharashtra coast",
    method: {
      formula: "P = share of seasons (1990–2023) in which at least one cyclonic storm passed within 150 km of the district",
      inputs: [
        { factor: "Storm tracks ≥ 34 kt (IMD 'Cyclonic Storm')", source: "NOAA IBTrACS, North Indian Ocean basin", kind: "history" },
        { factor: "Track distance to district centre", source: "Great-circle distance to each 3–6-hourly track segment", kind: "history" },
      ],
      occurrence: "This is an empirical frequency, not a model — the chance that a cyclonic storm passes within 150 km in a given season.",
    },
    scale: { title: "IMD storm classes (3-min sustained wind)", rows: [["Cyclonic Storm", "34 – 47 kt (62 – 88 km/h)"], ["Severe Cyclonic Storm", "48 – 63 kt"], ["Very Severe", "64 – 89 kt"], ["Extremely Severe", "90 – 119 kt"], ["Super Cyclonic Storm", "≥ 120 kt"]] },
    before: [
      "Know your cyclone shelter and route; keep a 7-day stock of water, dry food, medicines and a charged phone bank.",
      "Secure roofs, doors and loose objects; store documents in waterproof covers.",
      "Fishermen must not venture out once a warning is issued — return to harbour and secure boats.",
    ],
    during: [
      "Evacuate to the shelter when ordered — do not wait for winds to rise.",
      "Stay indoors away from windows; do not go out in the calm of the eye — the winds return from the opposite side.",
      "Keep listening to the radio for IMD bulletins.",
    ],
    after: [
      "Avoid fallen power lines and flooded roads; drink only safe water.",
      "Return only when authorities say so; check the structure before re-entering.",
    ],
    warnings: [
      { agency: "India Meteorological Department (IMD)", what: "Cyclone bulletins with colour-coded district warnings and landfall tracks" },
      { agency: "NDMA Sachet app", what: "Location-based CAP alerts" },
    ],
  },
  heatwave: {
    key: "heatwave",
    name: "Heatwave",
    tagline: "Prolonged extreme temperatures, worst on the plains before the monsoon",
    definition:
      "IMD declares a heatwave when maximum temperature reaches 40 °C on the plains (30 °C in hills) and runs 4.5 °C or more above normal — or reaches 45 °C — for at least two days. It kills through heat stroke, dehydration and the strain it puts on the elderly and outdoor workers.",
    season: "March – June",
    regions: "Rajasthan, Gujarat, Madhya Pradesh, Uttar Pradesh, Delhi, Punjab, Haryana, Vidarbha, Odisha, Telangana",
    method: {
      formula: "P = share of years (2014–2023) with at least one IMD-criteria heatwave spell (≥ 2 consecutive days)",
      inputs: [
        { factor: "Daily maximum temperature, departure from calendar-day normal", source: "NASA POWER (MERRA-2) T2M_MAX", kind: "climatology" },
        { factor: "Hill / plains threshold", source: "30 °C above 1,000 m elevation, else 40 °C", kind: "static" },
      ],
      occurrence:
        "Reanalysis grid cells average out local extremes, so counts are conservative against station records. Heatwaves count at 40% weight in the multi-hazard red-zone score — they do not make land unfit for habitation.",
    },
    scale: { title: "IMD heatwave criteria (plains)", rows: [["Heat wave", "Tmax ≥ 40 °C and departure 4.5 – 6.4 °C"], ["Severe heat wave", "Departure > 6.4 °C"], ["By absolute value", "≥ 45 °C heat wave · ≥ 47 °C severe"]] },
    before: [
      "Adopt the district Heat Action Plan: cool shelters, shaded water points and altered working hours for outdoor labour.",
      "Keep ORS, water and lemon-salt water at home; paint or shade roofs where possible.",
    ],
    during: [
      "Avoid the sun between 12 and 4 pm; wear loose cotton clothes and cover the head.",
      "Drink water often even if not thirsty; watch the elderly, infants and outdoor workers.",
      "Heat stroke (body temperature above 40 °C, confusion, no sweating): move the person to shade, cool them with wet cloths and call 108/112 at once.",
      "Never leave a child or pet in a parked vehicle.",
    ],
    after: [
      "Keep hydrating for a day or two; recovering patients need rest in a cool place.",
      "Review which households lacked cooling or water and feed that into the next Heat Action Plan.",
    ],
    warnings: [
      { agency: "India Meteorological Department (IMD)", what: "Heat-wave warnings up to 5 days ahead by district" },
      { agency: "NDMA / State Heat Action Plans", what: "Cool-roof, shelter and advisory guidance" },
    ],
  },
};
