import React from "react";
import * as Types from "../types";
import "../styles/VillageTable.css";

interface VillageTableProps {
  villages: Types.Village[];
  onVillageClick: (villageId: string) => void;
}

const VillageTable: React.FC<VillageTableProps> = ({ villages, onVillageClick }) => {
  if (villages.length === 0) {
    return <div className="no-data">No villages found</div>;
  }

  return (
    <div className="village-table-container">
      <table className="village-table">
        <thead>
          <tr>
            <th>Village Name</th>
            <th>Population</th>
            <th>Risk Score</th>
            <th>Risk Category</th>
            <th>Dominant Hazard</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {villages.map((village) => (
            <tr key={village.village_id} className={village.is_test_data ? "test-data-row" : ""}>
              <td>
                {village.name}
                {village.is_test_data && <span className="test-data-badge">TEST</span>}
              </td>
              <td>{village.population.toLocaleString()}</td>
              <td>{village.multi_hazard_score.toFixed(2)}</td>
              <td>
                <span className={`risk-badge ${village.risk_category.toLowerCase()}`}>
                  {village.risk_category}
                </span>
              </td>
              <td>{village.dominant_hazard}</td>
              <td>
                <button
                  onClick={() => onVillageClick(village.village_id)}
                  className="detail-button"
                >
                  View Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default VillageTable;
