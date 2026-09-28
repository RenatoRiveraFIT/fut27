import { describe, expect, it } from 'vitest';
import page from './fixtures/players-page.json';
import { createTestDb, fixtureFetcher } from './d1';
import { playersPath, RATING_BUCKETS, runPlayersBatch } from '../src/jobs/players';

const now = new Date('2026-09-27T12:00:00Z');
const lastPage = { ...page, next: null };
const uniqueCards = new Set(page.data.map((p) => p.eaId)).size;

function allBucketsOnePage() {
  const map: Record<string, unknown> = {};
  RATING_BUCKETS.forEach((_, b) => { map[playersPath(b, 1)] = lastPage; });
  return map;
}

describe('runPlayersBatch', () => {
  it('guarda cartas, clubes, ligas y naciones y avanza el cursor', async () => {
    const db = createTestDb();
    const f = fixtureFetcher({ [playersPath(0, 1)]: page, [playersPath(0, 2)]: lastPage });
    const r = await runPlayersBatch(db, f, { now, pagesPerRun: 2 });
    expect(r.pages).toBe(2);
    expect(r.cursor).toMatchObject({ bucket: 1, page: 1, done: false });
    const n = await db.prepare('SELECT COUNT(*) c FROM players').first<{ c: number }>();
    expect(n!.c).toBe(uniqueCards);
    expect((await db.prepare('SELECT name FROM clubs WHERE id = 112658').first<{ name: string }>())!.name).toBe('ICON');
  });

  it('retoma desde el cursor en la siguiente ejecución y cierra el ciclo', async () => {
    const db = createTestDb();
    const f = fixtureFetcher(allBucketsOnePage());
    await runPlayersBatch(db, f, { now, pagesPerRun: 4 });
    const r = await runPlayersBatch(db, f, { now, pagesPerRun: 4 });
    expect(r.cursor.done).toBe(true);
    expect(f.calls).toHaveLength(RATING_BUCKETS.length);
    const again = await runPlayersBatch(db, f, { now, pagesPerRun: 4 });
    expect(again.pages).toBe(0);
    const tomorrow = await runPlayersBatch(db, f, { now: new Date('2026-09-28T00:05:00Z'), pagesPerRun: 4 });
    expect(tomorrow.pages).toBe(4);
  });

  it('no reescribe cartas sin cambios', async () => {
    const db = createTestDb();
    const f = fixtureFetcher(allBucketsOnePage());
    await runPlayersBatch(db, f, { now, pagesPerRun: 1 });
    await db.prepare("DELETE FROM sync_cursor").run();
    await runPlayersBatch(db, f, { now: new Date('2026-09-27T13:00:00Z'), pagesPerRun: 1 });
    const u = await db.prepare('SELECT DISTINCT updated_at FROM players').all<{ updated_at: string }>();
    expect(u.results.map((x) => x.updated_at)).toEqual([now.toISOString()]);
  });

  it('si FUT.GG bloquea, no avanza el cursor y registra el error', async () => {
    const db = createTestDb();
    const r = await runPlayersBatch(db, fixtureFetcher({ [playersPath(0, 1)]: 403 }), { now, pagesPerRun: 2 });
    expect(r.error).toContain('403');
    expect(r.cursor).toMatchObject({ bucket: 0, page: 1 });
    const s = await db.prepare("SELECT error_msg FROM source_status WHERE source = 'futgg_players'").first<{ error_msg: string }>();
    expect(s!.error_msg).toContain('403');
  });

  it('marca error si un tramo llega al tope de 10.000', async () => {
    const db = createTestDb();
    const r = await runPlayersBatch(db, fixtureFetcher({ [playersPath(0, 1)]: { ...page, total: 10000 } }), { now, pagesPerRun: 1 });
    expect(r.error).toContain('tramo 85-99');
    const s = await db.prepare("SELECT error_msg FROM source_status WHERE source = 'futgg_players'").first<{ error_msg: string }>();
    expect(s!.error_msg).toContain('10.000');
  });

  it('empieza el ciclo por las cartas de mayor valoración', () => {
    expect(RATING_BUCKETS[0]).toEqual([85, 99]);
    const lows = RATING_BUCKETS.map(([lo]) => lo);
    expect(lows).toEqual([...lows].sort((a, b) => b - a));
  });
});
