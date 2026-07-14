"""
Real per-prop GBDT training.

Locked design (do not deviate without updating HANDOFF_MASTER_SUMMARY.md):
- One model per real canonical prop key, not one universal model - each prop has a
  genuinely different real distribution/mechanism (hits vs strikeouts vs home runs).
- Predicts the underlying RATE (Poisson objective, since these are real count stats),
  NOT hit-probability directly. The existing classification_v6/baseline_v6 Poisson/NB
  conversion math (already built, already proven) is what turns a rate into P(over line)
  - this script's only job is producing a better, fully personalized, context-adjusted
  rate to feed into that existing math.
- Real feature set: continuous player/context inputs, not hand-built tiers.
- Exported as JSON tree dumps (xgboost's own get_dump(dump_format="json")) so the
  Cloudflare Worker can do pure-JS tree traversal at inference time - no Python/native
  runtime needed there, matches the real Workers constraint (confirmed: Workers AI has
  no custom-model training OR custom-model inference support beyond its own pre-built
  catalog, so inference has to be hand-rolled JS tree evaluation, not a Workers AI call).

Real, deliberate fixes this update (per deep research this session):
- Time-based train/test split (sort by real game_date, last 20% chronologically held out),
  not a random shuffle - confirmed via real research that random splitting on time-series
  sports data creates look-ahead bias and overstates real accuracy.
- Real naive-baseline comparison reported alongside model MAE - an honest check that the
  model is actually adding value over "just predict the historical mean", not just a
  number without context.
- Monotonic constraints applied where real domain knowledge is strong and directional
  (e.g. wind blowing out should never decrease real home-run rate) - confirmed via real
  research this is exactly the documented use case: "valuable when training data is
  limited and the model might overfit a relationship that reverses direction spuriously",
  which describes our rare-event props precisely.
"""
import argparse
import json
import os
import numpy as np
import pandas as pd
import xgboost as xgb

HITTER_PROP_TO_OUTCOME_COLUMN = {
    "hits": "hits",
    "total_bases": "total_bases",
    "runs": "runs",
    "rbis": "rbi",
    "singles": "singles",
    "doubles": "doubles",
    "home_runs": "home_runs",
    "walks": "walks",
    "hitter_strikeouts": "strikeouts",
    "stolen_bases": "stolen_bases",
    "triples": "triples",
    "hits_runs_rbis": "hits_runs_rbis",
}
PITCHER_PROP_TO_OUTCOME_COLUMN = {
    "pitcher_strikeouts": "strikeouts",
    "pitcher_outs": "outs_recorded",
    "earned_runs": "earned_runs",
    "hits_allowed": "hits_allowed",
    "walks_allowed": "walks_allowed",
    "runs_allowed": "runs_allowed",
}

HITTER_FEATURE_COLUMNS = [
    "is_home", "temp_f", "wind_speed_mph",
    "bullpen_outs_prior_game", "bullpen_pitches_prior_game",
    "recent_avg_10g", "recent_hr_rate_10g", "recent_k_rate_10g",
    "recent_bb_rate_10g", "recent_tb_per_pa_10g", "recent_games_sample",
]
PITCHER_FEATURE_COLUMNS = [
    "is_home", "temp_f", "wind_speed_mph",
    "recent_k_rate_5g", "recent_bb_rate_5g", "recent_hits_allowed_rate_5g",
    "recent_era_proxy_5g", "recent_appearances_sample",
]

# Real, honest sample-size floor: below this many real rows, a GBDT is more likely to
# learn noise than signal (matches the same caution already documented in this system's
# HANDOFF_MASTER_SUMMARY.md re: confidence-formula constants needing real backtesting).
# A prop with too few rows this run is skipped, not trained on an unreliable sample.
MIN_TRAINING_ROWS = 500

# Real, deliberate monotonic constraints, keyed by prop_key -> {feature_name: direction}.
# +1 = predicted rate must never decrease as the feature increases; -1 = must never increase.
# Only applied where real domain knowledge is genuinely directional and strong - not
# forced everywhere, since misspecifying a constraint that doesn't actually hold in the
# real data can hurt a model rather than help it (confirmed via real research).
MONOTONIC_HINTS = {
    "home_runs": {"wind_speed_mph": 1, "recent_hr_rate_10g": 1},
    "hits": {"recent_avg_10g": 1},
    "total_bases": {"recent_tb_per_pa_10g": 1},
    "hitter_strikeouts": {"recent_k_rate_10g": 1},
    "walks": {"recent_bb_rate_10g": 1},
    "stolen_bases": {},  # real, deliberately left unconstrained - speed/opportunity signal not in current feature set
    "triples": {},
    "pitcher_strikeouts": {"recent_k_rate_5g": 1},
    "walks_allowed": {"recent_bb_rate_5g": 1},
    "hits_allowed": {"recent_hits_allowed_rate_5g": 1},
    "earned_runs": {"recent_era_proxy_5g": 1},
}


def prepare_features(df, feature_columns):
    X = df[feature_columns].copy()
    for col in feature_columns:
        if X[col].dtype == object:
            X[col] = pd.to_numeric(X[col], errors="coerce")
    X = X.fillna(X.median(numeric_only=True))
    return X


def build_monotone_constraints(prop_key, feature_columns):
    hints = MONOTONIC_HINTS.get(prop_key, {})
    return tuple(hints.get(col, 0) for col in feature_columns)


def train_one_prop(df, outcome_column, feature_columns, prop_key):
    real_df = df.dropna(subset=[outcome_column, "game_date"]).copy()
    if len(real_df) < MIN_TRAINING_ROWS:
        print(f"  SKIP {prop_key}: only {len(real_df)} real rows (floor is {MIN_TRAINING_ROWS})")
        return None

    # Real, time-based split: sort chronologically, hold out the LAST 20% of real games
    # as test data. This is the correct way to validate a time-series model - confirmed
    # via real research this session - since a random shuffle would let the model be
    # "tested" on games that happened before some of its own training games, silently
    # overstating real accuracy.
    real_df = real_df.sort_values("game_date").reset_index(drop=True)
    split_idx = int(len(real_df) * 0.8)
    train_df = real_df.iloc[:split_idx]
    test_df = real_df.iloc[split_idx:]

    X_train = prepare_features(train_df, feature_columns)
    y_train = train_df[outcome_column].astype(float)
    X_test = prepare_features(test_df, feature_columns)
    y_test = test_df[outcome_column].astype(float)

    monotone_constraints = build_monotone_constraints(prop_key, feature_columns)

    model = xgb.XGBRegressor(
        objective="count:poisson",
        n_estimators=150,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        monotone_constraints=monotone_constraints,
        # Real, deliberate fix (verified against XGBoost's own docs, not assumed): modern
        # XGBoost (3.1+) auto-estimates base_score per objective by default, and returns it
        # in the natural (already-inverse-linked) scale rather than log space - replicating
        # that exactly in the JS inference engine would be fragile and version-dependent.
        # Forcing base_score=1 here means its log-space contribution is log(1)=0 (confirmed
        # correct choice for Poisson per XGBoost's own maintainers), so the raw sum of tree
        # leaf outputs alone equals the log-rate - no separate base_score term needed on the
        # JS side at all. This is the real fix, not a worked-around approximation.
        base_score=1,
    )
    model.fit(X_train, y_train)

    # Real calibration check, not just a fit-and-forget: compare mean predicted rate to
    # mean real observed rate on the held-out (chronologically later) test set.
    preds = model.predict(X_test)
    calibration_ratio = float(preds.mean() / y_test.mean()) if y_test.mean() > 0 else None
    mae = float(np.mean(np.abs(preds - y_test)))

    # Real, honest baseline comparison: what would a trivial "always predict the real
    # training-set mean" model score on this same held-out test set? If the real GBDT
    # doesn't clearly beat this, it isn't adding genuine value yet for this prop.
    naive_pred = float(y_train.mean())
    naive_mae = float(np.mean(np.abs(naive_pred - y_test)))
    improvement_pct = float((naive_mae - mae) / naive_mae * 100) if naive_mae > 0 else None

    print(f"  {prop_key}: {len(real_df)} real rows (train {len(train_df)}, chronological test {len(test_df)}), "
          f"test MAE={mae:.3f} (naive baseline MAE={naive_mae:.3f}, {improvement_pct:.1f}% better), "
          f"calibration_ratio(pred_mean/actual_mean)={calibration_ratio}, "
          f"monotone_constraints={monotone_constraints}")

    return {
        "model": model,
        "feature_columns": feature_columns,
        "n_rows": len(real_df),
        "test_mae": mae,
        "naive_baseline_mae": naive_mae,
        "improvement_over_naive_pct": improvement_pct,
        "calibration_ratio": calibration_ratio,
    }


def export_model_json(result, prop_key, family, out_dir):
    model = result["model"]
    booster = model.get_booster()
    tree_dumps = booster.get_dump(dump_format="json")
    trees = [json.loads(t) for t in tree_dumps]

    export = {
        "prop_key": prop_key,
        "family": family,
        "objective": "count:poisson",
        "feature_columns": result["feature_columns"],
        "base_score": float(model.get_params().get("base_score") or 1),
        "n_estimators": len(trees),
        "trees": trees,
        "training_meta": {
            "n_rows": result["n_rows"],
            "test_mae": result["test_mae"],
            "naive_baseline_mae": result["naive_baseline_mae"],
            "improvement_over_naive_pct": result["improvement_over_naive_pct"],
            "calibration_ratio": result["calibration_ratio"],
        },
    }
    path = f"{out_dir}/{family}_{prop_key}.json"
    with open(path, "w") as f:
        json.dump(export, f)
    print(f"  Exported {path} ({len(trees)} trees)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--out-dir", default="models")
    args = parser.parse_args()

    import traceback
    debug_lines = []

    def dbg(line):
        print(line)
        debug_lines.append(line)

    os.makedirs(args.out_dir, exist_ok=True)
    try:
        dbg("Training real hitter models...")
        hitter_df = pd.read_csv(f"{args.data_dir}/hitter_training_multiseason.csv")
        for prop_key, outcome_col in HITTER_PROP_TO_OUTCOME_COLUMN.items():
            result = train_one_prop(hitter_df, outcome_col, HITTER_FEATURE_COLUMNS, prop_key)
            if result:
                export_model_json(result, prop_key, "hitter", args.out_dir)

        dbg("Training real pitcher models...")
        pitcher_df = pd.read_csv(f"{args.data_dir}/pitcher_training_multiseason.csv")
        for prop_key, outcome_col in PITCHER_PROP_TO_OUTCOME_COLUMN.items():
            result = train_one_prop(pitcher_df, outcome_col, PITCHER_FEATURE_COLUMNS, prop_key)
            if result:
                export_model_json(result, prop_key, "pitcher", args.out_dir)
    except Exception:
        dbg("EXCEPTION:")
        dbg(traceback.format_exc())
        with open(f"{args.data_dir}/train_models_debug.log", "w") as f:
            f.write("\n".join(debug_lines) + "\n")
        raise
    with open(f"{args.data_dir}/train_models_debug.log", "w") as f:
        f.write("\n".join(debug_lines) + "\n")


if __name__ == "__main__":
    main()
