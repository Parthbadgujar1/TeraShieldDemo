import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/EmergencyHeader.css";

interface EmergencyHeaderProps {
  onLogout: () => void;
}

const EmergencyHeader: React.FC<EmergencyHeaderProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  return (
    <header className="eh-header">
      <div className="eh-inner">
        <div className="eh-brand" onClick={() => navigate("/emergency")} role="button" tabIndex={0}>
          <span className="eh-icon">🚨</span>
          <div>
            <div className="eh-title">TeraShield Emergency Response</div>
            <div className="eh-subtitle">Operational Response Portal — not the admin dashboard</div>
          </div>
        </div>
        <div className="eh-session">
          <span className="eh-badge">EMERGENCY RESPONSE TEAM</span>
          <button className="eh-logout" onClick={onLogout}>Sign Out</button>
        </div>
      </div>
    </header>
  );
};

export default EmergencyHeader;
