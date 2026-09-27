import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Fetcher } from '../src/futgg/client';

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) { return new Stmt(this.db, this.sql, params); }
  private p() { return this.params.map((v) => (typeof v === 'boolean' ? Number(v) : v ?? null)) as never[]; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.p()) as T[], success: true, meta: {} }; }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.p()) as T | undefined) ?? null; }
  async run() { const r = this.db.prepare(this.sql).run(...this.p()); return { success: true, meta: { changes: Number(r.changes) } }; }
  runSync() { return this.db.prepare(this.sql).run(...this.p()); }
}

export function createTestDb(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url).href), 'utf8'));
  const api = {
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try { const out = stmts.map((s) => s.runSync()); db.exec('COMMIT'); return out.map(() => ({ success: true })); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
  };
  return api as unknown as D1Database;
}

/** Responde según el path relativo a FUTGG_BASE. Un número = código HTTP de error. */
export function fixtureFetcher(map: Record<string, unknown>): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const key = url.replace('https://www.fut.gg/api/fut/', '');
    const v = map[key];
    if (v === undefined) return new Response('<html>Not Found</html>', { status: 404 });
    if (typeof v === 'number') return new Response('<html>blocked</html>', { status: v });
    return new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as Fetcher & { calls: string[] };
  f.calls = calls;
  return f;
}
