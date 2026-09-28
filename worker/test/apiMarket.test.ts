import { describe, expect, it } from 'vitest';
import floorsFx from './fixtures/cheapest-per-rating.json';
import overviewFx from './fixtures/cheapest-overview.json';
import { createTestDb, fixtureFetcher } from './d1';
import { FLOORS_PATH, OVERVIEW_PATH, runMarket } from '../src/jobs/market';
import { handleApi } from '../src/api/router';
import type { FloorsResponse, MoversResponse, StatusResponse } from '@fut27/shared';

const now = new Date('2026-09-27T12:00:00Z');

describe('API de mercado y estado', () => {
  it('floors, movers y status responden con la forma esperada', async () => {
    const db = createTestDb();
    const env = { DB: db, ASSETS: { fetch: async () => new Response('') } };
    await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now });
    const floors = (await (await handleApi(new Request('https://x.test/api/market/floors'), env, now)).json()) as FloorsResponse;
    expect(floors.platform).toBe('consola');
    expect(floors.current.find((f) => f.rating === 86)!.price).toBe((floorsFx.data as Record<string, number>)['86']);
    const movers = (await (await handleApi(new Request('https://x.test/api/market/movers'), env, now)).json()) as MoversResponse;
    expect(movers).toMatchObject({ platform: 'consola', up: [], down: [] });
    const status = (await (await handleApi(new Request('https://x.test/api/status'), env, now)).json()) as StatusResponse;
    expect(status.sources.map((s) => s.source)).toContain('futgg_floors');
    expect(status.pricedCount).toBeGreaterThan(0);
  });
});
