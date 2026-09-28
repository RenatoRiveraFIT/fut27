import { getJson, type Fetcher } from '../futgg/client';
import { playersPageSchema } from '../futgg/schemas';
import { toPlayerRow } from '../futgg/mapPlayer';
import { upsertPlayerPage } from '../db/players';
import { markError, markOk } from '../status';

// De mayor a menor valoración: las cartas que más importan llegan primero en cada ciclo.
export const RATING_BUCKETS: [number, number][] = [[85, 99], [80, 84], [75, 79], [70, 74], [65, 69], [60, 64], [0, 59]];
const SOURCE = 'futgg_players';
const JOB = 'players';
const API_CAP = 10_000;

export interface PlayersCursor { bucket: number; page: number; cycleDate: string; done: boolean }

export function playersPath(bucket: number, page: number): string {
  const [lo, hi] = RATING_BUCKETS[bucket]!;
  return `players/v2/27/?page=${page}&overall__gte=${lo}&overall__lte=${hi}`;
}

async function loadCursor(db: D1Database, today: string): Promise<PlayersCursor> {
  const row = await db.prepare('SELECT cursor FROM sync_cursor WHERE job = ?1').bind(JOB).first<{ cursor: string }>();
  const c: PlayersCursor = row ? JSON.parse(row.cursor) : { bucket: 0, page: 1, cycleDate: today, done: false };
  if (c.done && c.cycleDate !== today) return { bucket: 0, page: 1, cycleDate: today, done: false };
  return c;
}

async function saveCursor(db: D1Database, c: PlayersCursor, now: string) {
  await db.prepare('INSERT INTO sync_cursor (job, cursor, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(job) DO UPDATE SET cursor = ?2, updated_at = ?3')
    .bind(JOB, JSON.stringify(c), now).run();
}

export async function runPlayersBatch(db: D1Database, fetcher: Fetcher, opts: { now: Date; pagesPerRun: number }) {
  const now = opts.now.toISOString();
  const cursor = await loadCursor(db, now.slice(0, 10));
  let pages = 0;
  let error: string | undefined;

  while (!cursor.done && pages < opts.pagesPerRun) {
    try {
      const data = await getJson(fetcher, playersPath(cursor.bucket, cursor.page), playersPageSchema);
      if (data.total >= API_CAP) {
        const [lo, hi] = RATING_BUCKETS[cursor.bucket]!;
        throw new Error(`El tramo ${lo}-${hi} tiene ${data.total} cartas y FUT.GG corta en 10.000: hay que partirlo`);
      }
      await upsertPlayerPage(db, data.data.map((p) => toPlayerRow(p, now)));
      pages++;
      if (data.next) cursor.page = data.next;
      else if (cursor.bucket + 1 < RATING_BUCKETS.length) { cursor.bucket++; cursor.page = 1; }
      else cursor.done = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  await saveCursor(db, cursor, now);
  if (error) await markError(db, SOURCE, now, error);
  else if (pages > 0) await markOk(db, SOURCE, now, cursor.done ? 'ciclo completo' : `tramo ${cursor.bucket + 1}/${RATING_BUCKETS.length}, página ${cursor.page}`);
  return { pages, cursor, error };
}
