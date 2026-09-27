CREATE TABLE players (
  ea_id INTEGER PRIMARY KEY,
  base_ea_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  search_name TEXT NOT NULL,
  overall INTEGER NOT NULL,
  position TEXT NOT NULL,
  alt_positions TEXT NOT NULL,
  club_id INTEGER,
  league_id INTEGER,
  nation_id INTEGER,
  rarity_name TEXT NOT NULL,
  is_icon INTEGER NOT NULL,
  is_hero INTEGER NOT NULL,
  is_sbc INTEGER NOT NULL,
  is_objective INTEGER NOT NULL,
  is_evo INTEGER NOT NULL,
  stats TEXT NOT NULL,
  skill_moves INTEGER,
  weak_foot INTEGER,
  foot TEXT,
  height INTEGER,
  age INTEGER,
  playstyles TEXT NOT NULL,
  playstyles_plus TEXT NOT NULL,
  image_url TEXT,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_players_overall ON players(overall DESC);
CREATE INDEX idx_players_base ON players(base_ea_id);

CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, league_id INTEGER);
CREATE TABLE leagues (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE nations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE prices (
  ea_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  price INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ea_id, platform)
);
CREATE TABLE price_history (ea_id INTEGER NOT NULL, platform TEXT NOT NULL, ts TEXT NOT NULL, price INTEGER NOT NULL);
CREATE INDEX idx_price_history ON price_history(platform, ts);
CREATE INDEX idx_price_history_card ON price_history(ea_id, platform, ts);

CREATE TABLE floors (rating INTEGER NOT NULL, platform TEXT NOT NULL, price INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (rating, platform));
CREATE TABLE floor_history (rating INTEGER NOT NULL, platform TEXT NOT NULL, ts TEXT NOT NULL, price INTEGER NOT NULL);
CREATE INDEX idx_floor_history ON floor_history(platform, ts);

CREATE TABLE sync_cursor (job TEXT PRIMARY KEY, cursor TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE source_status (source TEXT PRIMARY KEY, last_ok TEXT, last_error TEXT, error_msg TEXT, detail TEXT);
