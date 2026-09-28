import type { Fetcher } from '../futgg/client';

/**
 * D1 a través de la API HTTP de Cloudflare, con la misma interfaz que el binding del Worker.
 * La usa la sincronización que corre en GitHub Actions (FUT.GG bloquea las peticiones que salen de Workers).
 */
interface Options { accountId: string; databaseId: string; token: string; fetcher?: Fetcher }
interface QueryResult { results: unknown[]; success: boolean; meta: Record<string, unknown> }

class HttpStmt {
  constructor(private api: HttpApi, readonly sql: string, readonly params: unknown[] = []) {}
  bind(...params: unknown[]) { return new HttpStmt(this.api, this.sql, params); }
  async all<T>() { const [r] = await this.api.query([this]); return { results: r!.results as T[], success: true, meta: r!.meta }; }
  async first<T>() { const { results } = await this.all<T>(); return results[0] ?? null; }
  async run() { const [r] = await this.api.query([this]); return { success: true, meta: r!.meta }; }
}

class HttpApi {
  private url: string;
  constructor(private o: Options) {
    this.url = `https://api.cloudflare.com/client/v4/accounts/${o.accountId}/d1/database/${o.databaseId}/query`;
  }
  async query(stmts: HttpStmt[]): Promise<QueryResult[]> {
    const one = (s: HttpStmt) => ({ sql: s.sql, params: s.params.map((v) => v ?? null) });
    const body = stmts.length === 1 ? one(stmts[0]!) : { batch: stmts.map(one) };
    const res = await (this.o.fetcher ?? fetch)(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.o.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[]; result?: QueryResult[] } | null;
    if (!res.ok || !json?.success || !json.result) {
      throw new Error(`D1 HTTP ${res.status}: ${json?.errors?.map((e) => e.message).join('; ') ?? 'respuesta inválida'}`);
    }
    return json.result;
  }
}

export function createHttpD1(o: Options): D1Database {
  const api = new HttpApi(o);
  const db = {
    prepare: (sql: string) => new HttpStmt(api, sql),
    async batch(stmts: HttpStmt[]) { return stmts.length ? api.query(stmts) : []; },
  };
  return db as unknown as D1Database;
}
