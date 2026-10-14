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
    const pp = pricing.pp || {};
    const fprod = f.reduce((a, b) => a * b, 1);
    if (mode === "power") {
      const base = Number((pp.base_power || {})[String(n)]);
      if (!(base > 0)) return null;
      return misses === 0 ? nbaCompress(pricing, base * fprod) : 0;
    }
    const allStd = f.every(x => Math.abs(x - 1) < 1e-9);
    let base;
    if (n === 2) base = Number((pp.flex_2pick_base || {})[String(hits)] || 0);
    else base = Number(((pp.flex_all_standard || {})[String(n)] || {})[String(hits)] || 0);
    if (!(base > 0)) return 0;
    if (allStd) return nbaCompress(pricing, base * fprod);
    return nbaFlexAlt(pricing, n, misses, fprod);
  }
  if (app === "underdog") {
    const ud = pricing.ud || {};
    if (mode === "power" || n === 2) {
      const base = Number((ud.standard || {})[String(n)]);
      if (!(base > 0)) return null;
      return misses === 0 ? base * f.reduce((a, b) => a * b, 1) : 0;
    }
    const base = Number((ud.flex || {})[n + "|" + misses] || 0);
    if (!(base > 0)) return 0;
    let prod = 1;
    for (let i = 0; i < n; i++) if (hit[i]) prod *= f[i];
    return base * prod;
  }
  if (app === "sleeper") {
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
    // partial tiers depend on WHICH legs miss (Underdog / Sleeper scale by the hit legs' factors): report the mean over the
    // possible miss sets so the field shows one honest estimate
    let tot = 0, cnt = 0, nullSeen = false;
    const masks = [];
    (function rec(i, left, cur) {
      if (i === n) { if (left === 0) masks.push(cur.slice()); return; }
      cur.push(true); rec(i + 1, left, cur); cur.pop();
      if (left > 0) { cur.push(false); rec(i + 1, left - 1, cur); cur.pop(); }
    })(0, misses, []);
    for (const m of masks) { const v = nbaPayout(pricing, app, mode, legs, m); if (v == null) nullSeen = true; else { tot += v; cnt++; } }
    if (nullSeen) return null;
    const v = cnt ? tot / cnt : 0;
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
