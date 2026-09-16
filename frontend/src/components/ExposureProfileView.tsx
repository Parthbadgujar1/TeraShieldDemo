import React from "react";
import "../styles/ExposureProfileView.css";

interface ExposureProfileViewProps {
  profile: any;
}

const Row: React.FC<{ label: string; value: React.ReactNode; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div className={`epv-row ${highlight ? "epv-row-highlight" : ""}`}>
    <span className="epv-row-label">{label}</span>
    <span className="epv-row-value">{value}</span>
  </div>
);

// `positive` flips the color mapping: for ratings like "emergency access"
// or "accessibility", HIGH is good news (green); for ratings like "water/
// power dependency", HIGH means more exposed to cascading failure (red).
const RatingBadge: React.FC<{ rating: string; positive?: boolean }> = ({ rating, positive }) => {
  const cls = positive
    ? { HIGH: "low", MEDIUM: "medium", LOW: "high" }[rating] || rating.toLowerCase()
    : rating.toLowerCase();
  return <span className={`epv-rating epv-rating-${cls}`}>{rating}</span>;
};

const Section: React.FC<{ icon: string; title: string; note?: string; children: React.ReactNode }> = ({
  icon,
  title,
  note,
  children,
}) => (
  <div className="epv-section">
    <div className="epv-section-title">
      <span className="epv-icon">{icon}</span>
      {title}
    </div>
    <div className="epv-section-body">{children}</div>
    {note && <div className="epv-note">{note}</div>}
  </div>
);

const num = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());

const ExposureProfileView: React.FC<ExposureProfileViewProps> = ({ profile }) => {
  const { people, housing, healthcare, education, emergency_response, water, energy, transport, livelihood, environment, industrial_hazardous } = profile;

  return (
    <div className="exposure-profile-view">
      <div className="epv-grid">
        <Section icon="👥" title="People" note={people.note}>
          <Row label="Population exposed" value={num(people.population_exposed)} highlight />
          <Row label="Vulnerable population" value={num(people.vulnerable_population)} highlight />
          <Row label="Vulnerable population exposed" value={num(people.vulnerable_population_exposed)} />
          <Row label="Children (0-14)" value={num(people.children_0_14)} />
          <Row label="Elderly (60+)" value={num(people.elderly_60_plus)} />
          <Row label="Persons with disabilities (est.)" value={num(people.persons_with_disabilities_est)} />
          <Row label="Pregnant women (est.)" value={num(people.pregnant_women_est)} />
          <Row label="Female-headed households (est.)" value={num(people.female_headed_households_est)} />
          <Row label="Isolated / remote habitation" value={people.isolated_remote_habitation ? "Yes" : "No"} />
        </Section>

        <Section icon="🏠" title="Housing" note={housing.data_source}>
          <Row label="Residential buildings" value={num(housing.residential_buildings)} highlight />
          <Row label="High-risk structures" value={num(housing.high_risk_structures)} highlight />
          <Row label="Pucca (concrete)" value={num(housing.pucca)} />
          <Row label="Semi-pucca" value={num(housing.semi_pucca)} />
          <Row label="Kutcha (temporary)" value={num(housing.kutcha)} />
          <Row label="Informal settlement present" value={housing.informal_settlement_present ? "Yes" : "No"} />
        </Section>

        <Section icon="🏥" title="Healthcare">
          <Row label="Hospitals / CHC" value={num(healthcare.chc_hospital_count)} />
          <Row label="PHC" value={num(healthcare.phc_count)} />
          <Row label="Health sub-centres" value={num(healthcare.health_subcentres)} />
          <Row label="Beds / ICU beds" value={`${num(healthcare.beds)} / ${num(healthcare.icu_beds)}`} />
          <Row label="Distance to nearest hospital" value={`${healthcare.distance_to_nearest_hospital_km} km`} />
          <Row label="Emergency access" value={<RatingBadge rating={healthcare.emergency_access} positive />} highlight />
        </Section>

        <Section icon="🎓" title="Education" note={education.note}>
          <Row label="Schools" value={num(education.schools)} />
          <Row label="Colleges" value={num(education.colleges)} />
          <Row label="Anganwadi centres" value={num(education.anganwadi_centres)} />
          <Row label="Students exposed" value={num(education.students_exposed)} highlight />
        </Section>

        <Section icon="🚑" title="Emergency Response">
          <Row label="Fire station" value={num(emergency_response.fire_stations)} />
          <Row label="Police station" value={num(emergency_response.police_stations)} />
          <Row label="Distance to emergency facility" value={`${emergency_response.distance_to_nearest_emergency_facility_km} km`} />
        </Section>

        <Section icon="💧" title="Water" note={water.note}>
          <Row label="Treatment plants" value={num(water.treatment_plants)} />
          <Row label="Pumping stations" value={num(water.pumping_stations)} />
          <Row label="Overhead tanks" value={num(water.overhead_tanks)} />
          <Row label="Population on shared supply (est.)" value={num(water.population_served_by_shared_supply_est)} />
          <Row label="Supply dependency" value={<RatingBadge rating={water.supply_dependency} />} highlight />
        </Section>

        <Section icon="⚡" title="Energy">
          <Row label="Substations" value={num(energy.substations)} />
          <Row label="Transformers" value={num(energy.transformers)} />
          <Row label="Power dependency" value={<RatingBadge rating={energy.power_dependency} />} highlight />
        </Section>

        <Section icon="🛣" title="Transport">
          <Row label="Roads affected" value={`${transport.roads_affected_km} km`} highlight />
          <Row label="Local roads" value={`${transport.local_roads_km} km`} />
          <Row label="Bridges" value={num(transport.bridges)} />
          <Row label="Accessibility" value={<RatingBadge rating={transport.accessibility} positive />} highlight />
        </Section>

        <Section icon="🌾" title="Livelihood">
          <Row label="Agricultural land affected" value={`${livelihood.agricultural_land_affected_hectares} ha`} highlight />
          <Row label="Agricultural land (total)" value={`${livelihood.agricultural_land_hectares} ha`} />
          <Row label="Livestock exposed" value={num(livelihood.livestock_exposed)} highlight />
          <Row label="Livestock (total)" value={num(livelihood.livestock_heads)} />
          <Row label="Fisheries present" value={livelihood.fisheries_present ? "Yes" : "No"} />
          <Row label="Markets" value={num(livelihood.markets)} />
        </Section>

        <Section icon="🌳" title="Environment" note={environment.data_source}>
          <Row label="Forest affected" value={`${environment.forest_affected_sqkm} km²`} />
          <Row label="Wetland affected" value={`${environment.wetland_affected_sqkm} km²`} />
        </Section>

        <Section icon="🏭" title="Industrial / Hazardous" note={industrial_hazardous.note}>
          <Row label="Hazardous facilities" value={num(industrial_hazardous.hazardous_facilities)} />
        </Section>
      </div>

      <div className="epv-confidence">
        <strong>Data quality — confidence: {Math.round(profile.confidence.overall * 100)}%</strong>
        <p>{profile.confidence.note}</p>
      </div>
    </div>
  );
};

export default ExposureProfileView;
