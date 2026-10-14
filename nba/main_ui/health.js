// NBA MAIN UI - /api/main-board/health (+ /rerun) and /api/calibration/report|apply (password-gated in the client, as on MLB).
// Health = every layer the board depends on, measured for the slate on screen. Rerun = a GitHub workflow_dispatch of the layer's
// pipeline, ONLY when the run-once rules allow it (never a claimed slate; P2B only after P2A succeeded; P3 only after P2B on a
// slate day before the first tip) - the pipelines' own claim guard (nba/pipeline_claim.py) refuses a second run regardless.
import { q, pgArr, num, r1, resolveSlate, propLabel } from "./common.js";

async function github(env, method, path, body) {
  if (!env.GITHUB_TOKEN || env.GITHUB_TOKEN === "DISABLED") return { ok: false, status: 0, data: { error: "GITHUB_TOKEN not configured on this worker" } };
  const owner = env.GITHUB_OWNER || "Rodantmat", repo = env.GITHUB_REPO || "Alphadog";
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "AlphaDog-NBA-Main-UI", "Content-Type": "application/json" }
  });
  let data = null;
  try { data = resp.status === 204 ? null : await resp.json(); } catch { data = null; }
  return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, data };
}
async function dispatch(env, workflow, inputs) {
  const body = { ref: env.GITHUB_BRANCH || "main" };
  if (inputs) body.inputs = inputs;
  return github(env, "POST", `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, body);
}

const ts = v => (v ? new Date(v).toISOString().replace("T", " ").slice(0, 16) + " UTC" : null);
function worst(list) { return list.includes("red") ? "red" : list.includes("yellow") ? "yellow" : "green"; }

export async function apiHealth(sql, cfg, url, version) {
  const slate = await resolveSlate(sql, cfg, url);
  const d = slate.date, today = slate.today;
  const [runs, plan, scored, boards, fhp, logs, inj, lines, slips, states, cal] = await Promise.all([
    q(sql, `SELECT DISTINCT ON (pipeline) pipeline, run_key::text run_key, status, claimed_at, finished_at, note FROM nba_control.pipeline_runs ORDER BY pipeline, claimed_at DESC`),
    q(sql, `SELECT count(*)::int n, min(game_datetime_utc) first_tip FROM nba_calendar.slate_games WHERE game_date = $1::date`, [today]),
    q(sql, `SELECT app, count(*)::int n, count(DISTINCT player_id)::int players, max(built_at) built FROM nba_score.board_scored WHERE game_date = $1::date AND app = ANY($2::text[]) GROUP BY app`, [d, pgArr(cfg.ui.apps)]),
    q(sql, `SELECT bookmaker, snapshot_label, count(*)::int n, max(fetched_at) fetched, max(game_date)::text game_date FROM nba_market.board_snapshots
            WHERE game_date = (SELECT max(game_date) FROM nba_market.board_snapshots WHERE game_date <= $1::date AND bookmaker = ANY($2::text[]))
              AND bookmaker = ANY($2::text[]) GROUP BY 1, 2 ORDER BY 1, 2`, [today, pgArr(cfg.ui.dfs_books)]),
    q(sql, `SELECT count(*)::int n, count(DISTINCT player_id)::int players, max(built_at) built FROM nba_score.final_hp WHERE game_date = $1::date`, [d]),
    q(sql, `SELECT (SELECT max(game_date)::text FROM nba_stats.player_game_log) reg, (SELECT max(game_date)::text FROM nba_stats.player_game_log_postseason) post,
                   (SELECT max(updated_at) FROM nba_stats.player_game_log) reg_upd`),
    q(sql, `SELECT max(snapshot_ts) last_ts, count(*) FILTER (WHERE game_date = $1::date)::int rows_slate FROM nba_daily.injury_report_snapshots WHERE game_date >= $1::date - 3`, [d]),
    q(sql, `SELECT snapshot_label, count(*)::int n, count(DISTINCT bookmaker)::int books, max(fetched_at) fetched FROM nba_market.game_lines_snapshots WHERE game_date = $1::date GROUP BY 1`, [d]),
    q(sql, `SELECT (SELECT count(*)::int FROM nba_score.live_slips WHERE game_date = $1::date) pp, (SELECT count(*)::int FROM nba_score.ud_live_slips WHERE game_date = $1::date) ud,
                   (SELECT count(*)::int FROM nba_score.live_slips WHERE game_date = $1::date AND status LIKE 'placed%') pp_placed`, [d]),
    q(sql, `SELECT strategy, state, live_cap, updated_at FROM nba_score.live_strategy_state ORDER BY strategy`),
    q(sql, `SELECT min(game_date)::text next_slate, (SELECT count(*)::int FROM nba_calendar.slate_games WHERE game_date = (SELECT min(game_date) FROM nba_calendar.slate_games WHERE game_date >= $1::date)) next_games
            FROM nba_calendar.slate_games WHERE game_date >= $1::date`, [today])]);
  const slateDay = plan[0] && plan[0].n > 0;
  const firstTip = plan[0] && plan[0].first_tip ? Date.parse(plan[0].first_tip) : null;
  const layers = [];

  const run = Object.fromEntries(runs.map(r => [r.pipeline, r]));
  const pipeLayer = (key, label, expectToday, windowNote, dependsOkFn) => {
    const r = run[key];
    const isToday = r && r.run_key === today;
    const okToday = isToday && r.status === "success";
    let status = "green";
    if (expectToday && !okToday) status = r && isToday && r.status === "claimed" ? "yellow" : (r && isToday ? "red" : "yellow");
    if (r && isToday && /failure/.test(r.status || "")) status = "red";
    const canRun = !isToday && (!dependsOkFn || dependsOkFn());
    layers.push({
      key, label, status, last_update: r ? `${r.run_key} • ${r.status} • ${ts(r.finished_at || r.claimed_at)}` : "Never", window_note: windowNote,
      metrics: [{ label: "Today's run", covered: okToday ? 1 : 0, expected: expectToday ? 1 : null, unit: isToday ? r.status : "not run today", note: r && r.note ? String(r.note).slice(0, 160) : null }],
      totals: r ? { run_key: r.run_key, status: r.status } : null,
      rerun_action: canRun ? { target: key, mode: "dispatch", label: `Start ${key} now (run-once guarded)` } : null
    });
  };
  pipeLayer("P2A", "P2A - Results & stats (box scores, grading)", true, "Daily ~03:30 PT: prior-night box scores, grading, stats refresh.");
  pipeLayer("P2B", "P2B - Slate model (baseline, injuries, crews, morning line)", slateDay, slateDay ? "Slate day: must finish before P3." : "No slate today - P2B is optional.",
    () => run.P2A && run.P2A.run_key === today && run.P2A.status === "success");
  pipeLayer("P3", "P3 - Board capture, scoring & engine picks", slateDay, slateDay ? `Slate day: runs ~30 min before the first tip${firstTip ? " (" + ts(firstTip) + ")" : ""}.` : "No slate today.",
    () => slateDay && run.P2B && run.P2B.run_key === today && run.P2B.status === "success" && (!firstTip || Date.now() < firstTip));
  pipeLayer("P1", "P1 - Weekly static refresh", false, "Mondays 12:00 PT: rosters, profiles, tracking, ratings.");

  // scored board
  const sc = Object.fromEntries(scored.map(r => [r.app, r]));
  layers.push({
    key: "board", label: `Scored Board (${d}${slate.mode === "replay" ? ", replay" : ""})`,
    status: worst(cfg.ui.apps.map(a => (sc[a] && sc[a].n > 0 ? "green" : a === "sleeper" ? "yellow" : "red"))),
    last_update: ts(scored.reduce((m, r) => (r.built && (!m || r.built > m) ? r.built : m), null)) || "Never",
    window_note: slate.mode === "live" ? "Today's board (P3)." : `No scored board for today (${today}) - the screen replays the latest scored slate.`,
    metrics: cfg.ui.apps.map(a => ({ label: `${a} legs`, covered: sc[a] ? sc[a].n : 0, expected: null, unit: "legs", note: sc[a] ? `${sc[a].players} players` : "no legs scored for this app on this slate" })),
    totals: { legs: scored.reduce((s, r) => s + r.n, 0) }, rerun_action: null
  });
  // DFS captures
  const capDate = boards[0] ? boards[0].game_date : null;
  layers.push({
    key: "capture", label: `DFS Board Capture (${capDate || "none"})`,
    status: boards.length ? worst(cfg.ui.apps.map(a => (boards.some(b => b.bookmaker === a) ? "green" : "yellow"))) : "red",
    last_update: ts(boards.reduce((m, r) => (r.fetched && (!m || r.fetched > m) ? r.fetched : m), null)) || "Never",
    window_note: "Latest capture on or before today, per app and snapshot label (routine / window / close).",
    metrics: boards.map(b => ({ label: `${b.bookmaker} • ${b.snapshot_label}`, covered: b.n, expected: null, unit: "rows", note: `fetched ${ts(b.fetched)}` })),
    totals: null, rerun_action: null
  });
  // model inputs
  const f = fhp[0] || {}, lg = logs[0] || {}, ij = inj[0] || {};
  layers.push({
    key: "inputs", label: "Model Inputs",
    status: worst([f.n > 0 ? "green" : (slate.mode === "live" ? "red" : "yellow"), lg.reg ? "green" : "red", ij.last_ts ? "green" : "yellow"]),
    last_update: ts(f.built) || "—",
    window_note: "Final probabilities for the slate, latest box scores, injury report, game lines.",
    metrics: [
      { label: `final_hp rungs (${d})`, covered: f.n || 0, expected: null, unit: "rows", note: `${f.players || 0} players` },
      { label: "Latest box score (regular / playoffs)", covered: 1, expected: null, unit: `${lg.reg || "—"} / ${lg.post || "—"}`, note: null },
      { label: `Injury report rows (${d})`, covered: ij.rows_slate || 0, expected: null, unit: "rows", note: `latest snapshot ${ts(ij.last_ts) || "—"}` },
      ...lines.map(l => ({ label: `Game lines • ${l.snapshot_label}`, covered: l.n, expected: null, unit: "rows", note: `${l.books} books, ${ts(l.fetched)}` }))],
    totals: null, rerun_action: null
  });
  // engines
  const sl = slips[0] || {};
  layers.push({
    key: "engines", label: "Slip Engines (PrizePicks live engine + Underdog paper engine)",
    status: slate.mode === "live" && slateDay && firstTip && Date.now() > firstTip && !(sl.pp > 0) ? "red" : "green",
    last_update: ts(states.reduce((m, r) => (r.updated_at && (!m || r.updated_at > m) ? r.updated_at : m), null)) || "—",
    window_note: `PrizePicks slips ${sl.pp || 0} (${sl.pp_placed || 0} placed), Underdog slips ${sl.ud || 0} for ${d}.`,
    metrics: states.filter(s => !s.strategy.startsWith("_")).map(s => ({ label: s.strategy, covered: s.live_cap, expected: null, unit: `cap • ${s.state}`, note: null })),
    totals: { pp_slips: sl.pp || 0, ud_slips: sl.ud || 0 }, rerun_action: null
  });
  const c = cal[0] || {};
  layers.push({
    key: "calendar", label: "Calendar", status: "green", last_update: today,
    window_note: slateDay ? `Slate today: ${plan[0].n} games, first tip ${ts(firstTip)}.` : `No games today. Next slate ${c.next_slate || "—"} (${c.next_games || 0} games).`,
    metrics: [{ label: "Games today", covered: plan[0] ? plan[0].n : 0, expected: null, unit: "games", note: null }], totals: null, rerun_action: null
  });
  const boardPlayers = scored.reduce((s, r) => s + r.players, 0);
  const games = await q(sql, "SELECT count(*)::int n FROM nba_calendar.slate_games WHERE game_date = $1::date", [d]);
  return { ok: true, data_ok: true, version, route: "/api/main-board/health", slate, overall_status: worst(layers.map(l => l.status)),
    generated_at: new Date().toISOString(), total_board_players: boardPlayers, total_board_games: games[0] ? games[0].n : 0, layers };
}

export async function apiHealthRerun(sql, cfg, env, body, version) {
  const target = String(body.target || ""), mode = String(body.mode || "");
  const wf = (cfg.ui.rerun_workflows || {})[target];
  if (!wf || mode !== "dispatch") return { status: 400, body: { ok: false, error: "unknown target/mode", version } };
  const today = (await q(sql, "SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date::text d"))[0].d;
  const claims = await q(sql, "SELECT pipeline, status FROM nba_control.pipeline_runs WHERE run_key = $1::date", [today]);
  const st = Object.fromEntries(claims.map(r => [r.pipeline, r.status]));
  if (st[target]) return { status: 409, body: { ok: false, error: `${target} already claimed for ${today} (status ${st[target]}) - no pipeline runs twice; recovery is the scheduler's job`, version } };
  if (target === "P2B" && st.P2A !== "success") return { status: 409, body: { ok: false, error: "P2B waits for today's P2A to succeed", version } };
  if (target === "P3") {
    const tip = (await q(sql, "SELECT min(game_datetime_utc) t FROM nba_calendar.slate_games WHERE game_date = $1::date", [today]))[0].t;
    if (!tip) return { status: 409, body: { ok: false, error: "no slate today", version } };
    if (Date.now() >= Date.parse(tip)) return { status: 409, body: { ok: false, error: "the first tip has passed - P3 never runs after tip-off", version } };
    if (st.P2B !== "success") return { status: 409, body: { ok: false, error: "P3 waits for today's P2B to succeed", version } };
  }
  const r = await dispatch(env, wf);
  return { status: r.ok ? 200 : 502, body: { ok: r.ok, version, route: "/api/main-board/health/rerun", target, workflow: wf, response: r.data, error: r.ok ? null : `github ${r.status}` } };
}

export async function apiCalibrationReport(sql, cfg, url, version) {
  const rel = cfg.reliability || {};
  const props = rel.props || {};
  const slate = await resolveSlate(sql, cfg, url);
  const onBoard = new Set((await q(sql, "SELECT DISTINCT prop FROM nba_score.board_scored WHERE game_date = $1::date AND app = ANY($2::text[])", [slate.date, pgArr(cfg.ui.apps)])).map(r => r.prop));
  const upd = (await q(sql, "SELECT updated_at FROM nba_config.classification_config WHERE config_key = 'prop_reliability_audit_latest'"))[0];
  const report = Object.entries(props).map(([prop, m]) => {
    const pen = String(m.status || "") === "penalized";
    return {
      prop, severity: pen ? "recommend" : "ok", status: pen ? "PENALIZED_REMEASURE_AVAILABLE" : String(m.status || "certified").toUpperCase(),
      on_board: onBoard.has(prop),
      metrics: { n: m.n, brier: m.brier, ece_pp: m.ECE_pp, worst_band_pp: m.worst_band_pp, lift_pct: m.lift_pct, penalty_pp: m.penalty_pp },
      summary: pen
        ? `Calibration is ${num(m.ECE_pp, 0).toFixed(2)} pp off on ${Number(m.n || 0).toLocaleString()} graded legs (worst band ${num(m.worst_band_pp, 0).toFixed(1)} pp), so P2B already shrinks this prop by a ${num(m.penalty_pp, 0).toFixed(2)} pp penalty. Apply re-measures every prop on the latest graded games; the new penalty (or its removal) flows into the next P2B automatically.`
        : `Certified: ${Number(m.n || 0).toLocaleString()} graded legs, calibration error ${num(m.ECE_pp, 0).toFixed(2)} pp, Brier ${num(m.brier, 0).toFixed(4)}, ${num(m.lift_pct, 0).toFixed(1)}% better than a base-rate model. No correction needed.`
    };
  }).sort((a, b) => (b.on_board - a.on_board) || (a.severity === "recommend" ? -1 : 1) - (b.severity === "recommend" ? -1 : 1) || a.prop.localeCompare(b.prop));
  return { ok: true, version, route: "/api/calibration/report", read_only: true,
    response: { report, generated_at: upd && upd.updated_at ? new Date(upd.updated_at).toISOString() : null, total_props: report.length, source: "nba_config.classification_config['prop_reliability_audit_latest'] (nba/score_prop_reliability.py)" } };
}

export async function apiCalibrationApply(sql, cfg, env, body, version) {
  const props = (Array.isArray(body.props) ? body.props : []).map(String).filter(p => /^[a-z0-9_]+$/.test(p));
  if (!props.length) return { status: 400, body: { ok: false, error: "props array required - select at least one prop", version } };
  const wf = cfg.ui.calibration_workflow || {};
  // ALWAYS the full audit: nba/score_prop_reliability.py rewrites the whole record and derives every penalty from the median of
  // the certified set - a subset run would overwrite the other props and move that median. The selection is what triggered it.
  const r = await dispatch(env, wf.file, { task: wf.task, props: "" });
  return { status: r.ok ? 200 : 502, body: { ok: r.ok, version, route: "/api/calibration/apply", read_only: false, requested_props: props,
    response: { applied: r.ok ? props : [], workflow: wf.file, note: "full reliability re-measure queued (every prop, both seasons; ~2 h) - the result replaces prop_reliability_audit_latest and the next P2B uses it" }, error: r.ok ? null : `github ${r.status} ${JSON.stringify(r.data || {}).slice(0, 200)}` } };
}

export { r1, propLabel };
