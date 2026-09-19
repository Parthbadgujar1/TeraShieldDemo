"""
Predicted-vs-observed validation of the hazard model, written to frontend/public/data/validation.json.

Design (temporal hold-out, no peeking):
  * Landslide -- the model's "history" factor is frozen to NASA Global Landslide Catalog events up to 2014 only; the score is then
    tested on which districts had a catalogued landslide in 2015-2023. Reported: ROC-AUC (bootstrap 95% CI), share of
    test-event districts caught in the top-20% scored districts (lift over random = 5x would be a capture of 100%), plus
    baselines (history only, terrain only), a decile calibration table and a weight-sensitivity sweep over 500 random weight
    sets. A logistic regression fitted on pre-2015 labels (terrain/rain/stream features only) is a cross-check on the research weights.
  * Cyclone -- district frequency from 1990-2013 IBTrACS seasons tested against 2014-2023 storms.
  * Flood / cloudburst / coastal -- no open event inventory is ingested, so they are NOT validated; the UI says so.

Caveat carried into the UI: the NASA catalogue is media-reported (biased to roads, towns, English-language news), so AUC measures
agreement with *reported* landslides, not with all landslides.
"""

from __future__ import annotations

import copy
import datetime as dt
import json

import numpy as np

import build_india_dataset as B
from common import clamp01


def auc(score: np.ndarray, y: np.ndarray) -> float:
    pos, neg = score[y == 1], score[y == 0]
    if not len(pos) or not len(neg):
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]), kind="mergesort")
    ranks = np.empty(len(order))
    allv = np.concatenate([pos, neg])[order]
    # average ranks for ties
    i = 0
    r = np.empty(len(allv))
    while i < len(allv):
        j = i
        while j + 1 < len(allv) and allv[j + 1] == allv[i]:
            j += 1
        r[i:j + 1] = (i + j) / 2 + 1
        i = j + 1
    ranks[order] = r
    return float((ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def top_capture(score: np.ndarray, y: np.ndarray, frac: float = 0.2) -> float:
    k = int(round(len(score) * frac))
    idx = np.argsort(-score, kind="mergesort")[:k]
    return float(y[idx].sum() / max(y.sum(), 1))


def boot_ci(score, y, n=500, seed=1):
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        ii = rng.integers(0, len(y), len(y))
        a = auc(score[ii], y[ii])
        if a == a:
            vals.append(a)
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def logistic(X: np.ndarray, y: np.ndarray, l2: float = 1.0, iters: int = 60) -> np.ndarray:
    Xb = np.c_[np.ones(len(X)), X]
    w = np.zeros(Xb.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Xb @ w))
        g = Xb.T @ (p - y) + l2 * np.r_[0, w[1:]]
        H = (Xb * (p * (1 - p))[:, None]).T @ Xb + l2 * np.eye(len(w))
        w -= np.linalg.solve(H, g)
    return w


def build():
    ds = B.load_districts()
    B.attach_census(ds)
    B.prepare_census(ds)
    B.attach_terrain(ds)
    B.attach_climate(ds)
    B.cyclone_stats(ds)
    B.attach_geography(ds)
    return ds


def landslide(ds):
    cut = 2014
    y_cal = np.array([int(any(y <= cut for y in d["ls_years"])) for d in ds])
    y_test = np.array([int(any(y > cut for y in d["ls_years"])) for d in ds])
    for d in ds:
        d["ls_pre"] = sum(1 for y in d["ls_years"] if y <= cut)
        d["ls_zero"] = 0
    def score(key):
        out = []
        for d in ds:
            c = copy.copy(d)
            B.hazard_model(c, ls_key=key)
            out.append(c["P"]["landslide"])
        return np.array(out)
    s_full = score("ls_pre")
    s_nohist = score("ls_zero")
    hist_only = np.array([d["ls_pre"] for d in ds], float)
    terrain_only = np.array([B.clamp01(0.40 * clamp01(d["relief"] / 1500) + 0.35 * clamp01(d["steep15"] / 0.5) + 0.25 * clamp01(d["steep30"] / 0.10)) for d in ds])

    res = dict(
        split=dict(freeze_year=cut, test_years=[cut + 1, 2023]),
        districts=len(ds), districts_with_test_events=int(y_test.sum()), districts_with_calibration_events=int(y_cal.sum()),
        model=dict(auc=auc(s_full, y_test), ci=boot_ci(s_full, y_test), top20_capture=top_capture(s_full, y_test)),
        baselines=dict(
            history_only=dict(auc=auc(hist_only, y_test), top20_capture=top_capture(hist_only, y_test)),
            terrain_only=dict(auc=auc(terrain_only, y_test), top20_capture=top_capture(terrain_only, y_test)),
            no_history=dict(auc=auc(s_nohist, y_test), top20_capture=top_capture(s_nohist, y_test)),
            random=dict(auc=0.5, top20_capture=0.2),
        ),
    )
    res["model"]["lift_top20"] = res["model"]["top20_capture"] / 0.2

    # decile table on the frozen model
    order = np.argsort(-s_full, kind="mergesort")
    dec = []
    for k in range(10):
        idx = order[k * len(ds) // 10:(k + 1) * len(ds) // 10]
        dec.append(dict(decile=k + 1, districts=int(len(idx)), hit_rate=float(y_test[idx].mean()),
                        mean_score=float(s_full[idx].mean())))
    res["deciles"] = dec

    # weight sensitivity: random weights around the research weights (Dirichlet), gate and trigger frequency held fixed
    fac = np.array([[d["factors"]["landslide"][k] if "factors" in d else 0 for k in ("slope", "rain", "history", "stream")] for d in ds]) if "factors" in ds[0] else None
    tmp = []
    for d in ds:
        c = copy.copy(d)
        B.hazard_model(c, ls_key="ls_pre")
        f = c["factors"]["landslide"]
        gate = clamp01(0.1 + c["relief"] / 350)
        trig = 0.3 + 0.7 * clamp01(c["clim"]["p50"])
        tmp.append([f["slope"], f["rain"], f["history"], f["stream"], gate * trig])
    T = np.array(tmp)
    w0 = np.array([B.W_LANDSLIDE[k] for k in ("slope", "rain", "history", "stream")])
    rng = np.random.default_rng(7)
    aucs, caps = [], []
    for w in rng.dirichlet(w0 * 20, size=500):
        sc = (T[:, :4] @ w) * T[:, 4]
        aucs.append(auc(sc, y_test))
        caps.append(top_capture(sc, y_test))
    res["sensitivity"] = dict(
        runs=500, concentration="Dirichlet(20 x default weights)",
        auc=dict(min=float(np.min(aucs)), p5=float(np.percentile(aucs, 5)), median=float(np.median(aucs)), p95=float(np.percentile(aucs, 95)), max=float(np.max(aucs))),
        top20=dict(min=float(np.min(caps)), median=float(np.median(caps)), max=float(np.max(caps))),
        default_auc=res["model"]["auc"],
        histogram=[int(v) for v in np.histogram(aucs, bins=12, range=(min(aucs), max(aucs)))[0]],
        histogram_range=[float(min(aucs)), float(max(aucs))],
    )

    # logistic regression cross-check (features without history; labels = pre-2015 events; scored on 2015+)
    X = T[:, [0, 1, 3]]
    Xs = (X - X.mean(0)) / (X.std(0) + 1e-9)
    w = logistic(Xs, y_cal.astype(float), l2=2.0)
    lin = Xs @ w[1:]
    coefs = np.abs(w[1:]) / np.abs(w[1:]).sum()
    res["logistic"] = dict(
        features=["terrain", "rain", "stream"], standardised_coef=[float(v) for v in w[1:]], relative_importance=[float(v) for v in coefs],
        research_relative=[float(v) for v in (w0[[0, 1, 3]] / w0[[0, 1, 3]].sum())],
        auc_holdout=auc(lin, y_test), auc_research_same_features=auc((T[:, [0, 1, 3]] @ w0[[0, 1, 3]]) * T[:, 4], y_test),
    )
    return res


def cyclone(ds):
    save = B.SEASONS
    out = {}
    for tag, seasons in (("train", (1990, 2013)), ("test", (2014, 2023))):
        B.SEASONS = seasons
        B.cyclone_stats(ds)
        out[tag] = np.array([d["cyc"]["p"] for d in ds]), np.array([d["cyc"]["storms"] for d in ds])
    B.SEASONS = save
    y = (out["test"][1] > 0).astype(int)
    s = out["train"][0]
    return dict(
        split=dict(train=[1990, 2013], test=[2014, 2023]), districts=len(ds), districts_with_test_storms=int(y.sum()),
        auc=auc(s, y), ci=boot_ci(s, y), top20_capture=top_capture(s, y), radius_km=B.CYCLONE_RADIUS_KM,
    )


def main():
    ds = build()
    ls = landslide(ds)
    cy = cyclone(ds)
    out = dict(
        generated=dt.date.today().isoformat(), landslide=ls, cyclone=cy,
        not_validated=["flood", "cloudburst", "coastal erosion", "heatwave"],
        caveats=[
            "The NASA Global Landslide Catalog is compiled from media reports: it over-represents roads, towns and English-language coverage.",
            "Validation is at district scale (an event within ~33 km of the polygon), so it tests ranking, not habitation-level accuracy.",
            "No open, machine-readable inventory of flood, cloudburst or shoreline-change events is ingested, so those layers are unvalidated.",
        ],
    )
    json.dump(out, open(B.OUT / "validation.json", "w", encoding="utf-8"), indent=1)
    print(json.dumps({k: out[k] for k in ("landslide", "cyclone")}, indent=1)[:3500])


if __name__ == "__main__":
    main()
