"""Cross-app cap production-path check (2026-11-17): runs slip_exposure_coordinator.cross_counts on a past day for every app and prints the
players at / over the configured cap. Read-only."""
import os, datetime as dt, psycopg
import slip_exposure_coordinator as X

def main():
    day = dt.date.fromisoformat(os.environ.get("EXP_DATE") or "2026-11-16")
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        cfg = X.load_cfg(conn, True)
        cross = cfg.get("cross") or {}
        print(f"XCAP|cfg cap={cross.get('cap')} key={cross.get('key')} sub={cross.get('substitute')} order={cross.get('order')} enabled={cross.get('enabled')}")
        for app in cross.get("order") or []:
            g = X.cross_counts(conn, day, app, cross)
            top = sorted(g.items(), key=lambda kv: -kv[1])[:4]
            print(f"XCAP|{day} before {app}: {len(g)} players on earlier apps, at/over cap {sum(1 for v in g.values() if v >= int(cross['cap']))}, top {top}")
        os.environ["EXP_DRY"] = "1"; os.environ["EXP_DATE"] = str(day)
        X.main()

if __name__ == "__main__":
    main()
