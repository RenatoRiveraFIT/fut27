import { beforeEach, describe, expect, it } from 'vitest';
import page from './fixtures/players-page.json';
import floorsFx from './fixtures/cheapest-per-rating.json';
import overviewFx from './fixtures/cheapest-overview.json';
import { createTestDb, fixtureFetcher } from './d1';
import { playersPath, runPlayersBatch } from '../src/jobs/players';
import { FLOORS_PATH, OVERVIEW_PATH, runMarket } from '../src/jobs/market';
import { handleApi } from '../src/api/router';
import type { Env } from '../src/env';
import type { MetaResponse, PlayerDetailResponse, PlayersResponse } from '@fut27/shared';

const now = new Date('2026-09-27T12:00:00Z');
const uniqueCards = new Set(page.data.map((p) => p.eaId)).size;
let env: Env;

async function get<T>(path: string) {
  const res = await handleApi(new Request(`https://x.test${path}`), env, now);
  return { status: res.status, body: (await res.json()) as T };
}

beforeEach(async () => {
  const db = createTestDb();
  env = { DB: db, ASSETS: { fetch: async () => new Response('') } };
  await runPlayersBatch(db, fixtureFetcher({ [playersPath(0, 1)]: { ...page, next: null } }), { now, pagesPerRun: 1 });
  await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now });
});

describe('GET /api/players', () => {
  it('lista ordenado por valoración con precio resuelto y nombres de club/liga', async () => {
    const { status, body } = await get<PlayersResponse>('/api/players');
    expect(status).toBe(200);
    expect(body.items).toHaveLength(uniqueCards);
    expect(body.hasMore).toBe(false);
    const ovr = body.items.map((c) => c.overall);
    expect(ovr).toEqual([...ovr].sort((a, b) => b - a));
    expect(body.items[0]!.price.label).toBeTypeOf('string');
    expect(body.items.find((c) => c.isIcon)!.clubName).toBe('ICON');
  });

  it('busca sin importar acentos', async () => {
    const withAccent = page.data.find((p) => /[À-ſ]/.test(p.commonName ?? ''));
    const target = withAccent ?? page.data[0]!;
    const q = (target.commonName ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const { body } = await get<PlayersResponse>(`/api/players?q=${encodeURIComponent(q)}`);
    expect(body.items.map((c) => c.eaId)).toContain(target.eaId);
  });

  it('los comodines de LIKE se buscan literalmente', async () => {
    for (const q of ['%', '_', '%25']) {
      const { body } = await get<PlayersResponse>(`/api/players?q=${encodeURIComponent(q)}`);
      expect(body.items).toHaveLength(0);
    }
  });

  it('filtra por posición incluyendo alternativas y por tipo ícono', async () => {
    const withAlt = page.data.find((p) => (p.alternativePositions ?? []).length > 0)!;
    const alt = withAlt.alternativePositions![0]!;
    const { body } = await get<PlayersResponse>(`/api/players?pos=${alt}`);
    expect(body.items.map((c) => c.eaId)).toContain(withAlt.eaId);
    const icons = await get<PlayersResponse>('/api/players?type=icon');
    expect(icons.body.items.length).toBeGreaterThan(0);
    expect(icons.body.items.every((c) => c.isIcon)).toBe(true);
  });

  it('ignora parámetros numéricos inválidos', async () => {
    const { status } = await get<PlayersResponse>('/api/players?minOvr=abc&page=-3&league=x');
    expect(status).toBe(200);
  });
});

describe('GET /api/players/:eaId', () => {
  it('devuelve la carta, versiones e historial', async () => {
    const byBase = new Map<number, number[]>();
    for (const p of page.data) byBase.set(p.basePlayerEaId, [...(byBase.get(p.basePlayerEaId) ?? []), p.eaId]);
    const multi = [...byBase.values()].find((ids) => new Set(ids).size > 1);
    const id = multi ? multi[0]! : page.data[0]!.eaId;
    const { status, body } = await get<PlayerDetailResponse>(`/api/players/${id}`);
    expect(status).toBe(200);
    expect(body.card.eaId).toBe(id);
    if (multi) expect(body.versions.length).toBeGreaterThan(0);
    expect(Array.isArray(body.history.consola)).toBe(true);
  });
  it('404 si no existe', async () => {
    expect((await get('/api/players/1')).status).toBe(404);
  });
});

describe('costo de lecturas en D1', () => {
  it('ni el listado ni meta recorren toda la tabla players con COUNT o DISTINCT', async () => {
    const seen: string[] = [];
    const real = env.DB;
    env = { ...env, DB: { ...real, prepare: (sql: string) => { seen.push(sql); return real.prepare(sql); } } as D1Database };
    await get('/api/players');
    await get('/api/meta');
    expect(seen.filter((q) => /COUNT\(\*\)[\s\S]*FROM players/i.test(q) || /DISTINCT\s+rarity_name/i.test(q))).toEqual([]);
  });

  it('hasMore indica si hay otra página', async () => {
    const db = env.DB;
    const extra = Array.from({ length: 31 }, (_, i) => db.prepare(
      "INSERT INTO players (ea_id, base_ea_id, name, search_name, overall, position, alt_positions, rarity_name, is_icon, is_hero, is_sbc, is_objective, is_evo, stats, playstyles, playstyles_plus, hash, updated_at) VALUES (?1, ?1, 'X', 'x', 50, 'ST', '[]', 'Common', 0, 0, 0, 0, 0, '[]', '[]', '[]', 'h', 'now')",
    ).bind(900000 + i));
    await db.batch(extra);
    expect((await get<PlayersResponse>('/api/players')).body.hasMore).toBe(true);
  });
});

describe('GET /api/meta', () => {
  it('lista ligas, naciones, clubes, rarezas y posiciones', async () => {
    const { body } = await get<MetaResponse>('/api/meta');
    expect(body.leagues.length).toBeGreaterThan(0);
    expect(body.rarities).toContain(page.data[0]!.rarityName);
    expect(body.positions).toContain('GK');
  });
});
