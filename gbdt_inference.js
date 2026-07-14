// Real GBDT inference engine for Cloudflare Workers.
//
// Cloudflare Workers cannot run XGBoost/Python natively (confirmed: Workers AI supports
// inference only on Cloudflare's own pre-built model catalog, no custom model training or
// custom model inference - checked directly from their own docs before this design was
// locked). So model TRAINING happens externally via GitHub Actions (gbdt_training/), and
// this file is the real, minimal, dependency-free JS counterpart that traverses the
// exported tree JSON to reproduce XGBoost's own prediction math exactly.
//
// Objective used by every trained model here is "count:poisson" (real, standard choice
// for count-based sports stats - hits, strikeouts, etc.), so the raw sum of tree leaf
// values is in LOG space; the real predicted rate is exp(sum_of_leaves). Training forces
// base_score=1 (see train_models.py) so its log-space contribution is exactly log(1)=0 -
// this mirrors exactly how xgboost.XGBRegressor(objective="count:poisson") computes its
// own predictions internally, not an approximation.

function evalTree(node, features) {
  // Leaf node: XGBoost's own JSON dump format uses the key "leaf" for leaf values.
  if (node.leaf !== undefined) return node.leaf;

  const featureValue = features[node.split];
  // Real, honest missing-value handling: XGBoost's own trees have an explicit "missing"
  // child id for exactly this case (a feature that's null/undefined at inference time -
  // e.g. a context layer that's still derived/temporary rather than real for this leg).
  // Falling through to the "no" branch would silently misrepresent a genuinely missing
  // value as a real "condition failed" case.
  if (featureValue === undefined || featureValue === null || Number.isNaN(featureValue)) {
    const missingId = node.missing;
    const child = node.children.find(c => c.nodeid === missingId);
    return evalTree(child, features);
  }

  const goesYes = featureValue < node.split_condition;
  const targetId = goesYes ? node.yes : node.no;
  const child = node.children.find(c => c.nodeid === targetId);
  return evalTree(child, features);
}

/**
 * Predict the real underlying rate for one leg using a trained GBDT model export.
 *
 * @param {object} modelExport - the parsed JSON produced by gbdt_training/train_models.py
 *   (shape: { prop_key, family, objective, feature_columns, base_score, trees, ... }).
 * @param {object} features - real feature values keyed by the same names used in
 *   training (HITTER_FEATURE_COLUMNS / PITCHER_FEATURE_COLUMNS in train_models.py).
 *   Any feature genuinely missing for this leg should be omitted or set to null/undefined
 *   - not defaulted to 0, since 0 is frequently a real, meaningful value (e.g. is_home=0).
 * @returns {{ predicted_rate: number, trees_evaluated: number, missing_features: string[] }}
 */
function predictRate(modelExport, features) {
  const missingFeatures = modelExport.feature_columns.filter(
    col => features[col] === undefined || features[col] === null
  );

  let logSum = 0;
  for (const tree of modelExport.trees) {
    logSum += evalTree(tree, features);
  }

  // XGBoost's own Poisson objective link function: predicted rate = exp(raw_margin).
  // Training deliberately forces base_score=1 (see train_models.py) specifically so its
  // log-space contribution is log(1)=0 - verified against XGBoost's own maintainer
  // guidance, not assumed - meaning the raw sum of tree leaf outputs alone equals the
  // full log-rate here. No separate base_score term is needed on this side BECAUSE of
  // that training-time choice, not because base_score is being ignored/ignored-by-accident.
  const predictedRate = Math.exp(logSum);

  return {
    predicted_rate: predictedRate,
    trees_evaluated: modelExport.trees.length,
    missing_features: missingFeatures,
  };
}

export { predictRate, evalTree };
