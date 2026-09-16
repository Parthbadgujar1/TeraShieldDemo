import React from "react";
import * as Types from "../types";
import "../styles/DistrictSelector.css";

interface DistrictSelectorProps {
  districts: Types.District[];
  selectedDistrict: string | null;
  onSelectDistrict: (districtId: string) => void;
}

const DistrictSelector: React.FC<DistrictSelectorProps> = ({
  districts,
  selectedDistrict,
  onSelectDistrict,
}) => {
  return (
    <div className="district-selector">
      <label htmlFor="district-select">Select District:</label>
      <select
        id="district-select"
        value={selectedDistrict || ""}
        onChange={(e) => onSelectDistrict(e.target.value)}
      >
        <option value="">Choose a district...</option>
        {districts.map((district) => (
          <option key={district.district_id} value={district.district_id}>
            {district.name} ({district.state}) - {district.village_count} villages
          </option>
        ))}
      </select>
    </div>
  );
};

export default DistrictSelector;
