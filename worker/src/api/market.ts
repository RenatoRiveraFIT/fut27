import type { FloorsResponse, Mover, MoversResponse, Platform } from '@fut27/shared';
import { CARD_SELECT, loadFloors, rowToCard, type CardDbRow } from '../db/players';
import { computeMovers } from '../market/movers';
import { json } from './http';

const platformOf = (url: URL): Platform => (url.searchParams.get('platform') === 'pc' ? 'pc' : 'consola');

export async function getFloors(db: D1Database, url: URL, now: Date): Promise<Response> {
  const platform = platformOf(url);
  const since = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
  const [current, history] = await Promise.all([
    db.prepare('SELECT rating, price, updated_at FROM floors WHERE platform = ? ORDER BY rating').bind(platform).all<{ rating: number; price: number; updated_at: string }>(),
    db.prepare('SELECT rating, ts, price FROM floor_history WHERE platform = ? AND ts >= ? ORDER BY ts').bind(platform, since).all<{ rating: number; ts: string; price: number }>(),
  ]);
  const body: FloorsResponse = { platform, current: current.results.map((r) => ({ rating: r.rating, price: r.price, updatedAt: r.updated_at })), history: history.results };
  return json(body);
}

export async function getMovers(db: D1Database, url: URL, now: Date): Promise<Response> {
  const platform = platformOf(url);
  const since = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const rows = await db.prepare('SELECT ea_id, ts, price FROM price_history WHERE platform = ? AND ts >= ?').bind(platform, since).all<{ ea_id: number; ts: string; price: number }>();
  const moves = computeMovers(rows.results, now, 20);
  let up: Mover[] = [];
  let down: Mover[] = [];
  if (moves.length) {
    const ids = moves.map((m) => m.eaId);
    const [cards, floors] = await Promise.all([
      db.prepare(`${CARD_SELECT} WHERE p.ea_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<CardDbRow>(),
      loadFloors(db),
    ]);
    const byId = new Map(cards.results.map((r) => [r.ea_id as number, rowToCard(r, floors, now)]));
    const withCard = moves.flatMap((m) => { const card = byId.get(m.eaId); return card ? [{ card, from: m.from, to: m.to, changePct: m.changePct }] : []; });
    up = withCard.filter((m) => m.changePct > 0).slice(0, 20);
    down = withCard.filter((m) => m.changePct < 0).reverse().slice(0, 20);
  }
  const body: MoversResponse = { platform, up, down };
  return json(body);
}
