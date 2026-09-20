import { lazy, Suspense, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import { ROLES, currentSession, type Scope, type Session } from "./lib/auth";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const GisDashboard = lazy(() => import("./pages/GisDashboard"));
const HazardIntelligence = lazy(() => import("./pages/HazardIntelligence"));
const ExposureVulnerability = lazy(() => import("./pages/ExposureVulnerability"));
const RelocationIntelligence = lazy(() => import("./pages/RelocationIntelligence"));
const EmergencyPortal = lazy(() => import("./pages/EmergencyPortal"));
const DistrictCommand = lazy(() => import("./pages/DistrictCommand"));
const FieldSurvey = lazy(() => import("./pages/FieldSurvey"));
const PublicAdvisory = lazy(() => import("./pages/PublicAdvisory"));
const ActionPlan = lazy(() => import("./pages/ActionPlan"));
const ValidationPage = lazy(() => import("./pages/ValidationPage"));

const homeFor = (s: Session) => ROLES[s.scope].home;

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
          <Route path="/advisory" element={<PublicAdvisory />} />
          <Route path="/gis" element={<Guard session={session} allow={["admin", "district_officer"]}><GisDashboard /></Guard>} />
          <Route path="/hazards" element={<Guard session={session} allow={["admin"]}><HazardIntelligence /></Guard>} />
          <Route path="/exposure" element={<Guard session={session} allow={["admin"]}><ExposureVulnerability /></Guard>} />
          <Route path="/relocation" element={<Guard session={session} allow={["admin", "emergency_team", "district_officer"]}><RelocationIntelligence scope={session?.scope ?? "admin"} /></Guard>} />
          <Route path="/plan" element={<Guard session={session} allow={["admin", "district_officer"]}><ActionPlan /></Guard>} />
          <Route path="/validation" element={<Guard session={session} allow={["admin", "district_officer"]}><ValidationPage /></Guard>} />
          <Route path="/district" element={<Guard session={session} allow={["district_officer", "admin"]}><DistrictCommand /></Guard>} />
          <Route path="/field" element={<Guard session={session} allow={["field_team", "admin"]}><FieldSurvey /></Guard>} />
          <Route path="/emergency" element={<Guard session={session} allow={["emergency_team", "admin"]}><EmergencyPortal /></Guard>} />
          <Route path="*" element={<Navigate to={session ? homeFor(session) : "/login"} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
