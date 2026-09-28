import { describe, expect, it } from 'vitest';
import page from './fixtures/players-page.json';
import floorsFx from './fixtures/cheapest-per-rating.json';
import overviewFx from './fixtures/cheapest-overview.json';
import { createTestDb, fixtureFetcher } from './d1';
import { playersPath } from '../src/jobs/players';
import { FLOORS_PATH, OVERVIEW_PATH } from '../src/jobs/market';
import { runSync, withDelay } from '../src/sync/run';

describe('withDelay', () => {
  it('espera entre peticiones, no antes de la primera', async () => {
    const waits: number[] = [];
    const f = withDelay(async () => new Response('{}'), 400, async (ms) => { waits.push(ms); });
    await f('a'); await f('b'); await f('c');
    expect(waits).toEqual([400, 400]);
  });
});

describe('runSync', () => {
  it('corre el mercado y un lote de cartas contra la misma base', async () => {
    const db = createTestDb();
    const f = fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx, [playersPath(0, 1)]: { ...page, next: null } });
    const r = await runSync(db, f, { now: new Date('2026-09-28T00:00:00Z'), pagesPerRun: 1 });
    expect(r.market.error).toBeUndefined();
    expect(r.players.pages).toBe(1);
    expect((await db.prepare('SELECT COUNT(*) c FROM players').first<{ c: number }>())!.c).toBeGreaterThan(0);
  });
});

describe('exitCode', () => {
  it('falla el job si cualquiera de las fuentes falló, para que GitHub avise', async () => {
    const { exitCode } = await import('../src/sync/run');
    expect(exitCode({ market: { error: undefined }, players: { error: undefined } })).toBe(0);
    expect(exitCode({ market: { error: undefined }, players: { error: 'FUT.GG 403' } })).toBe(1);
    expect(exitCode({ market: { error: 'x' }, players: { error: undefined } })).toBe(1);
  });
});
