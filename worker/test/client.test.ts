import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FutggError, getJson } from '../src/futgg/client';
import { fixtureFetcher } from './d1';

describe('getJson', () => {
  it('devuelve el JSON validado y manda User-Agent de navegador', async () => {
    let ua = '';
    const f = async (_u: string, init?: RequestInit) => { ua = new Headers(init?.headers).get('user-agent') ?? ''; return new Response('{"a":1}'); };
    await expect(getJson(f, 'x/', z.object({ a: z.number() }))).resolves.toEqual({ a: 1 });
    expect(ua).toContain('Mozilla/5.0');
  });
  it('lanza FutggError con el status si FUT.GG bloquea', async () => {
    await expect(getJson(fixtureFetcher({ 'x/': 403 }), 'x/', z.object({}))).rejects.toMatchObject({ name: 'FutggError', status: 403 });
  });
  it('lanza FutggError si la forma cambió', async () => {
    await expect(getJson(fixtureFetcher({ 'x/': { b: 'no' } }), 'x/', z.object({ a: z.number() }))).rejects.toBeInstanceOf(FutggError);
  });
});
