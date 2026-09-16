import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/GovHeader.css";

interface GovHeaderProps {
  isAuthenticated: boolean;
  onLogout: () => void;
}

const GovHeader: React.FC<GovHeaderProps> = ({ isAuthenticated, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [textSize, setTextSize] = useState(0); // -1, 0, 1, 2
  const [lang, setLang] = useState<"EN" | "HI">("EN");

  const applyTextSize = (delta: number) => {
    const next = Math.max(-1, Math.min(2, textSize + delta));
    setTextSize(next);
    document.documentElement.style.fontSize = `${15 + next * 1.5}px`;
  };

  const handleLogout = () => {
    onLogout();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  const preferredDistrict = () => localStorage.getItem("ts_selected_district") || "chamoli";

  return (
    <header className="gov-header">
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to Main Content
      </a>

      {/* Top identification strip */}
      <div className="gov-topstrip">
        <div className="gov-topstrip-inner">
          <div className="gov-topstrip-left">
            <span>भारत | India</span>
            <span className="divider">|</span>
            <span>Smart India Hackathon 2026 — Disaster Management &amp; Risk Reduction</span>
          </div>
          <div className="gov-topstrip-right">
            <a href="#main-content" className="a11y-link">
              Screen Reader Access
            </a>
            <span className="divider">|</span>
            <div className="text-size-controls" aria-label="Adjust text size">
              <button
                type="button"
                className="size-btn"
                onClick={() => applyTextSize(-1)}
                aria-label="Decrease text size"
              >
                A-
              </button>
              <button
                type="button"
                className="size-btn"
                onClick={() => applyTextSize(0 - textSize)}
                aria-label="Reset text size"
              >
                A
              </button>
              <button
                type="button"
                className="size-btn"
                onClick={() => applyTextSize(1)}
                aria-label="Increase text size"
              >
                A+
              </button>
            </div>
            <span className="divider">|</span>
            <button
              type="button"
              className="lang-toggle"
              onClick={() => setLang(lang === "EN" ? "HI" : "EN")}
            >
              {lang === "EN" ? "हिन्दी" : "English"}
            </button>
          </div>
        </div>
      </div>

      {/* Main identity header */}
      <div className="gov-main-header">
        <div className="gov-main-header-inner">
          <div
            className="gov-brand"
            onClick={() => isAuthenticated && navigate("/dashboard")}
            role="button"
            tabIndex={0}
          >
            <div className="gov-emblem" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="48" height="48">
                <circle cx="32" cy="32" r="30" fill="none" stroke="#0b3d6e" strokeWidth="2.5" />
                <circle cx="32" cy="32" r="24" fill="none" stroke="#ff9933" strokeWidth="1.2" />
                {Array.from({ length: 24 }).map((_, i) => {
                  const angle = (i * 360) / 24;
                  const rad = (angle * Math.PI) / 180;
                  const x1 = 32 + 15 * Math.cos(rad);
                  const y1 = 32 + 15 * Math.sin(rad);
                  const x2 = 32 + 22 * Math.cos(rad);
                  const y2 = 32 + 22 * Math.sin(rad);
                  return (
                    <line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#0b3d6e"
                      strokeWidth="1"
                    />
                  );
                })}
                <circle cx="32" cy="32" r="6" fill="#138808" />
                <circle cx="32" cy="32" r="3" fill="#ffffff" />
              </svg>
            </div>
            <div className="gov-brand-text">
              <div className="gov-brand-title">
                TeraShield<span className="gov-brand-title-accent">.</span>
              </div>
              <div className="gov-brand-subtitle">
                National Disaster Risk Intelligence &amp; Relocation Portal
              </div>
            </div>
          </div>

          <div className="gov-header-badge">
            <span className="badge-pill">Prototype Build · SIH 2026</span>
            {isAuthenticated && (
              <div className="gov-session">
                <span className="session-user">👤 sih_admin</span>
                <button className="logout-btn" onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary navigation */}
      {isAuthenticated && (
        <nav className="gov-nav" aria-label="Primary navigation">
          <div className="gov-nav-inner">
            <button
              className={`gov-nav-link ${isActive("/dashboard") ? "active" : ""}`}
              onClick={() => navigate("/dashboard")}
            >
              🏠 Dashboard
            </button>
            <button
              className={`gov-nav-link ${isActive("/dashboard") ? "active" : ""}`}
              onClick={() => navigate("/dashboard")}
              title="Hazard risk table for the selected district"
            >
              🎯 Hazard Intelligence
            </button>
            <button
              className={`gov-nav-link ${isActive("/exposure") ? "active" : ""}`}
              onClick={() => navigate(`/exposure/${preferredDistrict()}`)}
              title="District exposure & vulnerability assessment"
            >
              👥 Exposure &amp; Vulnerability
            </button>
            <button
              className={`gov-nav-link ${isActive("/relocation") ? "active" : ""}`}
              onClick={() => navigate(`/relocation/${preferredDistrict()}`)}
              title="Relocation sites, assignments & plan for the selected district"
            >
              📍 Relocation Intelligence
            </button>
            <button
              className={`gov-nav-link ${isActive("/gis-dashboard") ? "active" : ""}`}
              onClick={() => navigate("/gis-dashboard")}
              title="Interactive map: villages, hazard zones & relocation sites"
            >
              📊 GIS Dashboard
            </button>
          </div>
        </nav>
      )}

      <div className="gov-tricolour-bar" aria-hidden="true" />
    </header>
  );
};

export default GovHeader;
