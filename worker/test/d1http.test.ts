import { describe, expect, it } from 'vitest';
import { createHttpD1 } from '../src/sync/d1http';

function fakeApi(result: unknown, ok = true) {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get('authorization') });
    return new Response(JSON.stringify(ok ? { success: true, errors: [], result } : { success: false, errors: [{ code: 7500, message: 'no such table: x' }], result: null }),
      { status: ok ? 200 : 400 });
  };
  return { calls, db: createHttpD1({ accountId: 'acc', databaseId: 'db1', token: 'tok', fetcher }) };
}

describe('createHttpD1', () => {
  it('all() manda sql y params a la API de D1 con el token', async () => {
    const { calls, db } = fakeApi([{ results: [{ a: 1 }], success: true, meta: {} }]);
    const r = await db.prepare('SELECT ?1 AS a').bind(1).all<{ a: number }>();
    expect(r.results).toEqual([{ a: 1 }]);
    expect(calls[0]!.url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db1/query');
    expect(calls[0]!.body).toEqual({ sql: 'SELECT ?1 AS a', params: [1] });
    expect(calls[0]!.auth).toBe('Bearer tok');
  });

  it('first() devuelve la primera fila o null', async () => {
    expect(await fakeApi([{ results: [{ c: 3 }], success: true, meta: {} }]).db.prepare('SELECT 1').first()).toEqual({ c: 3 });
    expect(await fakeApi([{ results: [], success: true, meta: {} }]).db.prepare('SELECT 1').first()).toBeNull();
  });

  it('batch() manda todas las sentencias en una sola petición', async () => {
    const { calls, db } = fakeApi([{ results: [], success: true, meta: {} }, { results: [], success: true, meta: {} }]);
    await db.batch([db.prepare('INSERT INTO t VALUES (?1)').bind(1), db.prepare('DELETE FROM t')]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ batch: [{ sql: 'INSERT INTO t VALUES (?1)', params: [1] }, { sql: 'DELETE FROM t', params: [] }] });
  });

  it('lanza el mensaje de error de D1', async () => {
    await expect(fakeApi(null, false).db.prepare('SELECT * FROM x').all()).rejects.toThrow('no such table: x');
  });
});
