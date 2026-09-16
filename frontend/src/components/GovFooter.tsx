import React from "react";
import "../styles/GovFooter.css";

const GovFooter: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="gov-footer">
      <div className="gov-tricolour-bar" aria-hidden="true" />
      <div className="gov-footer-main">
        <div className="gov-footer-inner">
          <div className="footer-col">
            <h4>About TeraShield</h4>
            <p>
              TeraShield is an integrated hazard-intelligence and relocation-planning
              platform built to identify high-risk (RED zone) habitations, assess
              population exposure and vulnerability, and plan safe relocation —
              developed as a prototype for Smart India Hackathon 2026.
            </p>
          </div>

          <div className="footer-col">
            <h4>Platform Engines</h4>
            <ul>
              <li>🎯 Hazard Intelligence</li>
              <li>👥 Exposure &amp; Vulnerability</li>
              <li>📍 Relocation Intelligence</li>
              <li>📊 Integrated GIS Dashboard</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Resources</h4>
            <ul>
              <li>
                <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">
                  API Documentation
                </a>
              </li>
              <li>
                <a href="http://127.0.0.1:8000/redoc" target="_blank" rel="noreferrer">
                  Technical Reference
                </a>
              </li>
              <li>System Status: Operational</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Disclaimer</h4>
            <p>
              This is a hackathon prototype for demonstration purposes. Data shown is
              simulated and must not be used for actual emergency response or
              real-world relocation decisions.
            </p>
          </div>
        </div>
      </div>

      <div className="gov-footer-bottom">
        <div className="gov-footer-bottom-inner">
          <span>
            © {year} TeraShield — Smart India Hackathon 2026 Prototype. All content
            for demonstration only.
          </span>
          <span className="footer-tagline">Built for Bharat 🇮🇳 — Disaster Resilient Habitats</span>
        </div>
      </div>
    </footer>
  );
};

export default GovFooter;
