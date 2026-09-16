"""
SQLAlchemy Database Models - All 4 Engines Integrated
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Enum, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from datetime import datetime
import enum

Base = declarative_base()


# ============================================================================
# ENGINE 1: HAZARD INTELLIGENCE
# ============================================================================

class District(Base):
    """Administrative district"""
    __tablename__ = "districts"

    district_id = Column(String, primary_key=True)
    name = Column(String, unique=True, index=True)
    state = Column(String, index=True)
    geometry = Column(Geometry('POLYGON', srid=4326))
    area_sq_km = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    villages = relationship("Village", back_populates="district")
    hazard_assessments = relationship("HazardAssessment", back_populates="district")


class Village(Base):
    """Village with spatial location"""
    __tablename__ = "villages"

    village_id = Column(String, primary_key=True)
    name = Column(String, index=True)
    district_id = Column(String, ForeignKey("districts.district_id"))
    state = Column(String, index=True)
    geometry = Column(Geometry('POLYGON', srid=4326))
    area_sq_km = Column(Float)
    population = Column(Integer, default=0)
    households = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    district = relationship("District", back_populates="villages")
    hazard_assessments = relationship("HazardAssessment", back_populates="village")
    exposure_data = relationship("ExposureData", back_populates="village")
    vulnerability_scores = relationship("VulnerabilityScore", back_populates="village")
    relocation_assignments = relationship("RelocationAssignment", back_populates="village")


class HazardType(str, enum.Enum):
    """Types of hazards"""
    FLOOD = "flood"
    LANDSLIDE = "landslide"
    COASTAL_EROSION = "coastal_erosion"
    CLOUDBURST = "cloudburst"


class HazardAssessment(Base):
    """Hazard risk assessment for village (Engine 1)"""
    __tablename__ = "hazard_assessments"

    assessment_id = Column(Integer, primary_key=True, autoincrement=True)
    village_id = Column(String, ForeignKey("villages.village_id"), index=True)
    district_id = Column(String, ForeignKey("districts.district_id"))
    hazard_type = Column(Enum(HazardType), index=True)
    score = Column(Float)  # 0-1
    risk_category = Column(String)  # RED, ORANGE, YELLOW, GREEN
    intensity = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)  # 0-1
    source = Column(String)  # Data source
    assessment_date = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    raster_path = Column(String, nullable=True)  # Path to raster file

    # Relationships
    village = relationship("Village", back_populates="hazard_assessments")
    district = relationship("District", back_populates="hazard_assessments")


class MultiHazardAssessment(Base):
    """Multi-hazard integrated assessment (Engine 1 fusion)"""
    __tablename__ = "multi_hazard_assessments"

    assessment_id = Column(Integer, primary_key=True, autoincrement=True)
    village_id = Column(String, ForeignKey("villages.village_id"), index=True, unique=True)
    multi_hazard_score = Column(Float)  # 0-1
    risk_category = Column(String)  # RED, ORANGE, YELLOW, GREEN
    dominant_hazard = Column(Enum(HazardType))
    hazard_combination = Column(Text)  # JSON: {"flood": 0.8, "landslide": 0.3}
    assessment_date = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================================
# ENGINE 2: EXPOSURE & VULNERABILITY
# ============================================================================

class AssetType(str, enum.Enum):
    """Types of exposed assets"""
    POPULATION = "population"
    BUILDINGS = "buildings"
    CRITICAL_FACILITIES = "critical_facilities"
    AGRICULTURAL_LAND = "agricultural_land"
    LIVESTOCK = "livestock"
    ROADS = "roads"
    WATER_BODIES = "water_bodies"


class Criticality(str, enum.Enum):
    """Asset criticality levels"""
    CRITICAL = "critical"  # Hospitals, power plants
    HIGH = "high"  # Schools, water systems
    MEDIUM = "medium"  # Markets, community centers
    LOW = "low"  # Residential areas


class ExposureData(Base):
    """Exposed assets in hazard zones (Engine 2)"""
    __tablename__ = "exposure_data"

    exposure_id = Column(Integer, primary_key=True, autoincrement=True)
    village_id = Column(String, ForeignKey("villages.village_id"), index=True)
    asset_type = Column(Enum(AssetType), index=True)
    geometry = Column(Geometry('POINT', srid=4326), nullable=True)
    quantity = Column(Float)
    unit = Column(String)  # Count, hectares, length, etc
    criticality = Column(Enum(Criticality))
    confidence = Column(Float)  # 0-1
    source = Column(String)
    data_date = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    extra_data = Column("metadata", JSON, nullable=True)  # Additional info

    # Relationships
    village = relationship("Village", back_populates="exposure_data")


class VulnerabilityFactor(str, enum.Enum):
    """Vulnerability assessment factors"""
    AGE = "age"  # Young & elderly at higher risk
    INCOME = "income"  # Low income → high vulnerability
    HEALTHCARE_ACCESS = "healthcare_access"
    LITERACY = "literacy"
    GENDER = "gender"
    DISABILITY = "disability"
    HOUSING_QUALITY = "housing_quality"
    SOCIAL_MARGINALIZATION = "social_marginalization"


class VulnerabilityScore(Base):
    """Vulnerability assessment for village (Engine 2)"""
    __tablename__ = "vulnerability_scores"

    score_id = Column(Integer, primary_key=True, autoincrement=True)
    village_id = Column(String, ForeignKey("villages.village_id"), index=True)
    factor_type = Column(Enum(VulnerabilityFactor), index=True)
    factor_score = Column(Float)  # 0-1
    evidence = Column(Text, nullable=True)  # Justification
    composite_score = Column(Float, nullable=True)  # Overall vulnerability
    vulnerability_band = Column(String)  # High, Medium, Low
    confidence = Column(Float)  # 0-1
    source = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    village = relationship("Village", back_populates="vulnerability_scores")


class ExposureVulnerabilitySummary(Base):
    """Summary of exposure + vulnerability per village (Engine 2)"""
    __tablename__ = "exposure_vulnerability_summary"

    summary_id = Column(Integer, primary_key=True, autoincrement=True)
    village_id = Column(String, ForeignKey("villages.village_id"), index=True, unique=True)
    population_exposed = Column(Integer)
    buildings_exposed = Column(Integer)
    critical_facilities_count = Column(Integer)
    agricultural_area_exposed = Column(Float)  # hectares
    overall_vulnerability_score = Column(Float)  # 0-1
    vulnerability_band = Column(String)  # High, Medium, Low
    affected_asset_types = Column(JSON)  # List of asset types
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================================
# ENGINE 3: RELOCATION INTELLIGENCE
# ============================================================================

class PriorityTier(str, enum.Enum):
    """Relocation priority tiers"""
    IMMEDIATE = "immediate"  # RED zone, high vulnerability
    SHORT_TERM = "short_term"  # ORANGE zone or high vulnerability
    MEDIUM_TERM = "medium_term"  # YELLOW zone, low vulnerability
    MONITOR = "monitor"  # GREEN zone, no action needed


class RelocationSite(Base):
    """Potential relocation site (Engine 3)"""
    __tablename__ = "relocation_sites"

    site_id = Column(String, primary_key=True)
    name = Column(String, index=True)
    district_id = Column(String, ForeignKey("districts.district_id"))
    geometry = Column(Geometry('POLYGON', srid=4326))
    area_sq_km = Column(Float)

    # Suitability Assessment
    slope_score = Column(Float, nullable=True)  # 0-1
    distance_from_hazard_score = Column(Float, nullable=True)  # 0-1
    soil_capacity_score = Column(Float, nullable=True)  # 0-1
    water_availability_score = Column(Float, nullable=True)  # 0-1
    market_proximity_score = Column(Float, nullable=True)  # 0-1
    cultural_fit_score = Column(Float, nullable=True)  # 0-1
    accessibility_score = Column(Float, nullable=True)  # 0-1
    overall_suitability_score = Column(Float)  # 0-100
    suitability_grade = Column(String)  # A, B, C, D

    # Carrying Capacity
    land_capacity_households = Column(Integer)
    water_capacity_people = Column(Integer)
    electricity_capacity_mw = Column(Float)
    school_capacity_children = Column(Integer)
    hospital_capacity_beds = Column(Integer)
    job_slots_available = Column(Integer)
    overall_capacity_people = Column(Integer)

    # Status
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    relocation_assignments = relationship("RelocationAssignment", back_populates="site")


class RelocationAssignment(Base):
    """Assignment of village to relocation site (Engine 3)"""
    __tablename__ = "relocation_assignments"

    assignment_id = Column(Integer, primary_key=True, autoincrement=True)
    village_id = Column(String, ForeignKey("villages.village_id"), index=True, unique=True)
    target_site_id = Column(String, ForeignKey("relocation_sites.site_id"), index=True)
    priority_tier = Column(Enum(PriorityTier), index=True)
    population_to_relocate = Column(Integer)
    prioritization_score = Column(Float)  # 0-100

    # Matching Rationale
    matching_score = Column(Float)  # 0-100, how well site matches village needs
    distance_km = Column(Float)
    cultural_compatibility = Column(Float)  # 0-1
    livelihood_compatibility = Column(Float)  # 0-1

    # Timeline
    timeline_days = Column(Integer)  # Days needed for relocation
    status = Column(String)  # planned, in_progress, completed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    village = relationship("Village", back_populates="relocation_assignments")
    site = relationship("RelocationSite", back_populates="relocation_assignments")


class EvacuationRoute(Base):
    """Evacuation route during disaster (Engine 3)"""
    __tablename__ = "evacuation_routes"

    route_id = Column(Integer, primary_key=True, autoincrement=True)
    source_village_id = Column(String, ForeignKey("villages.village_id"))
    destination_site_id = Column(String, ForeignKey("relocation_sites.site_id"))
    route_geometry = Column(Geometry('LINESTRING', srid=4326))
    distance_km = Column(Float)
    estimated_time_hours = Column(Float)
    capacity_people_per_hour = Column(Integer)
    mode_of_transport = Column(String)  # buses, on_foot, mixed
    avoid_areas = Column(JSON, nullable=True)  # Areas to avoid during disaster
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================================
# ENGINE 4: INTEGRATED GIS DASHBOARD
# ============================================================================

class DisasterEvent(Base):
    """Recorded disaster event (Engine 4)"""
    __tablename__ = "disaster_events"

    event_id = Column(Integer, primary_key=True, autoincrement=True)
    event_name = Column(String, index=True)
    event_type = Column(Enum(HazardType), index=True)
    district_id = Column(String, ForeignKey("districts.district_id"))
    geometry = Column(Geometry('POLYGON', srid=4326))
    start_date = Column(DateTime, index=True)
    end_date = Column(DateTime, nullable=True)
    severity = Column(String)  # Low, Medium, High, Extreme
    casualties = Column(Integer, default=0)
    property_damage_lakhs = Column(Float, default=0)  # In lakhs of rupees
    people_affected = Column(Integer, default=0)
    people_evacuated = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    extra_data = Column("metadata", JSON, nullable=True)


class ResponseAction(Base):
    """Response actions taken (Engine 4)"""
    __tablename__ = "response_actions"

    action_id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("disaster_events.event_id"))
    action_type = Column(String)  # Alert, Evacuation, Relief, Recovery
    description = Column(Text)
    responsible_agency = Column(String)  # NDRF, State Admin, etc
    status = Column(String)  # Planned, In-progress, Completed
    affected_villages = Column(JSON)  # List of village IDs
    resources_deployed = Column(JSON)  # Resources, personnel, etc
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class Alert(Base):
    """System alerts for authorities (Engine 4)"""
    __tablename__ = "alerts"

    alert_id = Column(Integer, primary_key=True, autoincrement=True)
    alert_type = Column(String, index=True)  # Hazard, Capacity, Timeline
    severity = Column(String)  # Critical, High, Medium, Low
    title = Column(String)
    description = Column(Text)
    affected_villages = Column(JSON)
    recommended_action = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, index=True)


class Report(Base):
    """Generated reports (Engine 4)"""
    __tablename__ = "reports"

    report_id = Column(Integer, primary_key=True, autoincrement=True)
    report_type = Column(String)  # Hazard, Relocation, Event, Recovery
    title = Column(String)
    description = Column(Text)
    file_path = Column(String)  # Path to PDF/CSV
    district_id = Column(String, ForeignKey("districts.district_id"), nullable=True)
    event_id = Column(Integer, ForeignKey("disaster_events.event_id"), nullable=True)
    generated_by = Column(String)  # User or system
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    extra_data = Column("metadata", JSON, nullable=True)


class AuditLog(Base):
    """Audit trail for all important actions (Engine 4)"""
    __tablename__ = "audit_logs"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String, index=True)  # Create, Update, Delete, Approve
    entity_type = Column(String)  # Village, Site, Assignment, etc
    entity_id = Column(String)
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    user = Column(String)  # User who performed action
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    change_reason = Column(Text, nullable=True)
