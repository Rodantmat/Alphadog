// NBA MAIN UI - the scouting line on every card (the MLB card's leg_insight_comment, rebuilt for basketball).
// Built only from numbers the leg actually carries (probability, confidence, score, variation, multiplier) and the player's
// real box scores before the slate - never invented. Phrasing varies by a stable hash so the board does not read like a template.

// per-game stat for a prop, from a box-score row (null when the box score cannot settle the prop, e.g. quarter props)
export const PROP_STAT = {
  points: g => g.pts, rebounds: g => g.reb, assists: g => g.ast, threes_made: g => g.fg3m, blocks: g => g.blk, steals: g => g.stl,
  turnovers: g => g.tov, pts_reb: g => n(g.pts) + n(g.reb), pts_ast: g => n(g.pts) + n(g.ast), reb_ast: g => n(g.reb) + n(g.ast),
  pra: g => n(g.pts) + n(g.reb) + n(g.ast), stocks: g => n(g.stl) + n(g.blk),
  fantasy_score: g => n(g.pts) + 1.2 * n(g.reb) + 1.5 * n(g.ast) + 3 * n(g.blk) + 3 * n(g.stl) - n(g.tov),
  ftm: g => g.ftm, fga: g => g.fga, fgm: g => g.fgm, fta: g => g.fta, fg3a: g => g.fg3a, oreb: g => g.oreb, dreb: g => g.dreb,
  personal_fouls: g => g.pf,
  double_double: g => [g.pts, g.reb, g.ast, g.stl, g.blk].filter(v => n(v) >= 10).length >= 2 ? 1 : 0,
  triple_double: g => [g.pts, g.reb, g.ast, g.stl, g.blk].filter(v => n(v) >= 10).length >= 3 ? 1 : 0
};
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
export function statFor(prop, g) {
  const f = PROP_STAT[prop];
  if (!f || !g) return null;
  if (g.min != null && Number(g.min) <= 0) return null;   // DNP rows never count as a game
  const v = f(g);
  return v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10;
}

function hashPick(seed, arr) { if (!arr.length) return ""; let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return arr[h % arr.length]; }
function shuffle(arr, seed) { let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; }
const PROP_WORD = { points: "points", rebounds: "boards", assists: "assists", threes_made: "threes", blocks: "blocks", steals: "steals", turnovers: "turnovers", pts_reb: "points + rebounds", pts_ast: "points + assists", reb_ast: "rebounds + assists", pra: "PRA", stocks: "stocks", fantasy_score: "fantasy points" };

function toneFragment(r, seed) {
  const hp = Number(r.estimated_hit_probability_0_100 || 0), conf = Number(r.probability_confidence_0_100 || 0), score = Number(r.score_0_100 || 0);
  const hpT = hp.toFixed(1) + "%", confT = conf.toFixed(0) + "%", scoreT = score.toFixed(0);
  if (hp >= 80 && conf >= 93 && score >= 85) return hashPick(seed, [
    `Everything stacks here: ${hpT} probability, ${confT} confidence and a ${scoreT} score all point the same way.`,
    `About as clean as tonight's board gets - ${hpT} backed by ${confT} confidence and a ${scoreT} score.`,
    `The layers agree: ${hpT} isn't fighting the ${confT} confidence read, and the ${scoreT} score confirms it.`]);
  if (hp >= 75 && score < 80) return hashPick(seed, [
    `Big ${hpT} number, but a ${scoreT} score asks for a second look before treating it as top-shelf.`,
    `The probability is attractive at ${hpT} while the score (${scoreT}) plays it more cautiously.`]);
  if (hp >= 72 && conf < 91) return hashPick(seed, [
    `${hpT} with softer ${confT} confidence - useful, not a finished read.`,
    `Probability is strong at ${hpT}; confidence (${confT}) is the drag.`]);
  if (score >= 88) return hashPick(seed, [
    `${scoreT} score gives this real backing at ${hpT}.`,
    `Solid all around: ${hpT} probability, ${scoreT} score - consistent rather than flashy.`]);
  return hashPick(seed, [
    `Usable candidate at ${hpT}, not a blind play.`,
    `Fair read at ${hpT} - worth a look, not a headline play.`,
    `Middle-of-the-board profile at ${hpT}: nothing screams avoid, nothing screams lock.`]);
}

function formFragment(r, games, seed) {
  const prop = r.canonical_prop_key, line = Number(r.line_value), over = r.selected_side === "more";
  const vals = games.map(g => statFor(prop, g)).filter(v => v != null).slice(0, 10);
  if (vals.length < 3) return "";
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const hits = vals.filter(v => (over ? v > line : v < line)).length;
  const word = PROP_WORD[prop] || r.prop_label || prop;
  const nG = vals.length, avgT = (Math.round(avg * 10) / 10).toFixed(1);
  if (over) return hashPick(seed, [
    `Cleared ${line} in ${hits} of his last ${nG} (averaging ${avgT} ${word}).`,
    `Recent form: ${avgT} ${word} a night over the last ${nG}, over ${line} ${hits} times.`,
    `${hits}/${nG} over ${line} lately, on a ${avgT} average.`]);
  return hashPick(seed, [
    `Stayed under ${line} in ${hits} of his last ${nG} (averaging ${avgT} ${word}).`,
    `Recent form: ${avgT} ${word} a night over the last ${nG}, under ${line} ${hits} times.`,
    `${hits}/${nG} under ${line} lately, on a ${avgT} average.`]);
}

function minutesFragment(games, seed) {
  const mins = games.map(g => Number(g.min)).filter(v => Number.isFinite(v) && v > 0);
  if (mins.length < 5) return "";
  const l3 = mins.slice(0, 3).reduce((a, b) => a + b, 0) / 3, l10 = mins.reduce((a, b) => a + b, 0) / mins.length;
  const d = l3 - l10;
  if (Math.abs(d) < 2.5) return hashPick(seed, [`Minutes are steady (${l10.toFixed(1)} a game).`, `Role looks stable at about ${l10.toFixed(0)} minutes.`]);
  return d > 0 ? hashPick(seed, [`Minutes trending up: ${l3.toFixed(1)} over the last 3 vs ${l10.toFixed(1)} across ${mins.length}.`, `A bigger role lately - ${l3.toFixed(0)} minutes in the last 3.`])
               : hashPick(seed, [`Minutes trending down: ${l3.toFixed(1)} over the last 3 vs ${l10.toFixed(1)} across ${mins.length}.`, `A smaller role lately - ${l3.toFixed(0)} minutes in the last 3.`]);
}

function variationFragment(r, seed) {
  if (r.is_goblin) return hashPick(seed, ["Goblin line: an easier rung than the main line, priced lower on PrizePicks.", "PrizePicks goblin - the line sits below the main number, so the payout factor is reduced."]);
  if (r.is_demon) return hashPick(seed, ["Demon line: a harder rung above the main number, priced higher on PrizePicks.", "PrizePicks demon - the line sits above the main number, so the payout factor is boosted."]);
  const m = Number(r.app_multiplier);
  if (r.source_key === "underdog" && Number.isFinite(m) && Math.abs(m - 1) > 1e-9) return `Underdog pays a ${m.toFixed(2)}x multiplier on this pick.`;
  if (r.source_key === "sleeper" && Number.isFinite(m)) return `Sleeper shows a ${m.toFixed(2)}x multiplier on this pick.`;
  return "";
}

function matchupFragment(r, seed) {
  if (!r.opponent_abbr) return "";
  return hashPick(seed, [`${r.is_home ? "Home" : "Road"} game vs ${r.opponent_abbr}.`, `${r.is_home ? "Hosting" : "Visiting"} ${r.opponent_abbr} tonight.`]);
}

const PROP_NOTES = {
  points: ["Points are the most efficiently priced market - the edge has to come from role and minutes, not reputation.", "Scoring props swing with shot volume; usage and minutes carry this read."],
  rebounds: ["Rebounds track minutes closely; lineup size and the opponent's miss rate drive the rest.", "A boards prop lives on minutes and who else is on the glass."],
  assists: ["Assists depend on teammates converting - a left-skewed prop that playmakers lose in blowouts.", "Playmaking props need both the touches and the made shots around him."],
  threes_made: ["Threes are bursty: attempt volume matters far more than percentage.", "A threes line is a volume bet - attempts first, makes second."],
  steals: ["Steals carry enormous variance; the opponent's turnover rate is the main driver.", "A steals line is a low-count prop - one possession can decide it."],
  blocks: ["Blocks follow the opponent's rim attempts and the matchup at the five.", "Low-count prop - rim protection role and opponent shot profile decide it."],
  turnovers: ["Turnover spikes regress; usage sets the floor.", "Ball-handling volume drives turnovers more than recent spikes."],
  stocks: ["Steals + blocks are two zero-inflated counts added together - still a high-variance prop.", "Stocks combine two low-count stats; variance stays high."],
  pts_reb: ["Points + rebounds smooths some variance by combining two stats.", "The combo spreads the outcome across scoring and the glass."],
  pts_ast: ["Points + assists moves together for ball-handlers.", "For a creator, scoring and assists rise and fall together."],
  reb_ast: ["Rebounds + assists is a role prop - minutes and lineup decide it.", "Boards plus dimes: a minutes-and-role read more than a scoring one."],
  pra: ["PRA has lower relative variance than its parts for do-it-all players.", "The broadest combo - one strong category can carry it."],
  fantasy_score: ["Fantasy score weights blocks and steals heavily, so defensive events swing it.", "A composite line - every box-score category feeds it."]
};
function propFragment(r, seed) { const b = PROP_NOTES[r.canonical_prop_key]; return b ? hashPick(seed, b) : ""; }

export function composeLegInsight(r, games, ctx) {
  const seed = [r.player_name, r.canonical_prop_key, r.line_value, r.selected_side, r.source_key].join("|");
  const parts = [toneFragment(r, seed + "|tone"), formFragment(r, games || [], seed + "|form"), minutesFragment(games || [], seed + "|min"),
    variationFragment(r, seed + "|var"), propFragment(r, seed + "|prop"), matchupFragment(r, seed + "|m")].filter(Boolean);
  const first = parts.shift();                    // the probability read always leads
  const rest = shuffle(parts, seed + "|order").slice(0, 2 + (seed.length % 2));
  return [first, ...rest].join(" ");
}
