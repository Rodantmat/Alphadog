#!/usr/bin/env python3
"""Read-only. XD| dump of the ROI-app live rules (roi_app_live_slip_engine.RULES) replayed on the review harness (research_full_review.build_days):
the slips + next-ranked candidates per slate for the cross-app exposure simulation. Env: RV_APP=sleeper|fliff, DATABASE_URL, CERT_DUMP=1."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["CERT_DUMP"] = "1"
import research_full_review as RV          # noqa: E402
import research_cert_common as CC          # noqa: E402

M = RV.M
RULES = {
    "sleeper": {"S_C_5flex_U20": ("score_cert", "main", "none", "under", 20, 5, "flex"), "S_B_5flex_R5": ("score_roi", "all", "5pct", "both", 15, 5, "flex"),
                "S_F_3flex_R10": ("score_roi", "main", "none", "both", 10, 3, "flex"), "S_D_6flex_U30": ("hp", "main", "none", "under", 30, 6, "flex")},
    "fliff": {"F_A_5max_R15": ("score_roi", "main", "none", "both", 15, 5, "max"), "F_C_5max_U20": ("score_cert", "main", "none", "under", 20, 5, "max"),
              "F_E_3max_P10": ("hp", "main", "none", "both", 10, 3, "max")},
}
KINDS = {"main": {"main"}, "all": {"main", "alt"}}
ROIMIN = {"none": None, "5pct": .05}


def main():
    days = RV.build_days()
    for season in sorted(days):
        for d, df in days[season]:
            for name, (key, kinds, roimin, side, N, k, mode) in RULES[RV.APP].items():
                x = df[df["kind"].isin(KINDS[kinds])]
                if ROIMIN[roimin] is not None:
                    x = x[x["roi"] > ROIMIN[roimin]]
                if side == "under":
                    x = x[~x["over"].astype(bool)]
                x = x.sort_values(key, ascending=False).head(30)
                ln = x["line"].values if "line" in x.columns else [float("nan")] * len(x)
                legs = list(zip(x["player"].values, x["event_id"].values, x["hit"].values, x["m"].values, x["side"].values, x["prop"].values, ln))
                for s in M.groups(legs, N, k):
                    CC.xdump(RV.APP, name, season, d, mode, M.pay(s, mode) - 1.0, s, legs)
    print("done", flush=True)


if __name__ == "__main__":
    main()
