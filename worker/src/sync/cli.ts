// Punto de entrada de la sincronización en GitHub Actions: `npx tsx worker/src/sync/cli.ts`.
import { createHttpD1 } from './d1http';
import { runSync, withDelay } from './run';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

const db = createHttpD1({
  accountId: required('CLOUDFLARE_ACCOUNT_ID'),
  databaseId: required('D1_DATABASE_ID'),
  token: required('CLOUDFLARE_API_TOKEN'),
});
const pagesPerRun = Math.max(1, Number(process.env.PAGES_PER_RUN) || 60);
const fetcher = withDelay((url, init) => fetch(url, init), 400);

const result = await runSync(db, fetcher, { now: new Date(), pagesPerRun });
console.log(JSON.stringify(result, null, 2));
if (result.market.error && result.players.error) process.exitCode = 1;
