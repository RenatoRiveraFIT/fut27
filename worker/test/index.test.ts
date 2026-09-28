import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { createTestDb } from './d1';

describe('worker', () => {
  it('rutas /api van a la API y el resto a los assets', async () => {
    const e = { DB: createTestDb(), ASSETS: { fetch: vi.fn(async () => new Response('<html>app</html>')) } };
    const api = await worker.fetch(new Request('https://x.test/api/status'), e);
    expect(api.headers.get('content-type')).toContain('application/json');
    const page = await worker.fetch(new Request('https://x.test/jugadores'), e);
    expect(await page.text()).toContain('app');
  });
});
