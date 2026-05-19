CREATE TABLE IF NOT EXISTS score_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS score_packets (
  score_packet_id TEXT PRIMARY KEY,
  slate_date TEXT,
  line_id TEXT,
  source_key TEXT,
  prop_key TEXT,
  player_id INTEGER,
  game_key TEXT,
  status TEXT,
  data_ok INTEGER DEFAULT 0,
  input_json TEXT,
  score_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prop_scores (
  score_id TEXT PRIMARY KEY,
  slate_date TEXT,
  line_id TEXT,
  source_key TEXT,
  prop_key TEXT,
  player_id INTEGER,
  side TEXT,
  line_value REAL,
  final_score REAL,
  hit_probability REAL,
  grade TEXT,
  qualified INTEGER DEFAULT 0,
  warning_flags TEXT,
  score_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidate_board (
  candidate_id TEXT PRIMARY KEY,
  slate_date TEXT,
  line_id TEXT,
  source_key TEXT,
  prop_key TEXT,
  player_id INTEGER,
  player_name TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  side TEXT,
  line_value REAL,
  final_score REAL,
  hit_probability REAL,
  grade TEXT,
  rank_order INTEGER,
  pickable_flag INTEGER DEFAULT 1,
  release_status TEXT DEFAULT 'candidate',
  candidate_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS release_board (
  release_id TEXT PRIMARY KEY,
  slate_date TEXT,
  candidate_id TEXT,
  rank_order INTEGER,
  release_status TEXT,
  release_json TEXT,
  released_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS score_audit (
  audit_id TEXT PRIMARY KEY,
  slate_date TEXT,
  line_id TEXT,
  prop_key TEXT,
  player_id INTEGER,
  audit_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prop_scores_slate_prop ON prop_scores(slate_date, prop_key, qualified);
CREATE INDEX IF NOT EXISTS idx_candidate_board_slate_rank ON candidate_board(slate_date, release_status, rank_order);
CREATE INDEX IF NOT EXISTS idx_release_board_slate ON release_board(slate_date, rank_order);

INSERT OR REPLACE INTO score_schema_migrations VALUES ('schema_score_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial SCORE_DB schema');
