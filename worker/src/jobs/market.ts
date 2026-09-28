import { getJson, type Fetcher } from '../futgg/client';
import { cheapestOverviewSchema, cheapestPerRatingSchema } from '../futgg/schemas';
import { markError, markOk } from '../status';

export const FLOORS_PATH = 'market/cheapest-price-per-rating/';
export const OVERVIEW_PATH = 'market/27/cheapest-by-rating/v2/overview/';
const SOURCE = 'futgg_market';
const PLATFORM = 'consola';

async function upsertFloors(db: D1Database, floors: Record<string, number>, now: string): Promise<number> {
  const current = await db.prepare('SELECT rating, price FROM floors WHERE platform = ?1').bind(PLATFORM).all<{ rating: number; price: number }>();
  const prev = new Map(current.results.map((r) => [r.rating, r.price]));
  const stmts: D1PreparedStatement[] = [];
  let valid = 0;
  for (const [k, price] of Object.entries(floors)) {
    const rating = Number(k);
    if (!Number.isInteger(rating) || price <= 0) continue;
    valid++;
    stmts.push(db.prepare('INSERT INTO floors (rating, platform, price, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(rating, platform) DO UPDATE SET price = ?3, updated_at = ?4')
      .bind(rating, PLATFORM, price, now));
    if (prev.get(rating) !== price) {
      stmts.push(db.prepare('INSERT INTO floor_history (rating, platform, ts, price) VALUES (?1, ?2, ?3, ?4)').bind(rating, PLATFORM, now, price));
    }
  }
  if (stmts.length) await db.batch(stmts);
  return valid;
}

async function upsertCheapest(db: D1Database, overview: Record<string, { eaId: number; price: number }[]>, now: string): Promise<number> {
  const cards = new Map<number, number>();
  for (const list of Object.values(overview)) for (const c of list) if (c.price > 0) cards.set(c.eaId, c.price);
  if (!cards.size) return 0;
  // Sin IN (...): D1 admite como máximo 100 parámetros y los precios de consola son pocos cientos de filas.
  const current = await db.prepare('SELECT ea_id, price FROM prices WHERE platform = ?1').bind(PLATFORM).all<{ ea_id: number; price: number }>();
  const prev = new Map(current.results.map((r) => [r.ea_id, r.price]));
  const stmts: D1PreparedStatement[] = [];
  for (const [eaId, price] of cards) {
    stmts.push(db.prepare("INSERT INTO prices (ea_id, platform, price, source, updated_at) VALUES (?1, ?2, ?3, 'futgg_cheapest', ?4) ON CONFLICT(ea_id, platform) DO UPDATE SET price = ?3, source = 'futgg_cheapest', updated_at = ?4")
      .bind(eaId, PLATFORM, price, now));
    if (prev.get(eaId) !== price) {
      stmts.push(db.prepare('INSERT INTO price_history (ea_id, platform, ts, price) VALUES (?1, ?2, ?3, ?4)').bind(eaId, PLATFORM, now, price));
    }
  }
  await db.batch(stmts);
  return cards.size;
}

export async function runMarket(db: D1Database, fetcher: Fetcher, opts: { now: Date }) {
  const now = opts.now.toISOString();
  const errors: string[] = [];
  let floors = 0;
  let prices = 0;
  try { floors = await upsertFloors(db, (await getJson(fetcher, FLOORS_PATH, cheapestPerRatingSchema)).data, now); }
  catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  try { prices = await upsertCheapest(db, (await getJson(fetcher, OVERVIEW_PATH, cheapestOverviewSchema)).data, now); }
  catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  const error = errors.length ? errors.join(' | ') : undefined;
  if (error) await markError(db, SOURCE, now, error);
  if (floors || prices) await markOk(db, SOURCE, now, `${floors} pisos, ${prices} precios`);
  return { floors, prices, error };
}
