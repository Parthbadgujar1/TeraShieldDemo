import React, { useState } from "react";
import "../styles/LoginPage.css";

interface LoginPageProps {
  onLogin: (token: string, scope: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState("sih");
  const [password, setPassword] = useState("sih2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      const data = await response.json();
      onLogin(data.token, data.scope || "admin");
    } catch (err) {
      setError("Login failed. Please verify your credentials and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        {/* Left informational panel */}
        <div className="login-info-panel">
          <div className="info-panel-overlay" />
          <div className="info-panel-content">
            <div className="info-panel-emblem">
              <svg viewBox="0 0 64 64" width="56" height="56">
                <circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" strokeWidth="2.5" />
                <circle cx="32" cy="32" r="24" fill="none" stroke="#ff9933" strokeWidth="1.4" />
                {Array.from({ length: 24 }).map((_, i) => {
                  const angle = (i * 360) / 24;
                  const rad = (angle * Math.PI) / 180;
                  const x1 = 32 + 15 * Math.cos(rad);
                  const y1 = 32 + 15 * Math.sin(rad);
                  const x2 = 32 + 22 * Math.cos(rad);
                  const y2 = 32 + 22 * Math.sin(rad);
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeWidth="1" />
                  );
                })}
                <circle cx="32" cy="32" r="6" fill="#138808" />
                <circle cx="32" cy="32" r="3" fill="#ffffff" />
              </svg>
            </div>
            <div className="info-panel-eyebrow">Smart India Hackathon 2026</div>
            <h1>TeraShield</h1>
            <p className="info-panel-tagline">
              National Disaster Risk Intelligence &amp; Relocation Portal
            </p>

            <ul className="info-panel-features">
              <li>
                <span className="feature-icon">🎯</span>
                <div>
                  <strong>Hazard Intelligence</strong>
                  <span>Multi-hazard RED / ORANGE / YELLOW / GREEN zone classification</span>
                </div>
              </li>
              <li>
                <span className="feature-icon">👥</span>
                <div>
                  <strong>Exposure &amp; Vulnerability</strong>
                  <span>Population, asset and infrastructure risk assessment</span>
                </div>
              </li>
              <li>
                <span className="feature-icon">📍</span>
                <div>
                  <strong>Relocation Intelligence</strong>
                  <span>Site suitability, carrying capacity &amp; prioritised relocation</span>
                </div>
              </li>
              <li>
                <span className="feature-icon">📊</span>
                <div>
                  <strong>Integrated GIS Dashboard</strong>
                  <span>Real-time monitoring across all four engines</span>
                </div>
              </li>
            </ul>

            <div className="info-panel-footer">
              Prototype system · Data shown is simulated for demonstration
            </div>
          </div>
        </div>

        {/* Right login form panel */}
        <div className="login-form-panel">
          <div className="login-form-card">
            <div className="login-form-header">
              <h2>Secure Portal Login</h2>
              <p>Authorised personnel access only</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
              <div className="form-group">
                <label htmlFor="username">User ID</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter User ID"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Password"
                  required
                />
              </div>

              {error && (
                <div className="error-message" role="alert">
                  ⚠ {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="login-button">
                {loading ? "Authenticating..." : "Login to Portal →"}
              </button>
            </form>

            <div className="login-divider">
              <span>Demo Access Credentials</span>
            </div>

            <div className="login-info-box">
              <div className="cred-row">
                <span className="cred-label">Admin Portal</span>
                <code>sih / sih2026</code>
              </div>
              <div className="cred-row">
                <span className="cred-label">🚨 Emergency Response Team</span>
                <code>rescue / rescue2026</code>
              </div>
            </div>

            <p className="login-security-note">
              🔒 This is a prototype environment developed for Smart India Hackathon 2026.
              All credentials and data are for demonstration purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
