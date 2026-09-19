import { lazy, Suspense, useState } from "react";
import { Loading } from "../components/ui";

const Backtest = lazy(() => import("./validation/Backtest"));
const DataLab = lazy(() => import("./validation/DataLab"));
const ZoneRegister = lazy(() => import("./validation/ZoneRegister"));

type Tab = "backtest" | "lab" | "register";

/** Assurance: does the model work (backtest), can the SDMA use its own data (Data Lab) and is every red-zone decision defensible (Zone Register)? */
export default function ValidationPage() {
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem("ts_val_tab") as Tab) || "backtest"; } catch { return "backtest"; }
  });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem("ts_val_tab", t); } catch { /* private mode */ } };
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Validation &amp; Data</h1>
          <p>
            Three things a review board asks: <b>does it work</b> (held-out backtest with honest baselines), <b>can we use our own data</b> (validated CSV/GeoJSON upload) and
            <b> can a red-zone decision be defended in court</b> (an evidence-ratcheted lifecycle with a tamper-evident log).
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Validation and data" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={tab === "backtest"} className={tab === "backtest" ? "on" : ""} onClick={() => pick("backtest")}>Backtest <span className="tiny">predicted vs observed</span></button>
        <button role="tab" aria-selected={tab === "lab"} className={tab === "lab" ? "on" : ""} onClick={() => pick("lab")}>Data Lab <span className="tiny">upload &amp; validate</span></button>
        <button role="tab" aria-selected={tab === "register"} className={tab === "register" ? "on" : ""} onClick={() => pick("register")}>Zone Register <span className="tiny">lifecycle &amp; audit log</span></button>
      </div>
      <Suspense fallback={<Loading text="Loading…" />}>
        {tab === "backtest" ? <Backtest /> : tab === "lab" ? <DataLab /> : <ZoneRegister />}
      </Suspense>
    </div>
  );
}
