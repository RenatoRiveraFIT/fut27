import type { PlayerRow } from '../futgg/mapPlayer';

const COLS = ['ea_id', 'base_ea_id', 'name', 'search_name', 'overall', 'position', 'alt_positions', 'club_id', 'league_id', 'nation_id',
  'rarity_name', 'is_icon', 'is_hero', 'is_sbc', 'is_objective', 'is_evo', 'stats', 'skill_moves', 'weak_foot', 'foot', 'height', 'age',
  'playstyles', 'playstyles_plus', 'image_url', 'hash', 'updated_at'] as const;

const UPSERT = `INSERT INTO players (${COLS.join(', ')}) VALUES (${COLS.map((_, i) => `?${i + 1}`).join(', ')})
  ON CONFLICT(ea_id) DO UPDATE SET ${COLS.filter((c) => c !== 'ea_id').map((c) => `${c} = excluded.${c}`).join(', ')}
  WHERE players.hash IS NOT excluded.hash`;

export async function upsertPlayerPage(db: D1Database, rows: PlayerRow[]): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  const clubs = new Map<number, NonNullable<PlayerRow['club']>>();
  const leagues = new Map<number, NonNullable<PlayerRow['league']>>();
  const nations = new Map<number, NonNullable<PlayerRow['nation']>>();
  for (const r of rows) {
    stmts.push(db.prepare(UPSERT).bind(...COLS.map((c) => r[c])));
    if (r.club) clubs.set(r.club.id, r.club);
    if (r.league) leagues.set(r.league.id, r.league);
    if (r.nation) nations.set(r.nation.id, r.nation);
  }
  for (const c of clubs.values()) stmts.push(db.prepare(
    'INSERT INTO clubs (id, name, league_id) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET name = ?2, league_id = ?3 WHERE clubs.name IS NOT ?2 OR clubs.league_id IS NOT ?3',
  ).bind(c.id, c.name, c.leagueId));
  for (const [table, m] of [['leagues', leagues], ['nations', nations]] as const) {
    for (const x of m.values()) stmts.push(db.prepare(
      `INSERT INTO ${table} (id, name) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET name = ?2 WHERE ${table}.name IS NOT ?2`,
    ).bind(x.id, x.name));
  }
  if (stmts.length) await db.batch(stmts);
}
