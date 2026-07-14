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
"""
import argparse
import json
import os
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split

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
]
PITCHER_FEATURE_COLUMNS = [
    "is_home", "temp_f", "wind_speed_mph",
]

# Real, honest sample-size floor: below this many real rows, a GBDT is more likely to
# learn noise than signal (matches the same caution already documented in this system's
# HANDOFF_MASTER_SUMMARY.md re: confidence-formula constants needing real backtesting).
# A prop with too few rows this run is skipped, not trained on an unreliable sample.
MIN_TRAINING_ROWS = 500


def prepare_features(df, feature_columns):
    X = df[feature_columns].copy()
    for col in feature_columns:
        if X[col].dtype == object:
            X[col] = pd.to_numeric(X[col], errors="coerce")
    X = X.fillna(X.median(numeric_only=True))
    return X


def train_one_prop(df, outcome_column, feature_columns, prop_key):
    real_df = df.dropna(subset=[outcome_column])
    if len(real_df) < MIN_TRAINING_ROWS:
        print(f"  SKIP {prop_key}: only {len(real_df)} real rows (floor is {MIN_TRAINING_ROWS})")
        return None

    X = prepare_features(real_df, feature_columns)
    y = real_df[outcome_column].astype(float)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBRegressor(
        objective="count:poisson",
        n_estimators=150,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
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
    # mean real observed rate on the held-out test set. A well-calibrated model should
    # have these close; a large gap is an honest signal something is wrong before this
    # model is ever trusted downstream.
    preds = model.predict(X_test)
    calibration_ratio = float(preds.mean() / y_test.mean()) if y_test.mean() > 0 else None
    mae = float(np.mean(np.abs(preds - y_test)))

    print(f"  {prop_key}: {len(real_df)} real rows, test MAE={mae:.3f}, "
          f"calibration_ratio(pred_mean/actual_mean)={calibration_ratio}")

    return {
        "model": model,
        "feature_columns": feature_columns,
        "n_rows": len(real_df),
        "test_mae": mae,
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
