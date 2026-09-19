import { lazy, Suspense, useState } from "react";
import { Loading } from "../components/ui";

const PermanentResettlement = lazy(() => import("./relocation/PermanentResettlement"));
const EvacuationPlanner = lazy(() => import("./relocation/EvacuationPlanner"));

type Tab = "permanent" | "evacuation";

/**
 * Relocation Intelligence has two deliberately separate tracks. PS 26191 is about planned, permanent resettlement (months to years:
 * land, livelihood, approvals); evacuation (hours to days: buses, waves, time-to-impact) is a different tool and stays available.
 */
export default function RelocationIntelligence({ scope }: { scope: string }) {
  const emergency = scope === "emergency_team";
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem("ts_reloc_tab") as Tab) || "permanent"; } catch { return "permanent"; }
  });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem("ts_reloc_tab", t); } catch { /* private mode */ } };

  if (emergency) return <Suspense fallback={<Loading text="Loading evacuation planner…" />}><EvacuationPlanner scope={scope} /></Suspense>;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Relocation Intelligence</h1>
          <p>Two tracks that every other tool mixes up. <b>Permanent resettlement</b> answers where a habitation should live for the next 30–50 years and how long the move takes; <b>emergency evacuation</b> answers how to get people out this week.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Relocation track" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={tab === "permanent"} className={tab === "permanent" ? "on" : ""} onClick={() => pick("permanent")}>Permanent resettlement <span className="tiny">months–years · habitation level</span></button>
        <button role="tab" aria-selected={tab === "evacuation"} className={tab === "evacuation" ? "on" : ""} onClick={() => pick("evacuation")}>Emergency evacuation <span className="tiny">hours–days · buses, waves, time-to-impact</span></button>
      </div>
      <Suspense fallback={<Loading text="Loading…" />}>
        {tab === "permanent" ? <PermanentResettlement /> : <EvacuationPlanner scope={scope} embedded />}
      </Suspense>
    </div>
  );
}
