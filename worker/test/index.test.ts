import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { createTestDb } from './d1';

function env() {
  return { DB: createTestDb(), ASSETS: { fetch: vi.fn(async () => new Response('<html>app</html>')) }, PAGES_PER_RUN: '1' };
}

describe('worker', () => {
  it('rutas /api van a la API y el resto a los assets', async () => {
    const e = env();
    const api = await worker.fetch(new Request('https://x.test/api/status'), e);
    expect(api.headers.get('content-type')).toContain('application/json');
    const page = await worker.fetch(new Request('https://x.test/jugadores'), e);
    expect(await page.text()).toContain('app');
  });

  it('el cron de 15 min corre el mercado y el de cada minuto las cartas', async () => {
    const e = env();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('no', { status: 403 }));
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} };
    await worker.scheduled({ cron: '*/15 * * * *', scheduledTime: Date.now() } as ScheduledController, e, ctx as unknown as ExecutionContext);
    await worker.scheduled({ cron: '* * * * *', scheduledTime: Date.now() } as ScheduledController, e, ctx as unknown as ExecutionContext);
    await Promise.all(waits);
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('market/cheapest-price-per-rating'))).toBe(true);
    expect(urls.some((u) => u.includes('players/v2/27/'))).toBe(true);
    fetchSpy.mockRestore();
  });
});
