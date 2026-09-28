import { resolvePrice, type CardWithPrice, type Floors, type Platform, type PriceRow } from '@fut27/shared';
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

export const CARD_SELECT = `SELECT p.*, c.name AS club_name, l.name AS league_name, n.name AS nation_name,
  pc.price AS pc_price, pc.source AS pc_source, pc.updated_at AS pc_at,
  co.price AS co_price, co.source AS co_source, co.updated_at AS co_at
  FROM players p
  LEFT JOIN clubs c ON c.id = p.club_id
  LEFT JOIN leagues l ON l.id = p.league_id
  LEFT JOIN nations n ON n.id = p.nation_id
  LEFT JOIN prices pc ON pc.ea_id = p.ea_id AND pc.platform = 'pc'
  LEFT JOIN prices co ON co.ea_id = p.ea_id AND co.platform = 'consola'`;

export type CardDbRow = Record<string, string | number | null>;

export async function loadFloors(db: D1Database, platform: Platform = 'consola'): Promise<Floors> {
  const r = await db.prepare('SELECT rating, price FROM floors WHERE platform = ?1').bind(platform).all<{ rating: number; price: number }>();
  return Object.fromEntries(r.results.map((x) => [x.rating, x.price]));
}

export function rowToCard(r: CardDbRow, floors: Floors, now: Date): CardWithPrice {
  const card = {
    eaId: r.ea_id as number, baseEaId: r.base_ea_id as number, name: r.name as string, overall: r.overall as number,
    position: r.position as string, altPositions: JSON.parse(r.alt_positions as string) as string[],
    clubId: r.club_id as number | null, clubName: r.club_name as string | null,
    leagueId: r.league_id as number | null, leagueName: r.league_name as string | null,
    nationId: r.nation_id as number | null, nationName: r.nation_name as string | null,
    rarityName: r.rarity_name as string,
    isIcon: r.is_icon === 1, isHero: r.is_hero === 1, isSbc: r.is_sbc === 1, isObjective: r.is_objective === 1, isEvo: r.is_evo === 1,
    stats: JSON.parse(r.stats as string), skillMoves: r.skill_moves as number | null, weakFoot: r.weak_foot as number | null,
    foot: r.foot as string | null, height: r.height as number | null, age: r.age as number | null,
    playstyles: JSON.parse(r.playstyles as string), playstylesPlus: JSON.parse(r.playstyles_plus as string),
    imageUrl: r.image_url as string | null,
  };
  const prices: PriceRow[] = [];
  if (r.pc_price != null) prices.push({ platform: 'pc', price: r.pc_price as number, source: r.pc_source as string, updatedAt: r.pc_at as string });
  if (r.co_price != null) prices.push({ platform: 'consola', price: r.co_price as number, source: r.co_source as string, updatedAt: r.co_at as string });
  return { ...card, price: resolvePrice({ card, prices, floors, now }) };
}
