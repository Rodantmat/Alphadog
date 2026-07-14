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

Real, deliberate design fix (per explicit instruction): trains on MULTIPLE seasons
combined (2025 + 2026 by default), not a single frozen season. Season 2025 is complete
and static - retraining on it alone, on a schedule, would produce the exact same result
every single run (same data, same code, fixed random seed) - genuinely wasted compute.
2026 is the real, current, ongoing season that gains new real games every week, which is
what makes a weekly retraining cadence actually meaningful.

Real, deliberate design fix #2 (per deep research this session): added real, leak-safe
trailing recent-form features (last-10-game rates for hitters, last-5-appearance rates
for pitchers), computed with shift(1) BEFORE the rolling window so each row only ever
sees real games strictly before its own date - confirmed via real research this is the
correct, established way to avoid look-ahead bias in time-series feature engineering.
This is the single highest-value addition per the locked design (a player's own current
form is real, personalized signal no context feature can substitute for), and existing
hitter_metric_snapshots/pitcher_metric_snapshots tables could NOT be used for this - they
only hold today's current live snapshot, not a real historical time series of what the
rate was on each past date.
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
    df = pd.DataFrame(rows)
    if not df.empty:
        # Real derived outcome for the hits_runs_rbis combo prop - not a raw DB column,
        # computed directly from the three real component columns already pulled above.
        df["hits_runs_rbis"] = df["hits"].fillna(0) + df["runs"].fillna(0) + df["rbi"].fillna(0)
        df["season"] = season
    return df


def pull_pitcher_outcomes(d1, season):
    rows = d1.query_paginated(
        "STATS_PITCHER_DB",
        f"SELECT player_id, player_name, game_pk, game_date, team_id, opponent_team_id, is_home, "
        f"outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs, walks_allowed, "
        f"strikeouts, home_runs_allowed, pitches FROM pitcher_game_logs WHERE season={season}",
        order_by="game_pk, player_id",
    )
    df = pd.DataFrame(rows)
    if not df.empty:
        df["season"] = season
    return df


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


def add_hitter_recent_form(df, window=10):
    """Real, leak-safe trailing recent-form features. Sorts each player's real games
    chronologically, then uses shift(1) BEFORE the rolling window so the feature for any
    given row only ever reflects real games strictly before that row's own game_date -
    confirmed via real research this session as the correct way to avoid look-ahead bias.
    Applied across the full combined multi-season frame so form carries over the real
    2025->2026 season boundary (a player's true form doesn't reset at a calendar boundary).
    """
    df = df.sort_values(["player_id", "game_date", "game_pk"]).reset_index(drop=True)
    grp = df.groupby("player_id")

    for col in ["pa", "ab", "hits", "home_runs", "strikeouts", "walks", "total_bases"]:
        shifted = grp[col].shift(1)
        df[f"_roll_{col}"] = shifted.groupby(df["player_id"]).rolling(window, min_periods=1).sum().reset_index(level=0, drop=True)
        df[f"_roll_games"] = grp.cumcount()  # real games played strictly before this row, per player

    # Real, leak-safe rate features (guarded against div-by-zero with a real floor)
    roll_pa = df["_roll_pa"].clip(lower=1)
    roll_ab = df["_roll_ab"].clip(lower=1)
    df["recent_avg_10g"] = df["_roll_hits"] / roll_ab
    df["recent_hr_rate_10g"] = df["_roll_home_runs"] / roll_pa
    df["recent_k_rate_10g"] = df["_roll_strikeouts"] / roll_pa
    df["recent_bb_rate_10g"] = df["_roll_walks"] / roll_pa
    df["recent_tb_per_pa_10g"] = df["_roll_total_bases"] / roll_pa
    df["recent_games_sample"] = df["_roll_games"]

    df = df.drop(columns=[c for c in df.columns if c.startswith("_roll_")])
    return df


def add_pitcher_recent_form(df, window=5):
    """Real, leak-safe trailing recent-form features for pitchers - same shift(1)-before-
    rolling technique as hitters, windowed over the last 5 real appearances instead of 10
    games, since starters appear roughly once per 5 real days, not every game."""
    df = df.sort_values(["player_id", "game_date", "game_pk"]).reset_index(drop=True)
    grp = df.groupby("player_id")

    for col in ["batters_faced", "outs_recorded", "strikeouts", "walks_allowed", "hits_allowed", "earned_runs"]:
        shifted = grp[col].shift(1)
        df[f"_roll_{col}"] = shifted.groupby(df["player_id"]).rolling(window, min_periods=1).sum().reset_index(level=0, drop=True)
    df["_roll_appearances"] = grp.cumcount()

    roll_bf = df["_roll_batters_faced"].clip(lower=1)
    df["recent_k_rate_5g"] = df["_roll_strikeouts"] / roll_bf
    df["recent_bb_rate_5g"] = df["_roll_walks_allowed"] / roll_bf
    df["recent_hits_allowed_rate_5g"] = df["_roll_hits_allowed"] / roll_bf
    df["recent_era_proxy_5g"] = (df["_roll_earned_runs"] * 9) / df["_roll_outs_recorded"].clip(lower=1).mul(1 / 3)
    df["recent_appearances_sample"] = df["_roll_appearances"]

    df = df.drop(columns=[c for c in df.columns if c.startswith("_roll_")])
    return df


def build_hitter_training_table(d1, season, weather, umpire):
    outcomes = pull_hitter_outcomes(d1, season)
    if outcomes.empty:
        return outcomes
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


def build_pitcher_training_table(d1, season, weather, umpire):
    outcomes = pull_pitcher_outcomes(d1, season)
    if outcomes.empty:
        return outcomes
    _arsenal, defensive = pull_reference(d1, season)

    df = outcomes.merge(weather, on="game_pk", how="left")
    df = df.merge(umpire, on="game_pk", how="left")
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", default="2025,2026", help="Comma-separated list of seasons to combine")
    parser.add_argument("--out-dir", default="data")
    args = parser.parse_args()
    seasons = [int(s.strip()) for s in args.seasons.split(",") if s.strip()]

    import os
    import traceback
    debug_lines = []

    def dbg(line):
        print(line)
        debug_lines.append(line)

    try:
        d1 = D1Client()
        dbg(f"Pulling real weather/umpire context (spans all real historical dates)...")
        weather, umpire = pull_weather_umpire(d1)

        hitter_frames = []
        pitcher_frames = []
        for season in seasons:
            dbg(f"Pulling real hitter training data for season {season}...")
            hdf = build_hitter_training_table(d1, season, weather, umpire)
            dbg(f"  season {season}: {len(hdf)} real hitter rows")
            if not hdf.empty:
                hitter_frames.append(hdf)

            dbg(f"Pulling real pitcher training data for season {season}...")
            pdf = build_pitcher_training_table(d1, season, weather, umpire)
            dbg(f"  season {season}: {len(pdf)} real pitcher rows")
            if not pdf.empty:
                pitcher_frames.append(pdf)

        hitter_df = pd.concat(hitter_frames, ignore_index=True) if hitter_frames else pd.DataFrame()
        pitcher_df = pd.concat(pitcher_frames, ignore_index=True) if pitcher_frames else pd.DataFrame()
        dbg(f"Real combined hitter training rows (all seasons): {len(hitter_df)}")
        dbg(f"Real combined pitcher training rows (all seasons): {len(pitcher_df)}")

        dbg("Computing real, leak-safe trailing recent-form features...")
        if not hitter_df.empty:
            hitter_df = add_hitter_recent_form(hitter_df, window=10)
        if not pitcher_df.empty:
            pitcher_df = add_pitcher_recent_form(pitcher_df, window=5)
        dbg("Recent-form features computed.")

        os.makedirs(args.out_dir, exist_ok=True)
        hitter_path = f"{args.out_dir}/hitter_training_multiseason.csv"
        pitcher_path = f"{args.out_dir}/pitcher_training_multiseason.csv"
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
