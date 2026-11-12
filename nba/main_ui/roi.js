// NBA MAIN UI - LEG ROI (owner 2026-11-11 17:38 / 17:40 PT: "an implied ROI per leg ... make it very, very smart, use all the possible
// numbers to be as close as possible to the final real number"). Display only: final_hp, score and every threshold are untouched.
//
//   ROI = p x m - 1     m = the leg's own multiplier = 1 / its break-even (board.legPricing: goblin / demon factor, Underdog modifier,
//                       Sleeper / Fliff price - the same definition the card's Edge uses)
//         p = the best estimate of the REAL hit rate of this leg, in five layers:
//   1. the model's hit probability (final_hp);
//   2. corrected by what legs priced like it REALLY did - nba_score._mf_study_fs, ~740,000 PrizePicks legs, two seasons, model probability
//      beside the result. The correction (realized minus model) is read from a chain: all legs -> kind (goblin / demon / standard) ->
//      kind x tier, each pulled toward the broader one when its own sample is thin (empirical Bayes), by side, interpolated between
//      neighbouring 5-point probability buckets (no step edges). BACKTESTED (train one season, test the other, both directions, 2026-11-11):
//      Brier error -2.4% / -2.5% and log loss -2.0% / -2.1% vs the raw model probability; kind x tier is the best depth - adding the PROP
//      level made the out-of-season score WORSE (over-granular, it drifts between seasons), so it is not used; linear and log-odds
//      corrections score the same (linear kept). Player-context features (rest, minutes / usage trend, line class, phase, spread of
//      recent games, sample of games) leave no stable residual after this correction - only the sharp-book gap does;
//   3. blended with the PRICE the app puts on the leg. The price carries the market's own read of the leg, and it is the biggest single
//      source of accuracy the model lacks: ranking legs by the calibrated model alone still over-stated the top legs (top decile predicted
//      +17%, realized -10%). The app's break-even includes the house margin, so the fair price probability is kappa x break-even - kappa
//      (standard .89, goblin .85, demon .76) is exactly the realized-hit / break-even ratio, stable across both seasons - and the realized
//      residual loads on (fair price - calibrated model) at 0.60 for goblins and demons (0.56 / 0.63 / 0.60 / 0.60 by season and kind) and
//      about 0.20 for standard lines (which barely vary in price). BACKTEST of the final number, trained on one season, tested on the
//      other: predicted ROI by decile tracks the realized ROI within about 1-2 points (decile 1 -34.0% vs -35.3%, decile 5 -16.4% vs -18.0%,
//      decile 9 -8.6% vs -9.4%, decile 10 -2.2% vs -4.4%) and the Brier error falls in every decile; the other apps have no graded price
//      history, so they use kappa .88 and weight .40 (an assumption, tunable);
//   4. a floor: the same estimate pushed down by its standard error (the calibration sample behind it plus the model's own
//      uncertainty), so a +20% leg resting on 40 comparable legs reads very differently from one resting on 40,000.
//   The Flex consolation tiers, same-game correlation and pushes move a SLIP's ROI, not a leg's: this is a per-leg ranking number.
import { q } from "./common.js";

const CAL = { map: null, at: 0, n: 0, inflight: null, error: null };
export const QUOTA_DEFAULT = { kind: { goblin: 20, regular: 20, demon: 20 }, app: 30, prop: 5, side: 30, total_cap: 500 };
export const ROI_DEFAULT = { kappa: { standard: 0.89, goblin: 0.85, demon: 0.76, all: 0.88 }, price_w: { standard: 0.2, goblin: 0.6, demon: 0.6, all: 0.4 }, model_sd: 0.02, z: 1.28 };
const KS = [0, 300, 200];            // how many legs a more specific group needs to count as much as the broader one
const sideKey = s => /^(o|m|h)/i.test(String(s)) ? "over" : "under";

// PrizePicks tier as the study names it (D1..D3 / G1..G3 / R) from the live board's signed tier number
export function tierKey(kind, tier) {
  const t = Math.abs(Number(tier));
  if (kind === "demon") return "D" + Math.min(3, Number.isFinite(t) ? t : 3);
  if (kind === "goblin") return "G" + Math.min(3, Number.isFinite(t) ? t : 1);
  return "R";
}

export async function loadCal(sql) {
  if (CAL.map && Date.now() - CAL.at < 6 * 3600e3) return CAL;
  if (CAL.inflight) return CAL.inflight;
  CAL.inflight = (async () => {
    try {
      const rows = await q(sql, `SELECT kind, tier, side, LEAST(19, GREATEST(0, FLOOR(hp * 20)))::int b, count(*)::int n, sum(hit::int)::float8 hits, sum(hp)::float8 sumhp
                                 FROM nba_score._mf_study_fs WHERE hp IS NOT NULL AND hit IS NOT NULL GROUP BY 1, 2, 3, 4`, [], 60000);
      const m = new Map();
      const add = (k, b, r) => {
        let e = m.get(k); if (!e) { e = { n: new Array(20).fill(0), g: new Array(20).fill(0), h: new Array(20).fill(0) }; m.set(k, e); }
        e.n[b] += r.n; e.g[b] += Number(r.hits) - Number(r.sumhp); e.h[b] += Number(r.hits);
      };
      let n = 0;
      for (const r of rows) {
        const s = sideKey(r.side);
        add(`all|${s}`, r.b, r); add(`${r.kind}|${s}`, r.b, r); add(`${r.kind}|${r.tier}|${s}`, r.b, r);
        n += r.n;
      }
      CAL.map = m; CAL.at = Date.now(); CAL.n = n; CAL.error = null;
    } catch (e) { CAL.error = String(e && e.message || e); if (!CAL.map) CAL.map = new Map(); }   // never break the board over the calibration: no table = the model number
    CAL.inflight = null;
    return CAL;
  })();
  return CAL.inflight;
}

// the realized-minus-model gap and its sample size at probability hp, interpolated between the two nearest buckets' centres
function gapAt(key, hp) {
  const e = CAL.map && CAL.map.get(key);
  if (!e) return null;
  const x = hp * 20 - 0.5, i = Math.floor(x), t = x - i;
  const i0 = Math.min(19, Math.max(0, i)), i1 = Math.min(19, Math.max(0, i + 1));
  const n0 = e.n[i0], n1 = e.n[i1];
  if (n0 + n1 < 1) return null;
  const g0 = n0 ? e.g[i0] / n0 : null, g1 = n1 ? e.g[i1] / n1 : null;
  const gap = g0 == null ? g1 : g1 == null ? g0 : (1 - t) * g0 + t * g1;
  return { gap, n: (1 - t) * n0 + t * n1 };
}

export function calKind(app, lineType) { return app === "prizepicks" ? (lineType === "goblin" || lineType === "demon" ? lineType : "standard") : "all"; }

// the leg's estimated REAL hit rate and how sure we are of it: { p, p_model, gap, n, se }
export function estimateHit(o, cfg = ROI_DEFAULT) {
  const hp = o.hp;
  if (hp == null || !Number.isFinite(hp)) return null;
  const s = sideKey(o.side), kc = o.kc;
  const keys = kc === "all" ? [`all|${s}`]
    : [`all|${s}`, `${kc}|${s}`, `${kc}|${o.tier}|${s}`];
  let g = 0, n = 0;
  keys.forEach((k, l) => {
    const r = gapAt(k, hp);
    if (!r) return;
    if (l === 0) { g = r.gap; n = r.n; return; }
    const w = r.n / (r.n + (KS[l] ?? 200));
    g = g + (r.gap - g) * w;
    if (r.n >= 30) n = r.n;
  });
  let p = Math.min(0.995, Math.max(0.005, hp + g));
  const pCal = p;
  // the app's price: its break-even, less the house margin, is the market's fair probability for this leg
  const be = o.be;
  let priced = false;
  if (be != null && Number.isFinite(be) && be > 0 && be < 1) {
    const pf = Math.min(0.99, ((cfg.kappa && cfg.kappa[kc]) ?? 0.88) * be), w = (cfg.price_w && cfg.price_w[kc]) ?? 0.4;
    p = p + w * (pf - p); priced = true;
  }
  p = Math.min(0.995, Math.max(0.005, p));
  const conf = o.conf == null || !Number.isFinite(o.conf) ? 0.9 : Math.min(1, Math.max(0, o.conf));
  const se = Math.sqrt(p * (1 - p) / (Math.max(0, n) + 30) + cfg.model_sd * cfg.model_sd * (1.3 - conf));
  return { p, p_model: hp, p_cal: pCal, gap: g, n: Math.round(n), se, priced };
}

// ROI of a leg as fractions (0.07 = +7%): expected, and the conservative floor; null when the leg's own price is unknown
export function legRoi(o, legFactor, breakeven, cfg = ROI_DEFAULT) {
  if (o.hp == null) return null;
  if (o.app === "prizepicks" && o.lt !== "regular" && !(legFactor > 0)) return null;
  const est = estimateHit({ ...o, kc: calKind(o.app, o.lt), be: breakeven }, cfg);
  if (!est) return null;
  return { roi: est.p / breakeven - 1, roi_lo: (est.p - cfg.z * est.se) / breakeven - 1, mult: 1 / breakeven, ...est };
}

// QUOTAS (owner 2026-11-11): at least 20 goblins, 20 regulars, 20 demons; 30 per app; 5 per prop; 30 More and 30 Less. Each bucket
// takes its best-ROI legs. Owner 17:58: a negative-ROI leg does not belong on the board - only the goblin / demon buckets may be filled
// with the best of the rest when there are not enough positive ones; every other bucket stays short and says so.
// cands: [{ key, app, lt, prop, over, roi, score }] (roi non-null).
export function pickQuota(cands, apps, Q = QUOTA_DEFAULT) {
  const pick = new Map(), status = [];
  const byRoi = (a, b) => b.roi - a.roi || (b.score || 0) - (a.score || 0);
  const take = (name, list, n, flexible = false) => {
    const all = list.slice().sort(byRoi);
    const pos = all.filter(c => c.roi > 0).length;
    const s = flexible ? all : all.filter(c => c.roi > 0);
    let got = 0;
    for (const c of s) { if (got >= n) break; if (!pick.has(c.key)) pick.set(c.key, { c, tags: [] }); pick.get(c.key).tags.push(name); got++; }
    status.push({ bucket: name, quota: n, available: all.length, positive: pos, taken: got, short: got < n });
  };
  for (const k of Object.keys(Q.kind)) take("kind:" + k, cands.filter(c => c.lt === k), Q.kind[k], k !== "regular");
  for (const a of apps) take("app:" + a, cands.filter(c => c.app === a), Q.app);
  for (const p of [...new Set(cands.map(c => c.prop))].sort()) take("prop:" + p, cands.filter(c => c.prop === p), Q.prop);
  take("side:more", cands.filter(c => c.over), Q.side);
  take("side:less", cands.filter(c => !c.over), Q.side);
  return { picks: pick, status };
}
