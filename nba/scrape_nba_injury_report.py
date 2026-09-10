#!/usr/bin/env python3
"""
Official NBA injury report ingestion (enrichment factor A1 + baseline day-before report).

Source: https://ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MMAM.pdf  (AM/PM), several
snapshots per day (observed 12:30 PM, 01:00, 01:30, 02:30, 03:30, 04:00, 05:30, 06:45, 07:45 PM ...). Each snapshot lists
today's AND tomorrow's games (the day-before report is inside it), per team, per player: status (Out / Doubtful /
Questionable / Probable / Available) and a reason ("Injury/Illness - Right Ankle; Sprain", "Rest", "Injury Management",
"G League - Two-Way", "Suspension", "Personal Reasons", ...). Teams that have not reported show "NOT YET SUBMITTED".

Modes:
  daily     - probe all snapshot slots for today (and yesterday) and keep every snapshot found; write
              nba/data/nba_injury_report_current.json (all rows, with snapshot timestamps) - the latest snapshot per
              (game_date, team) is what the baseline builder and the enrichment run use.
  backfill  - INJURY_FROM=YYYY-MM-DD INJURY_TO=YYYY-MM-DD INJURY_SEASON_SLUG=2024_25: enumerate every date x slot, keep
              every snapshot found; write nba/data/nba_injury_report_<slug>.json (statuses AS KNOWN, with timestamps)
              for the enrichment backtest and the P(plays | status) priors. Resumable (days_done in meta).
Parsing is stateful (date -> time -> matchup -> team -> player rows; wrapped reason lines are joined, also across page
breaks). Self-tested 2026-09-09 on the real 2026-04-08 02:30 PM report. Reason class feeds injury_type_class.
"""
import io
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

DATA = Path("nba/data")
BASE = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_{d}_{h:02d}_{m:02d}{ap}.pdf"
SLOTS = [(h, m) for h in range(9, 24) for m in (0, 15, 30, 45)]   # ET slots probed (24h clock); 404s are cheap
STATUSES = ["Out", "Doubtful", "Questionable", "Probable", "Available"]
TEAMS = ["Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls", "Cleveland Cavaliers",
         "Dallas Mavericks", "Denver Nuggets", "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
         "LA Clippers", "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat", "Milwaukee Bucks",
         "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks", "Oklahoma City Thunder", "Orlando Magic",
         "Philadelphia 76ers", "Phoenix Suns", "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs",
         "Toronto Raptors", "Utah Jazz", "Washington Wizards"]
_TEAM_RE = re.compile("^(" + "|".join(re.escape(t) + "|" + re.escape(t.replace(" ", "")) for t in sorted(TEAMS, key=len, reverse=True)) + r")\b\s*(.*)$")
_DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})\s*(.*)$")
_TIME_RE = re.compile(r"^(\d{2}:\d{2})\s*\(ET\)\s*(.*)$")
_MATCH_RE = re.compile(r"^([A-Z]{3}@[A-Z]{3})\s*(.*)$")
_STATUS_RE = re.compile(r"^(.*?),\s*(.*?)\s+(Out|Doubtful|Questionable|Probable|Available)\b\s*(.*)$")
_HDR_RE = re.compile(r"^(Injury\s*Report:.*|Page\s*\d+\s*of\s*\d+|Game\s*Date\s*Game\s*Time\s*Matchup\s*Team\s*Player\s*Name\s*Current\s*Status\s*Reason)$")
_TEAM_CANON = {t.replace(" ", ""): t for t in TEAMS}


def _split_camel(s):
    """Recover spaces pdfplumber may drop inside cells: 'RightKnee;Surgery' -> 'Right Knee; Surgery'; 'NOTYETSUBMITTED' kept."""
    s = re.sub(r"([a-z\.\)])([A-Z])", r"\1 \2", s); s = re.sub(r";(?=\S)", "; ", s); s = re.sub(r"-(?=[A-Z])", "- ", s)
    return re.sub(r"\s+", " ", s).strip()


def reason_class(reason):
    r = (reason or "").lower(); rz = re.sub(r"[\s\-]", "", r)   # rz: space/hyphen-insensitive (pdf extraction may drop them)
    if not r or r in ("-",): return "none"
    if "rest" in r and "injury" not in r: return "rest"
    if "injurymanagement" in rz or "injurymaintenance" in rz or "loadmanagement" in rz: return "management"
    if "gleague" in rz or "twoway" in rz: return "gleague_two_way"
    if "suspension" in r: return "suspension"
    if "personal" in r or "bereave" in r: return "personal"
    if "illness" in r and not re.search(r"ankle|knee|hip|back|hamstring|calf|groin|quad|shoulder|wrist|hand|finger|toe|foot|achilles|concussion|thigh|elbow|rib", r): return "illness"
    if "concussion" in r: return "concussion"
    if re.search(r"hamstring|calf|groin|quad|thigh|adductor|hip flexor|soleus", r): return "soft_tissue"
    if re.search(r"hand|wrist|finger|thumb", r): return "hand_wrist"
    if re.search(r"back|spine|lumbar", r): return "back"
    if re.search(r"ankle|knee|hip|shoulder|elbow|toe|foot|achilles|acl|mcl|meniscus", r): return "joint"
    if "recondition" in r or "return to competition" in r: return "reconditioning"
    if "surgery" in r: return "surgery"
    return "other"


def parse_report(text, snapshot_ts):
    rows, cur = [], {"game_date": None, "game_time": None, "matchup": None, "team": None}
    last = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or _HDR_RE.match(line): continue
        m = _DATE_RE.match(line)
        if m:
            cur["game_date"] = datetime.strptime(m.group(1), "%m/%d/%Y").date().isoformat(); line = m.group(2).strip(); last = None
            if not line: continue
        m = _TIME_RE.match(line)
        if m:
            cur["game_time"] = m.group(1); line = m.group(2).strip(); last = None
            if not line: continue
        m = _MATCH_RE.match(line)
        if m:
            cur["matchup"] = m.group(1); line = m.group(2).strip(); last = None
            if not line: continue
        m = _TEAM_RE.match(line)
        if m:
            cur["team"] = _TEAM_CANON.get(m.group(1), m.group(1)); line = m.group(2).strip(); last = None
            if not line: continue
        if line.replace(" ", "").startswith("NOTYETSUBMITTED"):
            rows.append({**cur, "player_name": None, "status": "NOT_YET_SUBMITTED", "reason": None, "reason_class": "not_submitted", "snapshot_ts": snapshot_ts}); last = None; continue
        m = _STATUS_RE.match(line)
        if m and cur["team"]:
            row = {**cur, "player_name": f"{_split_camel(m.group(1))}, {_split_camel(m.group(2))}", "status": m.group(3), "reason": _split_camel(m.group(4)), "reason_class": None, "snapshot_ts": snapshot_ts}
            rows.append(row); last = row; continue
        if last is not None:
            last["reason"] = (last["reason"] + " " + _split_camel(line)).strip()
    for r in rows:
        if r["status"] != "NOT_YET_SUBMITTED": r["reason_class"] = reason_class(r["reason"])
    return rows


def extract_text(pdf_bytes):
    import pdfplumber
    out = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages: out.append(page.extract_text(x_tolerance=1.5) or "")
    return "\n".join(out)


def fetch_snapshot(session, d, h, m):
    ap = "AM" if h < 12 else "PM"; h12 = h if h <= 12 else h - 12
    if h12 == 0: h12 = 12
    url = BASE.format(d=d.isoformat(), h=h12, m=m, ap=ap)
    try:
        r = session.get(url, timeout=30, impersonate="chrome124")
        if r.status_code != 200 or not r.content.startswith(b"%PDF"): return None
        return url, r.content
    except Exception:  # noqa: BLE001
        return None


def fetch_snapshot_hourly(session, d, h):
    """Legacy filename (observed before ~2025-12-22): Injury-Report_YYYY-MM-DD_HHAM.pdf (no minutes)."""
    ap = "AM" if h < 12 else "PM"; h12 = h if h <= 12 else h - 12
    if h12 == 0: h12 = 12
    url = f"https://ak-static.cms.nba.com/referee/injury/Injury-Report_{d.isoformat()}_{h12:02d}{ap}.pdf"
    try:
        r = session.get(url, timeout=30, impersonate="chrome124")
        if r.status_code != 200 or not r.content.startswith(b"%PDF"): return None
        return url, r.content
    except Exception:  # noqa: BLE001
        return None


_HDR_TS = re.compile(r"Injury\s*Report:\s*(\d{2})/(\d{2})/(\d{2})\s*(\d{2}):(\d{2})\s*(AM|PM)")


def header_ts(text):
    """The document's own publish time ('Injury Report: 11/24/25 12:30 PM') -> ISO ET; None if absent."""
    m = _HDR_TS.search(text or "")
    if not m: return None
    mo, dd, yy, hh, mm, ap = m.groups(); hh = int(hh) % 12 + (12 if ap == "PM" else 0)
    return f"20{yy}-{mo}-{dd}T{hh:02d}:{mm}:00{'-05:00'}"


def scan_day(session, d, slots=SLOTS):
    """All snapshots for a day across BOTH filename patterns; consecutive identical documents are dropped."""
    import hashlib
    found, seen = [], set()
    cands = [(h, m, fetch_snapshot(session, d, h, m)) for h, m in slots]
    cands += [(h, None, fetch_snapshot_hourly(session, d, h)) for h in range(0, 24)]
    for h, m, res in cands:
        if not res: continue
        url, content = res
        hsh = hashlib.md5(content).hexdigest()
        if hsh in seen: continue
        seen.add(hsh)
        found.append((f"{d.isoformat()}T{h:02d}:{(m or 0):02d}:00-05:00", url, content))
    return found


def main():
    from curl_cffi import requests
    mode = os.environ.get("INJURY_MODE", "daily")
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    session = requests.Session(proxies={"https": proxy_url, "http": proxy_url} if proxy_url else None)
    if mode == "probe":
        # DIAGNOSTIC: what does the CDN return to the runner for a URL known to exist (with and without the proxy)?
        url = os.environ.get("INJURY_PROBE_URL", "https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-04-08_02_30PM.pdf")
        for label, sess in (("proxy" if proxy_url else "direct", session), ("direct", requests.Session())):
            try:
                r = sess.get(url, timeout=30, impersonate="chrome124")
                print(f"[{label}] status={r.status_code} len={len(r.content)} ctype={r.headers.get('content-type')} head={r.content[:12]!r}")
                for h in ("server", "x-cache", "content-encoding", "location"):
                    if h in r.headers: print(f"   {h}: {r.headers[h]}")
                if r.status_code == 200 and label == "direct":
                    txt = extract_text(r.content); lines = [ln for ln in txt.splitlines() if ln.strip()]
                    print(f"   pdfplumber: {len(txt)} chars, {len(lines)} lines; first 25 lines:"); [print("   |", ln[:140]) for ln in lines[:25]]
                    rows = parse_report(txt, "probe"); print(f"   parsed rows: {len(rows)}")
                    try:
                        import pdfplumber, io as _io
                        with pdfplumber.open(_io.BytesIO(r.content)) as pdf:
                            tb = pdf.pages[0].extract_table(); print(f"   extract_table page1: {len(tb) if tb else 0} rows; first: {tb[:3] if tb else None}")
                    except Exception as e2:  # noqa: BLE001
                        print("   extract_table failed:", e2)
            except Exception as exc:  # noqa: BLE001
                print(f"[{label}] EXC {type(exc).__name__}: {exc}")
        return
    if mode == "daily":
        days = [date.today() - timedelta(days=1), date.today()]
        out = []
        for d in days:
            for ts, url, content in scan_day(session, d):
                txt = extract_text(content); ts2 = header_ts(txt) or ts
                out += [{**r, "source_url": url} for r in parse_report(txt, ts2)]
                time.sleep(0.3)
        (DATA / "nba_injury_report_current.json").write_text(json.dumps({"meta": {"fetched_at": datetime.utcnow().isoformat() + "Z", "days": [d.isoformat() for d in days], "rows": len(out), "snapshots": len({r["snapshot_ts"] for r in out})}, "rows": out}))
        print("daily:", len(out), "rows,", len({r["snapshot_ts"] for r in out}), "snapshots")
    else:
        # BACKFILL -> MONTHLY SHARDS nba_injury_report_<slug>_<YYYY-MM>.json (a season of all snapshots is ~150+ MB as one
        # file; GitHub rejects >100 MB) + index file nba_injury_report_<slug>_index.json (days_done). Resumable, chunked.
        d0 = date.fromisoformat(os.environ["INJURY_FROM"]); d1 = date.fromisoformat(os.environ["INJURY_TO"])
        slug = os.environ.get("INJURY_SEASON_SLUG", f"{d0.year}_{str(d1.year)[-2:]}")
        ipath = DATA / f"nba_injury_report_{slug}_index.json"
        legacy = DATA / f"nba_injury_report_{slug}.json"
        index = json.loads(ipath.read_text()) if ipath.exists() else {"days_done": [], "rows": 0}
        shards = {}
        for p in DATA.glob(f"nba_injury_report_{slug}_20*.json"):
            if p.name.endswith("_index.json"): continue
            shards[p.name.rsplit("_", 1)[1][:7]] = json.loads(p.read_text())["rows"]
        if legacy.exists() and not shards:
            # migrate the single-file state (2026-09-10) into shards; days with zero rows are redone (old URL pattern)
            old = json.loads(legacy.read_text())
            for r in old.get("rows", []): shards.setdefault(r["snapshot_ts"][:7], []).append(r)
            days_with_rows = {r["snapshot_ts"][:10] for r in old.get("rows", [])}
            index["days_done"] = sorted(days_with_rows); legacy.unlink()
        done_days = set(index.get("days_done", [])); d = d0
        max_days = int(os.environ.get("INJURY_MAX_DAYS", "100")); n_new = 0
        def _flush():
            for ym, rows_ in shards.items():
                (DATA / f"nba_injury_report_{slug}_{ym}.json").write_text(json.dumps({"rows": rows_}, separators=(",", ":")))
            index.update({"days_done": sorted(done_days), "rows": sum(len(v) for v in shards.values()), "shards": sorted(shards), "updated_at": datetime.utcnow().isoformat() + "Z"})
            ipath.write_text(json.dumps(index))
        while d <= d1 and n_new < max_days:
            if d.isoformat() not in done_days:
                snaps = scan_day(session, d)
                for ts, url, content in snaps:
                    txt = extract_text(content); ts2 = header_ts(txt) or ts
                    for r in parse_report(txt, ts2):
                        shards.setdefault(ts2[:7], []).append({**r, "source_url": url})
                done_days.add(d.isoformat()); n_new += 1; print(d, len(snaps), "snapshots")
                if n_new % 5 == 0: _flush()
                time.sleep(0.5)
            d += timedelta(days=1)
        _flush()
        print("backfill:", index["rows"], "rows,", len(done_days), "days, shards:", index.get("shards"))


if __name__ == "__main__":
    if os.environ.get("INJURY_SELFTEST"):
        rows = parse_report(Path(os.environ["INJURY_SELFTEST"]).read_text(), "2026-04-08T14:30:00-05:00")
        from collections import Counter
        print(len(rows), "rows"); print(Counter(r["status"] for r in rows)); print(Counter(r["reason_class"] for r in rows)); sys.exit(0)
    main()
