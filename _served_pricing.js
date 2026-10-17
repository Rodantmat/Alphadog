// NBA payout + EV math - the worker's nba/main_ui/pricing.js, serialized
var __name = typeof __name === 'function' ? __name : function (f) { return f; };
function nbaBreakeven(pricing, app, mode, legs) {
  let lo = 0.05, hi = 0.999;
  const at = /* @__PURE__ */ __name((p) => {
    const r = nbaEv(pricing, app, mode, legs, legs.map(() => p));
    return r ? r.ev : null;
  }, "at");
  if (at(hi) == null || at(hi) < 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const v = at(mid);
    if (v == null) return null;
    if (v > 0) hi = mid;
    else lo = mid;
  }
  return Math.round((lo + hi) / 2 * 1e4) / 100;
}
function nbaCompress(pricing, p) {
  const c = pricing.pp && pricing.pp.compression || {};
  const knee = Number(c.knee), ex = Number(c.exponent);
  if (!(knee > 0) || !(ex > 0)) return p;
  return p <= knee ? p : knee * Math.pow(p / knee, ex);
}
function nbaEv(pricing, app, mode, legs, probs) {
  const n2 = legs.length;
  let mean2 = 0, sq = 0, pAll = 1;
  for (let mask = 0; mask < 1 << n2; mask++) {
    let p = 1;
    const hit = [];
    for (let i = 0; i < n2; i++) {
      const h = mask >> i & 1;
      hit.push(!!h);
      p *= h ? probs[i] : 1 - probs[i];
    }
    const pay = nbaPayout(pricing, app, mode, legs, hit);
    if (pay == null) return null;
    mean2 += p * pay;
    sq += p * pay * pay;
  }
  for (const p of probs) pAll *= p;
  const variance = Math.max(sq - mean2 * mean2, 1e-9);
  return { ev: mean2 - 1, mean_payout: mean2, stdev: Math.sqrt(variance), hit_all_probability_0_100: Math.round(pAll * 1e4) / 100 };
}
function nbaFlexAlt(pricing, n2, misses, fprod) {
  const tiers = pricing.pp && pricing.pp.flex_alt_tiers && pricing.pp.flex_alt_tiers.tiers;
  const pts = tiers && tiers[String(n2)] && tiers[String(n2)][String(misses)];
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
function nbaFullMultiplier(pricing, app, mode, legs) {
  const t = nbaTiers(pricing, app, mode, legs);
  if (!t) return null;
  return t[legs.length] || 0;
}
function nbaLegFactor(leg) {
  const f = Number(leg && (leg.leg_factor != null ? leg.leg_factor : leg.factor));
  return Number.isFinite(f) && f > 0 ? f : null;
}
function nbaModeLabel(app, mode) {
  app = String(app || "").toLowerCase();
  if (mode === "flex") return "Flex";
  return app === "underdog" ? "Standard" : "Power";
}
function nbaModes(app, n2) {
  app = String(app || "").toLowerCase();
  if (n2 < 2 || n2 > 6) return [];
  if (app === "prizepicks") return ["power", "flex"];
  if (app === "underdog") return n2 >= 3 ? ["power", "flex"] : ["power"];
  if (app === "sleeper") return n2 >= 3 ? ["power", "flex"] : ["power"];
  return [];
}
function nbaPayout(pricing, app, mode, legs, hit) {
  app = String(app || "").toLowerCase();
  const n2 = legs.length;
  const f = legs.map(nbaLegFactor);
  if (f.some((x) => x == null)) return null;
  const hits = hit.filter(Boolean).length, misses = n2 - hits;
  if (app === "prizepicks") {
    const pp = pricing.pp || {};
    const fprod = f.reduce((a, b2) => a * b2, 1);
    if (mode === "power") {
      const base2 = Number((pp.base_power || {})[String(n2)]);
      if (!(base2 > 0)) return null;
      return misses === 0 ? nbaCompress(pricing, base2 * fprod) : 0;
    }
    const allStd = f.every((x) => Math.abs(x - 1) < 1e-9);
    let base;
    if (n2 === 2) base = Number((pp.flex_2pick_base || {})[String(hits)] || 0);
    else base = Number(((pp.flex_all_standard || {})[String(n2)] || {})[String(hits)] || 0);
    if (!(base > 0)) return 0;
    if (allStd) return nbaCompress(pricing, base * fprod);
    return nbaFlexAlt(pricing, n2, misses, fprod);
  }
  if (app === "underdog") {
    const ud = pricing.ud || {};
    if (mode === "power" || n2 === 2) {
      const base2 = Number((ud.standard || {})[String(n2)]);
      if (!(base2 > 0)) return null;
      return misses === 0 ? base2 * f.reduce((a, b2) => a * b2, 1) : 0;
    }
    const base = Number((ud.flex || {})[n2 + "|" + misses] || 0);
    if (!(base > 0)) return 0;
    let prod = 1;
    for (let i = 0; i < n2; i++) if (hit[i]) prod *= f[i];
    return base * prod;
  }
  if (app === "sleeper") {
    if (mode === "power" || n2 < 3) return misses === 0 ? f.reduce((a, b2) => a * b2, 1) : 0;
    if (misses === 0) {
      let s = 0;
      for (let j = 0; j < n2; j++) {
        let p = 1;
        for (let i = 0; i < n2; i++) if (i !== j) p *= f[i];
        s += p;
      }
      return s / n2;
    }
    if (misses === 1) {
      let p = 1;
      for (let i = 0; i < n2; i++) if (hit[i]) p *= f[i];
      return p / n2;
    }
    return 0;
  }
  return null;
}
function nbaTiers(pricing, app, mode, legs) {
  const n2 = legs.length;
  const out = {};
  if (n2 < 2) return out;
  for (let misses = 0; misses <= Math.min(2, n2 - 1); misses++) {
    let tot = 0, cnt = 0, nullSeen = false;
    const masks = [];
    (/* @__PURE__ */ __name((function rec(i, left, cur) {
      if (i === n2) {
        if (left === 0) masks.push(cur.slice());
        return;
      }
      cur.push(true);
      rec(i + 1, left, cur);
      cur.pop();
      if (left > 0) {
        cur.push(false);
        rec(i + 1, left - 1, cur);
        cur.pop();
      }
    }), "rec"))(0, misses, []);
    for (const m of masks) {
      const v2 = nbaPayout(pricing, app, mode, legs, m);
      if (v2 == null) nullSeen = true;
      else {
        tot += v2;
        cnt++;
      }
    }
    if (nullSeen) return null;
    const v = cnt ? tot / cnt : 0;
    if (v > 0) out[n2 - misses] = Math.round(v * 1e3) / 1e3;
  }
  return out;
}
