#!/usr/bin/env python3
"""
RESEARCH - Underdog's OWN entry payout, probed, predicted and checked (owner 2026-10-21 15:36-15:37 PT: "you need to go in the app ...
add legs and understand the multiplier logic ... find a way to do the same with Underdog to get the proper multipliers"; "probe ...
make guesses, then go and check, and if it's wrong, keep trying until you get it right").

ACCESS (found 2026-10-21 in Underdog's web bundle, chunk 699): GET api.underdogfantasy.com/v4/entry_slips/estimate
?options[i][id]=<option id>&options[i][type]=OverUnderOption&fee=10&fee_source=cash (brackets URL-encoded) - NO login for picks priced
as FANTASY (odds.fantasy); an entry with 2+ PREDICTION-market picks (odds.prediction, UDX contracts - most of the CA board) answers
"User is required for entries that contain multiple prediction markets". It returns the entry builder's own prices: `odds`
(the Standard entry, decimal) and `flex.offerings[].pricing[losses].odds` (Flex, decimal per loss count). (payout_outcome, chunk 7151,
returns only the base tables: Flex 3 3.25/1.09, 4 7.2/1.4, 5 10/2.5, 6 25/2.6/0.25, 7 40/2.75/0.5, 8 80/3/1.)

Each round: a fresh Underdog NBA board (our scraper, same headers / proxy), N random pre-game entries of 2-6 picks (one pick per game,
a share same-game), Underdog's quote for each, and OUR prediction beside it:
  standard = STD[n] x prod(payout_multiplier)        flex full = FLEX[n|0] x prod(m)
  flex k losses: candidates (best) FLEX[n|k] x the largest prod(hit m) over the k-miss sets (= the k lowest-m picks miss),
  (all) FLEX[n|k] x prod(all m), (meanhit) FLEX[n|k] x mean over the k-miss sets of prod(hit m), (table) table only.
ROUND 2 (run 39689206312, 50 fantasy entries): Standard = STD[n] x prod(m) and Flex full = FLEX[n|0] x prod(m) to 0.05% (Underdog
floors to 2 decimals; standard is `odds.multiplier`). Partials fit none of all / meanhit / table -> (best) added.
RX_KIND=mix: one prediction-market pick + fantasy picks, to learn how a prediction pick is priced.
Every quote is stored (nba_market.ud_payout_quotes, retained). The summary says which prediction matches and by how much.
Env: RX_N (entries, default 60), RX_SEED, RX_SAME_GAME_SHARE (default 0.2), RX_SIZES (default 2,3,4,5,6), RX_KIND (fantasy | prediction).
"""
import itertools
import json
import os
import random
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

N = int(os.environ.get("RX_N", "60"))
SEED = int(os.environ.get("RX_SEED", str(int(time.time()))))
SAME = float(os.environ.get("RX_SAME_GAME_SHARE", "0.2"))
SIZES = [int(x) for x in os.environ.get("RX_SIZES", "2,3,4,5,6").split(",") if x.strip()]
RUN_ID = os.environ.get("GITHUB_RUN_ID", "local") + "-" + str(SEED)

# our tables (nba_main_ui.ud_payout / build_ud_slip_engine.STD / FLEX) - the prediction under test; 4|0 = 7.2 from Underdog's own
# payout_outcome table 2026-10-21 (ours said 6.0)
STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0, 7: 65.0, 8: 120.0}
FLEX = {"3|0": 3.25, "3|1": 1.09, "4|0": 7.2, "4|1": 1.4, "5|0": 10.0, "5|1": 2.5, "6|0": 25.0, "6|1": 2.6, "6|2": 0.25,
        "7|0": 40.0, "7|1": 2.75, "7|2": 0.5, "8|0": 80.0, "8|1": 3.0, "8|2": 1.0}


def sh(cmd, env=None):
    return subprocess.run(cmd, env=env, capture_output=True, text=True)


def main():
    r = sh([sys.executable, "-m", "pip", "install", "-q", "curl_cffi"])
    if r.returncode:
        print("pip curl_cffi failed", r.stderr[-400:])
        sys.exit(1)
    import psycopg
    from curl_cffi import requests as cr
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url) as conn:
        row = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'proxy_url'").fetchone()
    proxy = (row[0] if row else "").strip()
    print(f"run {RUN_ID} | entries {N} | sizes {SIZES} | same-game share {SAME} | proxy {'yes' if proxy else 'no'}", flush=True)

    # 1. a fresh board (our own scraper)
    out = Path(tempfile.mkdtemp())
    env = dict(os.environ, UNDERDOG_SPORTS="NBA", UNDERDOG_OUT_DIR=str(out), PROXY_URL=proxy, UNDERDOG_BUDGET_S="200")
    t0 = time.time()
    r = sh([sys.executable, "nba/scrape_underdog_board.py"], env=env)
    print(f"board scrape {time.time() - t0:.0f}s rc {r.returncode}", flush=True)
    bf = out / "underdog_nba_current.json"
    if not bf.exists():
        print("no board file:", (r.stdout + r.stderr)[-800:])
        sys.exit(1)
    b = json.loads(bf.read_text())
    legs = {l["line_id"]: l for l in b.get("legs") or []}
    now = datetime.now(timezone.utc)
    opts = []
    for rl in b.get("raw_lines") or []:
        lg = legs.get(rl.get("id"))
        if not lg or lg.get("appearance_type") == "Match" or rl.get("live_event") or lg.get("live"):
            continue
        gs = lg.get("game_start")
        if not gs or datetime.fromisoformat(gs.replace("Z", "+00:00")) <= now:
            continue
        for o in rl.get("options") or []:
            if o.get("status") != "active" or o.get("type") != "OverUnderOption" or o.get("payout_multiplier") in (None, ""):
                continue
            od = o.get("odds") or {}
            kind = "fantasy" if od.get("fantasy") else ("prediction" if od.get("prediction") else ("sportsbook" if od.get("sportsbook") else "none"))
            want = os.environ.get("RX_KIND", "fantasy")
            if want != "mix" and kind != want:
                continue
            if want == "mix" and kind not in ("fantasy", "prediction"):
                continue
            opts.append({"id": o["id"], "lookup_id": o.get("lookup_id"), "m": float(o["payout_multiplier"]), "choice": o.get("choice"), "kind": kind,
                         "price": float((od.get(kind) or {}).get("decimal") or 0) or None,
                         "player": lg.get("player"), "player_id": lg.get("player_id"), "team": lg.get("team"), "stat": lg.get("stat"),
                         "line": lg.get("line"), "line_type": rl.get("line_type"), "game": lg.get("game_id"), "start": gs})
    games = sorted({o["game"] for o in opts})
    print(f"board: {len(legs)} lines, {len(opts)} pre-game options, {len(games)} games not started", flush=True)
    if len(games) < 2:
        print("fewer than 2 games not started - nothing to probe now")
        return

    H = {"accept": "application/json", "origin": "https://app.underdogsports.com", "referer": "https://app.underdogsports.com/",
         "client-type": "web", "client-version": os.environ.get("UNDERDOG_CLIENT_VERSION", "20260907143253"), "client-device-id": str(uuid.uuid4()),
         "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
         "user-latitude": "32.65148161377867", "user-longitude": "-116.8550890281236"}
    common = "product=fantasy&product_experience_id=b34dfd93-d0e8-4da3-8bf4-45c15c548dec&state_config_id=725014ef-3570-4e93-871d-d69674ab3521"
    sess = cr.Session(impersonate="chrome")

    def call(qs):
        u = "https://api.underdogfantasy.com/v4/entry_slips/estimate?" + common + "&fee=10&fee_source=cash&" + qs
        for px in ([None, proxy] if proxy else [None]):
            try:
                rr = sess.get(u, headers=H, timeout=30, proxies=({"https": px, "http": px} if px else None))
                if rr.status_code == 200:
                    jj = rr.json()
                    if str(jj.get("status") or "").lower() in ("pending", "processing", "queued") and not jj.get("odds"):
                        time.sleep(2.0)
                        rr = sess.get(u, headers=H, timeout=30, proxies=({"https": px, "http": px} if px else None))
                        jj = rr.json() if rr.status_code == 200 else jj
                    return jj
            except Exception:  # noqa: BLE001 - next route
                continue
        return None

    # 2. find the parameter shape the API accepts (the bundle sends options[i][id] / [type], arrayFormat indices)
    shapes = {
        "id+type (encoded)": lambda ps: "&".join(f"options%5B{i}%5D%5Bid%5D={p['id']}&options%5B{i}%5D%5Btype%5D=OverUnderOption" for i, p in enumerate(ps)),
        "id+type": lambda ps: "&".join(f"options[{i}][id]={p['id']}&options[{i}][type]=OverUnderOption" for i, p in enumerate(ps)),
        "id+type+lookup": lambda ps: "&".join(f"options[{i}][id]={p['id']}&options[{i}][lookup_id]={p['lookup_id']}&options[{i}][type]=OverUnderOption" for i, p in enumerate(ps)),
        "id only": lambda ps: "&".join(f"options[{i}][id]={p['id']}" for i, p in enumerate(ps)),
        "lookup as id": lambda ps: "&".join(f"options[{i}][id]={p['lookup_id']}&options[{i}][type]=OverUnderOption" for i, p in enumerate(ps)),
    }
    rng = random.Random(SEED)

    def pick(n, same_game=False):
        gl = games[:]
        rng.shuffle(gl)
        chosen, used_players = [], set()
        if same_game:
            g = gl[0]
            pool = [o for o in opts if o["game"] == g]
            rng.shuffle(pool)
            for o in pool:
                if o["player"] not in used_players and len(chosen) < 2:
                    chosen.append(o)
                    used_players.add(o["player"])
            gl = gl[1:]
        mix = os.environ.get("RX_KIND", "fantasy") == "mix"
        if mix:
            # MIX: exactly one prediction-market pick (Underdog prices one without a user), the rest fantasy-priced
            g0 = next((g for g in gl if any(o["game"] == g and o["kind"] == "prediction" for o in opts)), None)
            if g0 is None:
                return None
            o = rng.choice([o for o in opts if o["game"] == g0 and o["kind"] == "prediction"])
            chosen.append(o)
            used_players.add(o["player"])
            gl = [g for g in gl if g != g0]
        for g in gl:
            if len(chosen) >= n:
                break
            pool = [o for o in opts if o["game"] == g and o["player"] not in used_players and (not mix or o["kind"] == "fantasy")]
            if pool:
                o = rng.choice(pool)
                chosen.append(o)
                used_players.add(o["player"])
        return chosen if len(chosen) == n else None

    shape = None
    probe = pick(2)
    for name, fn in shapes.items():
        j = call(fn(probe))
        errs = (j or {}).get("errors") or []
        sc = len((j or {}).get("resolved_selections") or [])
        print(f"shape {name}: {'no response' if j is None else ('resolved ' + str(sc) + ' errors ' + str([e.get('error_key') for e in errs]))}", flush=True)
        if j is not None and len(j.get("resolved_selections") or []) == len(probe):
            shape = fn
            print(f"ACCEPTED shape: {name}", flush=True)
            break
    if not shape:
        print("no parameter shape accepted - stop (try the owner's captured request next)")
        return

    rows, cmp = [], []
    for i in range(N):
        n = SIZES[i % len(SIZES)]
        same = n >= 3 and rng.random() < SAME
        ps = pick(n, same)
        if not ps:
            continue
        j = call(shape(ps))
        if not j:
            print(f"#{i} n={n} no response", flush=True)
            continue
        prod = 1.0
        for p in ps:
            prod *= p["m"]
        od = j.get("odds") or {}
        s_mult = float(od.get("multiplier") or od.get("decimal") or 0) or None
        offs = ((j.get("flex") or {}).get("offerings") or [])
        pr = (offs[0].get("pricing") or {}) if offs else {}
        f_mult = float(((pr.get("0") or {}).get("odds") or {}).get("decimal") or 0) or None
        fb = {k: float(((v or {}).get("odds") or {}).get("decimal") or 0) for k, v in pr.items() if k != "0"}
        st = {"errors": [e for e in (j.get("errors") or [])]}
        ins = {"errors": [((j.get("flex") or {}).get("error"))] if (j.get("flex") or {}).get("error") else []}
        pred_s = STD.get(n, 0) * prod
        pred_f = FLEX.get(f"{n}|0", 0) * prod
        rec = {"n": n, "same_game": same, "prod": round(prod, 6), "m": [p["m"] for p in ps], "std": s_mult, "pred_std": round(pred_s, 4),
               "flex": f_mult, "pred_flex": round(pred_f, 4), "fallbacks": fb,
               "std_err": [e.get("error_key") or e.get("validation_status") for e in (st.get("errors") or []) if isinstance(e, dict)],
               "flex_err": [(e.get("validation_status") or e.get("error_key")) if isinstance(e, dict) else str(e) for e in (ins.get("errors") or [])]}
        # flex partial candidates
        for k, v in fb.items():
            kk = int(k)
            base = FLEX.get(f"{n}|{kk}")
            if not base:
                continue
            hit_prods = [1.0] * 0
            for miss in itertools.combinations(range(n), kk):
                hp = 1.0
                for t in range(n):
                    if t not in miss:
                        hp *= ps[t]["m"]
                hit_prods.append(hp)
            rec[f"fb{k}_cand_all"] = round(base * prod, 4)
            rec[f"fb{k}_cand_meanhit"] = round(base * sum(hit_prods) / len(hit_prods), 4)
            rec[f"fb{k}_cand_table"] = base
            rec[f"fb{k}_cand_best"] = round(base * max(hit_prods), 4)
        cmp.append(rec)
        rows.append((RUN_ID, n, json.dumps(ps), prod, same, s_mult, f_mult, json.dumps(fb), json.dumps(rec["std_err"]), json.dumps(rec["flex_err"]),
                     json.dumps({k: j.get(k) for k in ("odds", "true_odds", "flex", "errors", "status", "promo", "resolved_selections")})))
        print(f"#{i} n={n}{' SG' if same else ''} prod m {prod:.4f} | std {s_mult} vs ours {pred_s:.3f} | flex {f_mult} vs ours {pred_f:.3f} | fallbacks {fb}"
              + (f" | std errors {rec['std_err']}" if rec["std_err"] else "") + (f" | flex errors {rec['flex_err']}" if rec["flex_err"] else ""), flush=True)
        time.sleep(0.6)

    with psycopg.connect(url) as conn:
        for rw in rows:
            conn.execute("""INSERT INTO nba_market.ud_payout_quotes (run_id, slate_date, n, picks, prod_modifier, same_game, standard_mult, flex_mult,
                            flex_fallbacks, standard_errors, flex_errors, raw) VALUES (%s, (now() AT TIME ZONE 'America/New_York')::date, %s, %s::jsonb, %s, %s,
                            %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)""", rw)
        conn.commit()
    print(f"stored {len(rows)} quotes in nba_market.ud_payout_quotes (run_id {RUN_ID})", flush=True)

    # 3. how good is each prediction?
    def ratios(key_a, key_p, filt=lambda r: True):
        xs = [r[key_a] / r[key_p] for r in cmp if r.get(key_a) and r.get(key_p) and filt(r)]
        return xs

    print("\nPREDICTION CHECK (Underdog's quote / ours):")
    for n in SIZES:
        for lab, a, p in (("standard", "std", "pred_std"), ("flex", "flex", "pred_flex")):
            xs = ratios(a, p, lambda r, n=n: r["n"] == n and not r["same_game"])
            sg = ratios(a, p, lambda r, n=n: r["n"] == n and r["same_game"])
            if xs or sg:
                f = lambda v: f"n {len(v)} median {median(v):.4f} min {min(v):.4f} max {max(v):.4f}" if v else "n 0"
                print(f"  {n}-pick {lab:<8}: different games {f(xs)} | same game {f(sg)}")
    for k in ("1", "2"):
        for cand in ("all", "meanhit", "table"):
            xs = [r["fallbacks"][k] / r[f"fb{k}_cand_{cand}"] for r in cmp if k in r["fallbacks"] and r.get(f"fb{k}_cand_{cand}")]
            if xs:
                print(f"  flex {k}-loss vs candidate '{cand}': n {len(xs)} median {median(xs):.4f} min {min(xs):.4f} max {max(xs):.4f}")
    exact = [r for r in cmp if r.get("std") and abs(r["std"] / r["pred_std"] - 1) < 0.005]
    print(f"\nstandard within 0.5% of ours: {len(exact)} of {sum(1 for r in cmp if r.get('std'))}")


if __name__ == "__main__":
    main()
