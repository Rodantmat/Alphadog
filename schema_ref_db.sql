CREATE TABLE IF NOT EXISTS ref_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT);

CREATE TABLE IF NOT EXISTS ref_teams (
  team_id TEXT PRIMARY KEY,
  mlb_team_id INTEGER,
  abbreviation TEXT,
  full_name TEXT,
  league TEXT,
  division TEXT,
  active INTEGER DEFAULT 1,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ref_players (
  player_id INTEGER PRIMARY KEY,
  player_name TEXT,
  primary_team_id TEXT,
  primary_role TEXT,
  bats TEXT,
  throws TEXT,
  active INTEGER DEFAULT 1,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ref_player_aliases (
  alias_key TEXT PRIMARY KEY,
  player_id INTEGER,
  alias_name TEXT,
  source_key TEXT,
  confidence TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ref_rosters (
  roster_key TEXT PRIMARY KEY,
  slate_date TEXT,
  team_id TEXT,
  player_id INTEGER,
  roster_status TEXT,
  role TEXT,
  source_key TEXT,
  raw_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ref_stadiums (
  stadium_id TEXT PRIMARY KEY,
  team_id TEXT,
  stadium_name TEXT,
  city TEXT,
  state TEXT,
  latitude REAL,
  longitude REAL,
  roof_type TEXT,
  turf_type TEXT,
  park_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ref_prop_aliases (
  alias_key TEXT PRIMARY KEY,
  prop_key TEXT,
  source_key TEXT,
  source_market_name TEXT,
  normalized_market_name TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ref_players_team ON ref_players(primary_team_id, active);
CREATE INDEX IF NOT EXISTS idx_ref_alias_player ON ref_player_aliases(player_id);
CREATE INDEX IF NOT EXISTS idx_ref_rosters_date_team ON ref_rosters(slate_date, team_id);

INSERT OR REPLACE INTO ref_schema_migrations VALUES ('schema_ref_db_v0_1', 'alphadog-v2-schema-phase-pack-v0.1', CURRENT_TIMESTAMP, 'Initial REF_DB schema');
