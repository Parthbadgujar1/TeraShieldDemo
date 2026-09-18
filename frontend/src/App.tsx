import { lazy, Suspense, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import { currentSession, type Scope, type Session } from "./lib/auth";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const GisDashboard = lazy(() => import("./pages/GisDashboard"));
const HazardIntelligence = lazy(() => import("./pages/HazardIntelligence"));
const ExposureVulnerability = lazy(() => import("./pages/ExposureVulnerability"));
const RelocationIntelligence = lazy(() => import("./pages/RelocationIntelligence"));
const EmergencyPortal = lazy(() => import("./pages/EmergencyPortal"));

const homeFor = (s: Session) => (s.scope === "admin" ? "/gis" : "/emergency");

function Guard({ session, allow, children }: { session: Session | null; allow: Scope[]; children: ReactNode }) {
  if (!session) return <Navigate to="/login" replace />;
  if (!allow.includes(session.scope)) return <Navigate to={homeFor(session)} replace />;
  return <Layout session={session}>{children}</Layout>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(currentSession);

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading text="Loading TeraShield…" />}>
        <Routes>
          <Route path="/login" element={session ? <Navigate to={homeFor(session)} replace /> : <LoginPage onLogin={setSession} />} />
          <Route path="/gis" element={<Guard session={session} allow={["admin"]}><GisDashboard /></Guard>} />
          <Route path="/hazards" element={<Guard session={session} allow={["admin"]}><HazardIntelligence /></Guard>} />
          <Route path="/exposure" element={<Guard session={session} allow={["admin"]}><ExposureVulnerability /></Guard>} />
          <Route path="/relocation" element={<Guard session={session} allow={["admin", "emergency_team"]}><RelocationIntelligence scope={session?.scope ?? "admin"} /></Guard>} />
          <Route path="/emergency" element={<Guard session={session} allow={["emergency_team"]}><EmergencyPortal /></Guard>} />
          <Route path="*" element={<Navigate to={session ? homeFor(session) : "/login"} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
