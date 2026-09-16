import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import VillageDetailPage from "./pages/VillageDetailPage";
import RelocationPage from "./pages/RelocationPage";
import ExposurePage from "./pages/ExposurePage";
import GISDashboardPage from "./pages/GISDashboardPage";
import EmergencyDashboardPage from "./pages/EmergencyDashboardPage";
import RescueMissionPage from "./pages/RescueMissionPage";
import GovHeader from "./components/GovHeader";
import GovFooter from "./components/GovFooter";
import EmergencyHeader from "./components/EmergencyHeader";
import api from "./services/api";
import "./styles/index.css";
import "./styles/App.css";

type AuthScope = "admin" | "emergency_team" | null;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [scope, setScope] = useState<AuthScope>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const savedScope = localStorage.getItem("auth_scope") as AuthScope;
    if (token) {
      setIsAuthenticated(true);
      setScope(savedScope || "admin");
      api.getHealth().catch(() => {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_scope");
        setIsAuthenticated(false);
        setScope(null);
      });
    }
    setLoading(false);
  }, []);

  const handleLogin = (token: string, loginScope: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_scope", loginScope);
    setIsAuthenticated(true);
    setScope(loginScope as AuthScope);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_scope");
    setIsAuthenticated(false);
    setScope(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading TeraShield...</p>
      </div>
    );
  }

  const isAdmin = isAuthenticated && scope === "admin";
  const isEmergency = isAuthenticated && scope === "emergency_team";
  const homeRoute = isEmergency ? "/emergency" : "/dashboard";

  return (
    <Router>
      <div className="app">
        {isEmergency ? (
          <EmergencyHeader onLogout={handleLogout} />
        ) : (
          <GovHeader isAuthenticated={isAdmin} onLogout={handleLogout} />
        )}
        <main id="main-content" className="app-main">
          <Routes>
            <Route
              path="/login"
              element={
                isAuthenticated ? <Navigate to={homeRoute} /> : <LoginPage onLogin={handleLogin} />
              }
            />

            {/* Admin portal routes */}
            <Route path="/dashboard" element={isAdmin ? <DashboardPage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />
            <Route path="/villages/:districtId/:villageId" element={isAdmin ? <VillageDetailPage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />
            <Route path="/relocation/:districtId" element={isAdmin ? <RelocationPage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />
            <Route path="/exposure" element={isAdmin ? <ExposurePage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />
            <Route path="/exposure/:districtId" element={isAdmin ? <ExposurePage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />
            <Route path="/gis-dashboard" element={isAdmin ? <GISDashboardPage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />

            {/* Emergency Response Team portal routes */}
            <Route path="/emergency" element={isEmergency ? <EmergencyDashboardPage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />
            <Route path="/emergency/mission/:villageId" element={isEmergency ? <RescueMissionPage /> : <Navigate to={isAuthenticated ? homeRoute : "/login"} />} />

            <Route path="/" element={isAuthenticated ? <Navigate to={homeRoute} /> : <Navigate to="/login" />} />
          </Routes>
        </main>
        {isAdmin && <GovFooter />}
      </div>
    </Router>
  );
}

export default App;
