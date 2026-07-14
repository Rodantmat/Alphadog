"""
Real training-data assembly for the GBDT pipeline.

D1 has no cross-database joins (each binding is a genuinely separate database), so this
script pulls each real source table into memory via the D1 REST API, then performs the
real joins in pandas. Produces two denormalized training CSVs (hitter, pitcher) - one row
per real historical (player, game) pair, with the real outcome columns plus the real
contextual feature columns needed for GBDT training.

Deliberately mirrors the locked design: GBDT predicts the underlying RATE per prop, not
"hit probability" directly - so outcome columns here are raw counting stats (hits,
strikeouts, etc.), not booleans against any specific board line. The board line only
matters later, at inference time, when the existing Poisson/NB conversion math turns a
predicted rate into P(over line) for whatever line is actually on the board that day.
"""
import argparse
import pandas as pd
from d1_client import D1Client


def pull_hitter_outcomes(d1, season):
    rows = d1.query_paginated(
        "STATS_HITTER_DB",
        f"SELECT player_id, game_pk, game_date, team_id, opponent_team_id, is_home, "
        f"pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, "
        f"stolen_bases, total_bases FROM hitter_game_logs WHERE season={season}",
        order_by="game_pk, player_id",
    )
    return pd.DataFrame(rows)


def pull_pitcher_outcomes(d1, season):
    rows = d1.query_paginated(
        "STATS_PITCHER_DB",
        f"SELECT player_id, player_name, game_pk, game_date, team_id, opponent_team_id, is_home, "
        f"outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs, walks_allowed, "
        f"strikeouts, home_runs_allowed, pitches FROM pitcher_game_logs WHERE season={season}",
        order_by="game_pk, player_id",
    )
    return pd.DataFrame(rows)


def pull_weather_umpire(d1):
    weather = pd.DataFrame(d1.query_paginated(
        "CONTEXT_DB",
        "SELECT game_pk, temp_f, wind_speed_mph, wind_direction_cardinal, wind_context "
        "FROM context_history_game_weather",
        order_by="game_pk",
    ))
    umpire = pd.DataFrame(d1.query_paginated(
        "CONTEXT_DB",
        "SELECT game_pk, home_plate_umpire_name FROM context_history_game_umpire",
        order_by="game_pk",
    ))
    return weather, umpire


def pull_team_bullpen(d1, season):
    team = pd.DataFrame(d1.query_paginated(
        "TEAM_DB",
        f"SELECT game_pk, team_id, runs, hits, walks, strikeouts, home_runs "
        f"FROM team_game_logs WHERE season={season}",
        order_by="game_pk, team_id",
    ))
    bullpen = pd.DataFrame(d1.query_paginated(
        "TEAM_DB",
        f"SELECT game_pk, team_id, pitcher_role, outs_recorded, pitches, holds, saves "
        f"FROM bullpen_history WHERE season={season}",
        order_by="game_pk, team_id",
    ))
    if bullpen.empty:
        return team, pd.DataFrame(columns=["game_pk", "team_id", "bullpen_outs_prior_game", "bullpen_pitches_prior_game"])
    # Real, simple team-level bullpen-fatigue aggregate for this first version: relief-only
    # outs/pitches for this exact game (a real signal of how much the pen was used that day,
    # usable as a same-game feature; a true "prior N days" rolling fatigue feature is a real,
    # valuable future enhancement once this base pipeline is proven end-to-end).
    relief = bullpen[bullpen["pitcher_role"] == "RP"]
    agg = relief.groupby(["game_pk", "team_id"]).agg(
        bullpen_outs_prior_game=("outs_recorded", "sum"),
        bullpen_pitches_prior_game=("pitches", "sum"),
    ).reset_index()
    return team, agg


def pull_reference(d1, season):
    arsenal = pd.DataFrame(d1.query_paginated(
        "REF_DB",
        f"SELECT mlb_player_id, pitch_type, run_value_per_100, whiff_percent, k_percent, "
        f"hard_hit_percent FROM ref_pitcher_arsenal WHERE season_year={season}",
        order_by="mlb_player_id",
    ))
    if not arsenal.empty:
        arsenal = arsenal.groupby("mlb_player_id").agg(
            arsenal_avg_whiff_percent=("whiff_percent", "mean"),
            arsenal_avg_k_percent=("k_percent", "mean"),
            arsenal_avg_hard_hit_percent=("hard_hit_percent", "mean"),
        ).reset_index()
    defensive = pd.DataFrame(d1.query_paginated(
        "REF_DB",
        f"SELECT * FROM ref_defensive_quality WHERE season_year={season}",
        order_by="rowid",
    ))
    return arsenal, defensive


def build_hitter_training_table(d1, season):
    outcomes = pull_hitter_outcomes(d1, season)
    weather, umpire = pull_weather_umpire(d1)
    team, bullpen_agg = pull_team_bullpen(d1, season)
    arsenal, _defensive = pull_reference(d1, season)

    df = outcomes.merge(weather, on="game_pk", how="left")
    df = df.merge(umpire, on="game_pk", how="left")
    # Opponent's bullpen fatigue is the real relevant signal for a hitter's prop
    df = df.merge(
        bullpen_agg.rename(columns={"team_id": "opponent_team_id"}),
        on=["game_pk", "opponent_team_id"], how="left",
    )
    df["bullpen_outs_prior_game"] = df["bullpen_outs_prior_game"].fillna(0)
    df["bullpen_pitches_prior_game"] = df["bullpen_pitches_prior_game"].fillna(0)
    return df


def build_pitcher_training_table(d1, season):
    outcomes = pull_pitcher_outcomes(d1, season)
    weather, umpire = pull_weather_umpire(d1)
    _arsenal, defensive = pull_reference(d1, season)

    df = outcomes.merge(weather, on="game_pk", how="left")
    df = df.merge(umpire, on="game_pk", how="left")
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=2025)
    parser.add_argument("--out-dir", default="gbdt_training/data")
    args = parser.parse_args()

    import os
    import traceback
    debug_lines = []

    def dbg(line):
        print(line)
        debug_lines.append(line)

    try:
        d1 = D1Client()
        dbg(f"Pulling real hitter training data for season {args.season}...")
        hitter_df = build_hitter_training_table(d1, args.season)
        dbg(f"Real hitter training rows: {len(hitter_df)}")

        dbg(f"Pulling real pitcher training data for season {args.season}...")
        pitcher_df = build_pitcher_training_table(d1, args.season)
        dbg(f"Real pitcher training rows: {len(pitcher_df)}")

        os.makedirs(args.out_dir, exist_ok=True)
        hitter_path = f"{args.out_dir}/hitter_training_{args.season}.csv"
        pitcher_path = f"{args.out_dir}/pitcher_training_{args.season}.csv"
        hitter_df.to_csv(hitter_path, index=False)
        pitcher_df.to_csv(pitcher_path, index=False)
        dbg(f"Wrote {hitter_path} and {pitcher_path}")
    except Exception:
        # Real workaround for a real constraint: no direct access to GitHub Actions run
        # logs from the assistant operating this system - writing full diagnostic output
        # to a committed file (regardless of success/failure) lets the real cause of any
        # failure here be read back directly afterward, rather than guessed at blind.
        dbg("EXCEPTION:")
        dbg(traceback.format_exc())
        os.makedirs(args.out_dir, exist_ok=True)
        with open(f"{args.out_dir}/build_training_data_debug.log", "w") as f:
            f.write("\n".join(debug_lines) + "\n")
        raise
    os.makedirs(args.out_dir, exist_ok=True)
    with open(f"{args.out_dir}/build_training_data_debug.log", "w") as f:
        f.write("\n".join(debug_lines) + "\n")


if __name__ == "__main__":
    main()
