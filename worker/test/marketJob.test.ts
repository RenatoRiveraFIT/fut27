import { describe, expect, it } from 'vitest';
import floorsFx from './fixtures/cheapest-per-rating.json';
import overviewFx from './fixtures/cheapest-overview.json';
import { createTestDb, fixtureFetcher } from './d1';
import { FLOORS_PATH, OVERVIEW_PATH, runMarket } from '../src/jobs/market';

const t1 = new Date('2026-09-27T12:00:00Z');
const t2 = new Date('2026-09-27T12:15:00Z');
const floorValues = Object.values(floorsFx.data as Record<string, number>);

describe('runMarket', () => {
  it('guarda pisos válidos (ignora 0) y precios de consola', async () => {
    const db = createTestDb();
    const r = await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now: t1 });
    expect(r.error).toBeUndefined();
    expect(r.floors).toBe(floorValues.filter((v) => v > 0).length);
    const p = await db.prepare("SELECT platform, source FROM prices LIMIT 1").first<{ platform: string; source: string }>();
    expect(p).toEqual({ platform: 'consola', source: 'futgg_cheapest' });
    expect((await db.prepare('SELECT COUNT(*) c FROM floors WHERE price = 0').first<{ c: number }>())!.c).toBe(0);
  });

  it('solo agrega historial cuando el precio cambia', async () => {
    const db = createTestDb();
    const f = fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx });
    await runMarket(db, f, { now: t1 });
    await runMarket(db, f, { now: t2 });
    const h1 = await db.prepare('SELECT COUNT(*) c FROM floor_history').first<{ c: number }>();
    expect(h1!.c).toBe(floorValues.filter((v) => v > 0).length);
    const data = floorsFx.data as Record<string, number>;
    const changed = { data: { ...data, '86': data['86']! + 100 } };
    await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: changed, [OVERVIEW_PATH]: overviewFx }), { now: new Date('2026-09-27T12:30:00Z') });
    const h2 = await db.prepare('SELECT COUNT(*) c FROM floor_history').first<{ c: number }>();
    expect(h2!.c).toBe(h1!.c + 1);
    const cur = await db.prepare("SELECT updated_at FROM floors WHERE rating = 85").first<{ updated_at: string }>();
    expect(cur!.updated_at).toBe('2026-09-27T12:30:00.000Z');
  });

  it('si una fuente falla no toca los datos y registra el error', async () => {
    const db = createTestDb();
    await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now: t1 });
    const r = await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: 403, [OVERVIEW_PATH]: { data: 'roto' } }), { now: t2 });
    expect(r.error).toBeDefined();
    const kept = await db.prepare('SELECT MAX(updated_at) m FROM floors').first<{ m: string }>();
    expect(kept!.m).toBe(t1.toISOString());
    const s = await db.prepare("SELECT error_msg FROM source_status WHERE source = 'futgg_market'").first<{ error_msg: string }>();
    expect(s!.error_msg).toContain('403');
  });
});
