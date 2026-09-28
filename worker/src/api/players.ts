import { normalizeText, type MetaResponse, type PlayerDetailResponse, type PlayersResponse } from '@fut27/shared';
import { CARD_SELECT, loadFloors, rowToCard, type CardDbRow } from '../db/players';
import { intParam, json } from './http';

const PAGE_SIZE = 30;
const POSITIONS = ['GK', 'RB', 'LB', 'CB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST'];
const SORTS: Record<string, string> = { '-ovr': 'p.overall DESC, p.name', ovr: 'p.overall ASC, p.name', name: 'p.name ASC' };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function listPlayers(db: D1Database, url: URL, now: Date): Promise<Response> {
  const q = url.searchParams;
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (sql: string, ...v: (string | number)[]) => { where.push(sql); args.push(...v); };

  const text = normalizeText(q.get('q') ?? '');
  if (text) add("p.search_name LIKE ? ESCAPE '\\'", `%${escapeLike(text)}%`);
  const pos = q.get('pos');
  if (pos && POSITIONS.includes(pos)) add('(p.position = ? OR p.alt_positions LIKE ?)', pos, `%"${pos}"%`);
  for (const [param, col] of [['league', 'p.league_id'], ['club', 'p.club_id'], ['nation', 'p.nation_id']] as const) {
    const v = intParam(q.get(param), 0, 1e9);
    if (v !== null) add(`${col} = ?`, v);
  }
  const rarity = q.get('rarity');
  if (rarity) add('p.rarity_name = ?', rarity);
  const minOvr = intParam(q.get('minOvr'), 1, 99);
  if (minOvr !== null) add('p.overall >= ?', minOvr);
  const maxOvr = intParam(q.get('maxOvr'), 1, 99);
  if (maxOvr !== null) add('p.overall <= ?', maxOvr);
  const type = q.get('type');
  if (type === 'icon') add('p.is_icon = 1');
  if (type === 'hero') add('p.is_hero = 1');
  if (type === 'tradeable') add('p.is_sbc = 0 AND p.is_objective = 0 AND p.is_evo = 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[q.get('sort') ?? '-ovr'] ?? SORTS['-ovr'];
  const page = intParam(q.get('page'), 1, 10_000) ?? 1;

  const [countRow, rows, floors] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM players p ${whereSql}`).bind(...args).first<{ c: number }>(),
    db.prepare(`${CARD_SELECT} ${whereSql} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`).bind(...args).all<CardDbRow>(),
    loadFloors(db),
  ]);
  const body: PlayersResponse = { items: rows.results.map((r) => rowToCard(r, floors, now)), page, pageSize: PAGE_SIZE, total: countRow?.c ?? 0 };
  return json(body);
}

export async function getPlayer(db: D1Database, eaId: number, now: Date): Promise<Response> {
  const floors = await loadFloors(db);
  const row = await db.prepare(`${CARD_SELECT} WHERE p.ea_id = ?`).bind(eaId).first<CardDbRow>();
  if (!row) return json({ error: 'Carta no encontrada' }, 404);
  const card = rowToCard(row, floors, now);
  const versions = await db.prepare(`${CARD_SELECT} WHERE p.base_ea_id = ? AND p.ea_id != ? ORDER BY p.overall DESC`).bind(card.baseEaId, eaId).all<CardDbRow>();
  const hist = await db.prepare('SELECT platform, ts, price FROM price_history WHERE ea_id = ? ORDER BY ts').bind(eaId).all<{ platform: string; ts: string; price: number }>();
  const body: PlayerDetailResponse = {
    card,
    versions: versions.results.map((r) => rowToCard(r, floors, now)),
    history: {
      pc: hist.results.filter((h) => h.platform === 'pc').map(({ ts, price }) => ({ ts, price })),
      consola: hist.results.filter((h) => h.platform === 'consola').map(({ ts, price }) => ({ ts, price })),
    },
  };
  return json(body);
}

export async function getMeta(db: D1Database): Promise<Response> {
  const [leagues, nations, clubs, rarities] = await Promise.all([
    db.prepare('SELECT id, name FROM leagues ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare('SELECT id, name FROM nations ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare('SELECT id, name FROM clubs ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare('SELECT DISTINCT rarity_name AS r FROM players ORDER BY r').all<{ r: string }>(),
  ]);
  const body: MetaResponse = { leagues: leagues.results, nations: nations.results, clubs: clubs.results, rarities: rarities.results.map((x) => x.r), positions: POSITIONS };
  return json(body);
}
