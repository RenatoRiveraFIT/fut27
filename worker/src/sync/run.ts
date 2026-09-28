import type { Fetcher } from '../futgg/client';
import { runMarket } from '../jobs/market';
import { runPlayersBatch } from '../jobs/players';

type Sleep = (ms: number) => Promise<void>;
const sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espacia las peticiones a FUT.GG para no martillar su API. */
export function withDelay(fetcher: Fetcher, ms: number, wait: Sleep = sleep): Fetcher {
  let first = true;
  return async (url, init) => {
    if (!first) await wait(ms);
    first = false;
    return fetcher(url, init);
  };
}

export async function runSync(db: D1Database, fetcher: Fetcher, opts: { now: Date; pagesPerRun: number }) {
  const market = await runMarket(db, fetcher, { now: opts.now });
  const players = await runPlayersBatch(db, fetcher, opts);
  return { market, players };
}

/** Código de salida del job: distinto de 0 si falló cualquier fuente, así GitHub marca la corrida y avisa por correo. */
export function exitCode(r: { market: { error?: string }; players: { error?: string } }): number {
  return r.market.error || r.players.error ? 1 : 0;
}
