import type { StatusResponse } from '@fut27/shared';

export async function getStatus(db: D1Database): Promise<Response> {
  const [sources, players, priced, cursor] = await Promise.all([
    db.prepare('SELECT source, last_ok, last_error, error_msg, detail FROM source_status ORDER BY source').all<Record<string, string | null>>(),
    db.prepare('SELECT COUNT(*) c FROM players').first<{ c: number }>(),
    db.prepare('SELECT COUNT(DISTINCT ea_id) c FROM prices').first<{ c: number }>(),
    db.prepare("SELECT cursor FROM sync_cursor WHERE job = 'players'").first<{ cursor: string }>(),
  ]);
  const body: StatusResponse = {
    sources: sources.results.map((s) => ({ source: s.source!, lastOk: s.last_ok ?? null, lastError: s.last_error ?? null, errorMsg: s.error_msg ?? null, detail: s.detail ?? null })),
    playerCount: players?.c ?? 0,
    pricedCount: priced?.c ?? 0,
    cursor: cursor ? JSON.parse(cursor.cursor) : null,
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
