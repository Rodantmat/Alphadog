// NBA MAIN UI - slip payout + EV math, shared by the worker (import) and the browser (served as /js/pricing.js: assets.js
// serializes these functions, so there is one source). The rules are the certified graders', read from the database:
//   PrizePicks (nba/build_slip_engine.py grade): Power = compress(base_power[n] x prod(factor)); Flex all-standard = the published
//     flex_all_standard / flex_2pick_base table; Flex with a goblin / demon = flex_alt_tiers (PrizePicks' own quotes, lower envelope,
//     interpolated in ln(factor product)). factor = nba_market.pp_leg_price.factor (1.0 for a standard line).
//   Underdog (nba/build_ud_slip_engine.py / ud_live_slip_engine.payout): Standard = STD[n] x prod(factor); Flex = FLEX[n|misses] x
//     prod(factor of the legs that hit). factor = the Underdog pick multiplier (board_snapshots.multiplier, 1.0 on a main line).
//   Sleeper (classification_config['sleeper_payout']): Power = product of the picks' multipliers; Flex (3+) = round-robin over the
//     (n-1)-pick sub-combinations: all hit = mean of the n products, one miss = product of the other n-1 / n, two misses = 0.
// pricing = { pp: {base_power, flex_all_standard, flex_2pick_base, compression, flex_alt_tiers}, ud: {standard, flex}, sleeper: {...} }
// nba/test_nba_main_ui.py asserts these payouts equal build_slip_engine.grade / ud_live_slip_engine.payout on random slips.

export function nbaCompress(pricing, p) {
  const c = (pricing.pp && pricing.pp.compression) || {};
  const knee = Number(c.knee), ex = Number(c.exponent);
  if (!(knee > 0) || !(ex > 0)) return p;
  return p <= knee ? p : knee * Math.pow(p / knee, ex);
}

export function nbaFlexAlt(pricing, n, misses, fprod) {
  const tiers = pricing.pp && pricing.pp.flex_alt_tiers && pricing.pp.flex_alt_tiers.tiers;
  const pts = tiers && tiers[String(n)] && tiers[String(n)][String(misses)];
  if (!pts || !pts.length) return 0;
  if (fprod <= pts[0][0]) return pts[0][1];
  if (fprod >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x0 <= fprod && fprod <= x1) {
      if (x1 === x0) return Math.min(y0, y1);
      const w = (Math.log(fprod) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
      return y0 + w * (y1 - y0);
    }
  }
  return 0;
}

// PrizePicks' payout grid rounded DOWN: 0.1 steps below 3x, 0.25 at or above (build_slip_engine.grid_down)
export function nbaGridDown(x) {
  return x < 3 ? Math.floor(x / 0.1 + 1e-9) * 0.1 : Math.floor(x / 0.25 + 1e-9) * 0.25;
}

// two or more legs from one game (every leg must carry its game: event_id or game_pk; otherwise unknown -> false)
export function nbaSameGame(legs) {
  const ev = (legs || []).map(l => (l && (l.event_id != null ? l.event_id : l.game_pk)));
  if (!ev.length || ev.some(e => e == null || e === "")) return false;
  return new Set(ev.map(String)).size < ev.length;
}

export function nbaLegFactor(leg) {
  const f = Number(leg && (leg.leg_factor != null ? leg.leg_factor : leg.factor));
  return Number.isFinite(f) && f > 0 ? f : null;
}

// structures each app offers at size n
export function nbaModes(app, n) {
  app = String(app || "").toLowerCase();
  if (n < 2 || n > 6) return [];
  if (app === "prizepicks") return ["power", "flex"];
  if (app === "underdog") return n >= 3 ? ["power", "flex"] : ["power"];
  if (app === "sleeper") return n >= 3 ? ["power", "flex"] : ["power"];
  return [];
}

// payout multiple for one outcome (hit[i] = true/false for every leg); null = cannot be priced (missing factor or table)
export function nbaPayout(pricing, app, mode, legs, hit) {
  app = String(app || "").toLowerCase();
  const n = legs.length;
  const f = legs.map(nbaLegFactor);
  if (f.some(x => x == null)) return null;
  const hits = hit.filter(Boolean).length, misses = n - hits;
  if (app === "prizepicks") {
    // GRADER v3 (2026-10-18) - the twin of build_slip_engine.pp_payout (proven on PrizePicks' own quotes, PP_PAYOUT_FINDINGS §0l):
    // all-standard Power = the base exactly; Power with goblins / demons (3-6 picks) = gridDown(b_n x fp^a_n) (power_alt_v3),
    // 2-pick compress(3 x fp); all-standard Flex = its table, a same-game 3 / 4-pick = flex_same_game_v3; Flex with alternates =
    // the quote-derived tiers.
    const pp = pricing.pp || {};
    const fprod = f.reduce((a, b) => a * b, 1);
    const alt = f.some(x => Math.abs(x - 1) > 1e-9);
    if (mode === "power") {
      if (misses > 0) return 0;
      if (!alt) {
        // same-game all-standard 2 / 3-pick Power (2026-10-21, power_same_game_v3, conservative) - twin of build_slip_engine.pp_payout
        if ((n === 2 || n === 3) && nbaSameGame(legs)) {
          const sgp = Number((pp.power_same_game_v3 || {})[String(n)]);
          return sgp > 0 ? sgp : null;
        }
        const base = Number((pp.base_power || {})[String(n)]); return base > 0 ? base : null;
      }
      if (n === 2) return nbaCompress(pricing, 3 * fprod);
      const r = (pp.power_alt_v3 || {})[String(n)];
      if (!r) return null;
      return nbaGridDown(Number(r.b) * Math.pow(fprod, Number(r.a)));
    }
    let base;
    if (n === 2) base = Number((pp.flex_2pick_base || {})[String(hits)] || 0);
    else base = Number(((pp.flex_all_standard || {})[String(n)] || {})[String(hits)] || 0);
    if (!(base > 0)) return 0;
    if (alt) return n >= 3 ? nbaFlexAlt(pricing, n, misses, fprod) : 0;
    if ((n === 3 || n === 4) && nbaSameGame(legs)) {
      const sg = (pp.flex_same_game_v3 || {})[String(n)];
      if (!sg) return null;
      return Number(sg[String(hits)] || 0);
    }
    return base;
  }
  if (app === "underdog") {
    // PROVEN 2026-10-21 on Underdog's own entry estimate (47 / 47 Standard and 36 / 36 Flex entries across different games exact):
    // base x product of the payout modifiers (Flex partial: the HIT picks' modifiers), FLOORED to 2 decimals; 4-pick Flex base 7.2
    // (the tunable nba_main_ui.ud_payout). Same-game entries Underdog prices lower (x0.86-0.99, correlation) - the engine never builds them.
    const ud = pricing.ud || {};
    const floor2 = x => Math.floor(x * 100 + 1e-6) / 100;
    if (mode === "power" || n === 2) {
      const base = Number((ud.standard || {})[String(n)]);
      if (!(base > 0)) return null;
      return misses === 0 ? floor2(base * f.reduce((a, b) => a * b, 1)) : 0;
    }
    const base = Number((ud.flex || {})[n + "|" + misses] || 0);
    if (!(base > 0)) return 0;
    let prod = 1;
    for (let i = 0; i < n; i++) if (hit[i]) prod *= f[i];
    return floor2(base * prod);
  }
  if (app === "sleeper") {
    // SLEEPER'S OWN PRICING (2026-10-26, fitted on 454 of the owner's entries - classification_config['sleeper_payout'].true_pricing):
    // Max = product x size bonus (every leg in a different game); Flex tiers EV-matched at q = 1/m:
    // T0 = flex_ev[n] / (P(all) + r1 P(1 miss) + r2 P(2 misses)), T1 = r1 T0, T2 = r2 T0 - the twin of sleeper_live_slip_engine.flex_tiers.
    const tp = (pricing.sleeper || {}).true_pricing;
    if (tp && tp.max_bonus) {
      const prod = f.reduce((a, b) => a * b, 1);
      if (mode === "power" || n < 3) return misses === 0 ? prod * Number(tp.max_bonus[String(n)] || 1) : 0;
      const ev = Number((tp.flex_ev || {})[String(n)]), rr = (tp.flex_ratio || {})[String(n)];
      if (!(ev > 0) || !rr) return null;
      const qv = f.map(x => 1 / x);
      const pall = qv.reduce((a, b) => a * b, 1);
      let p1 = 0, p2 = 0;
      for (let i = 0; i < n; i++) p1 += pall / qv[i] * (1 - qv[i]);
      for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) p2 += pall / (qv[i] * qv[k]) * (1 - qv[i]) * (1 - qv[k]);
      const t0 = ev / (pall + Number(rr[0]) * p1 + Number(rr[1]) * p2);
      return misses === 0 ? t0 : misses === 1 ? t0 * Number(rr[0]) : misses === 2 ? t0 * Number(rr[1]) : 0;
    }
    if (mode === "power" || n < 3) return misses === 0 ? f.reduce((a, b) => a * b, 1) : 0;
    if (misses === 0) {
      let s = 0;
      for (let j = 0; j < n; j++) { let p = 1; for (let i = 0; i < n; i++) if (i !== j) p *= f[i]; s += p; }
      return s / n;
    }
    if (misses === 1) { let p = 1; for (let i = 0; i < n; i++) if (hit[i]) p *= f[i]; return p / n; }
    return 0;
  }
  return null;
}

// full-hit multiplier and the per-hit-count tiers (Flex) for a slip
export function nbaTiers(pricing, app, mode, legs) {
  const n = legs.length;
  const out = {};
  if (n < 2) return out;
  for (let misses = 0; misses <= Math.min(2, n - 1); misses++) {
    // partial tiers depend on WHICH legs miss (Underdog / Sleeper scale by the hit legs' factors). Underdog's app shows the BEST case
    // (the lowest-modifier picks miss - proven 2026-10-21 on its own estimate), so Underdog tiers show that, to match the app the
    // owner reads; Sleeper keeps the mean over the miss sets. EV (nbaEv) always uses every outcome's real payout.
    let tot = 0, cnt = 0, nullSeen = false;
    const masks = [];
    (function rec(i, left, cur) {
      if (i === n) { if (left === 0) masks.push(cur.slice()); return; }
      cur.push(true); rec(i + 1, left, cur); cur.pop();
      if (left > 0) { cur.push(false); rec(i + 1, left - 1, cur); cur.pop(); }
    })(0, misses, []);
    let best = 0;
    for (const m of masks) { const v = nbaPayout(pricing, app, mode, legs, m); if (v == null) nullSeen = true; else { tot += v; cnt++; if (v > best) best = v; } }
    if (nullSeen) return null;
    let v = cnt ? tot / cnt : 0;
    if (String(app || "").toLowerCase() === "underdog" && cnt) v = best;
    if (v > 0) out[n - misses] = Math.round(v * 1000) / 1000;
  }
  return out;
}

export function nbaFullMultiplier(pricing, app, mode, legs) {
  const t = nbaTiers(pricing, app, mode, legs);
  if (!t) return null;
  return t[legs.length] || 0;
}

// exact EV over every hit/miss outcome (legs independent), plus stdev and P(all hit)
export function nbaEv(pricing, app, mode, legs, probs) {
  const n = legs.length;
  let mean = 0, sq = 0, pAll = 1;
  for (let mask = 0; mask < (1 << n); mask++) {
    let p = 1;
    const hit = [];
    for (let i = 0; i < n; i++) { const h = (mask >> i) & 1; hit.push(!!h); p *= h ? probs[i] : 1 - probs[i]; }
    const pay = nbaPayout(pricing, app, mode, legs, hit);
    if (pay == null) return null;
    mean += p * pay; sq += p * pay * pay;
  }
  for (const p of probs) pAll *= p;
  const variance = Math.max(sq - mean * mean, 1e-9);
  return { ev: mean - 1, mean_payout: mean, stdev: Math.sqrt(variance), hit_all_probability_0_100: Math.round(pAll * 10000) / 100 };
}

// the flat per-leg hit rate at which this exact slip breaks even
export function nbaBreakeven(pricing, app, mode, legs) {
  let lo = 0.05, hi = 0.999;
  const at = p => { const r = nbaEv(pricing, app, mode, legs, legs.map(() => p)); return r ? r.ev : null; };
  if (at(hi) == null || at(hi) < 0) return null;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const v = at(mid); if (v == null) return null; if (v > 0) hi = mid; else lo = mid; }
  return Math.round(((lo + hi) / 2) * 10000) / 100;
}

export function nbaModeLabel(app, mode) {
  app = String(app || "").toLowerCase();
  if (mode === "flex") return "Flex";
  return app === "underdog" ? "Standard" : "Power";
}
