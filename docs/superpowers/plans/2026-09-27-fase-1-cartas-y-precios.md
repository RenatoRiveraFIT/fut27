# Fase 1 — Base de cartas y precios · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar en Cloudflare una app que sincroniza las ~19.900 cartas de FC 27 y los precios libres de FUT.GG, y las muestra en las pantallas Jugadores, Ficha, Mercado y Estado.

**Architecture:** Un solo Cloudflare Worker hace tres cosas: corre los cron de scraping (FUT.GG → D1), expone la API JSON en `/api/*` y sirve la web React compilada como assets estáticos (mismo origen, sin CORS). La lógica pura (tipos, resolución de precios, formato) vive en `shared/` y la usan el Worker y la web.

**Tech Stack:** npm workspaces · TypeScript 5.9 · Cloudflare Workers + D1 + Static Assets (wrangler 4) · zod 4 · Vitest 4 (en Node, con `node:sqlite` como sustituto de D1) · Vite 8 + React 19 + react-router-dom 7.

**Spec:** `docs/superpowers/specs/2026-09-27-fut27-design.md`

## Global Constraints

- Solo mercado **PC** como objetivo; los precios libres de FUT.GG se etiquetan `consola`.
- Etiquetas de precio exactas: `pc`, `consola`, `estimado`, `no_transferible`, `sin_precio`.
- Plan gratis de Cloudflare: máx. 50 subrequests por invocación; D1 100.000 filas escritas/día. `PAGES_PER_RUN` por defecto `4`.
- FUT.GG corta en 10.000 resultados por consulta → recorrer por tramos de valoración `[0,59] [60,64] [65,69] [70,74] [75,79] [80,84] [85,99]`.
- Todas las peticiones a FUT.GG llevan User-Agent de navegador y rutas con barra final.
- Nunca sobrescribir datos buenos con una respuesta inválida; registrar en `source_status`.
- Textos de la interfaz en español neutro.
- Cambio respecto al spec: la web se sirve como Static Assets del mismo Worker en lugar de Cloudflare Pages (un solo deploy, sin CORS).

## Fuera de esta fase

- Detalle completo bajo demanda (`player-item-definitions`), nombres de PlayStyles, filtro por rango de precio y "en mi club": fases 2–3.
- SBCs, evoluciones, club, armador y alertas: fases 2–5.

## Review Focus

1. **Un tramo de valoración alcanza 10.000 cartas** (FUT.GG agrega cartas): el job debe marcar error en `source_status` indicando el tramo, en vez de truncar en silencio. → test en Task 4.
2. **FUT.GG responde 403/HTML o cambia la forma del JSON**: no se escribe nada, el cursor no avanza y el estado muestra el error. → tests en Tasks 3, 4 y 5.
3. **Precio de consola viejo** (la carta dejó de aparecer en "más baratas"): con más de 48 h no se muestra como vigente; cae a `estimado`/`sin_precio`. → test en Task 2.
4. **Piso en 0 o valoración sin piso** (FUT.GG entrega `"96":0`): no se usa como precio ni como pista. → tests en Tasks 2 y 5.
5. **Búsqueda con acentos o comodines** (`mbappe` debe encontrar "Mbappé"; `%` o `_` no deben listar todo): normalización y `LIKE … ESCAPE`. → test en Task 6.

---

## Estructura de archivos

```
package.json                 workspaces + scripts raíz
tsconfig.base.json
shared/
  package.json  tsconfig.json  vitest.config.ts
  src/index.ts               re-exporta todo
  src/types.ts               Card, PriceRow, ResolvedPrice, CardWithPrice, respuestas de API
  src/price.ts               resolvePrice()
  src/format.ts              formatCoins(), normalizeText()
  test/price.test.ts  test/format.test.ts
worker/
  package.json  tsconfig.json  vitest.config.ts  wrangler.toml
  migrations/0001_init.sql
  src/index.ts               fetch + scheduled
  src/env.ts                 Env
  src/status.ts              markOk(), markError()
  src/futgg/client.ts        getJson(), FutggError, FUTGG_BASE, BROWSER_UA
  src/futgg/schemas.ts       zod de páginas de jugadores y mercado
  src/futgg/mapPlayer.ts     toPlayerRow()
  src/db/players.ts          upsertPlayerPage(), rowToCard()
  src/jobs/players.ts        runPlayersBatch(), RATING_BUCKETS
  src/jobs/market.ts         runMarket()
  src/market/movers.ts       computeMovers()
  src/api/router.ts          handleApi()
  src/api/players.ts  src/api/market.ts  src/api/status.ts  src/api/http.ts
  test/d1.ts                 adaptador node:sqlite con la interfaz de D1
  test/fixtures/*.json
  test/*.test.ts
web/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/main.tsx  src/App.tsx  src/api.ts  src/styles.css
  src/components/{PriceTag,CardRow,LineChart,Filters}.tsx
  src/pages/{PlayersPage,PlayerPage,MarketPage,StatusPage}.tsx
  src/query.ts               buildPlayersQuery()
  test/query.test.ts  test/PriceTag.test.tsx
```

---

### Task 1: Monorepo y paquete `shared` con tipos y formato

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/vitest.config.ts`, `shared/src/index.ts`, `shared/src/types.ts`, `shared/src/format.ts`
- Test: `shared/test/format.test.ts`

**Interfaces:**
- Produces: `formatCoins(n: number): string`, `normalizeText(s: string): string`, tipos `Platform`, `PriceLabel`, `Card`, `PriceRow`, `ResolvedPrice`, `CardWithPrice`, `PlayersResponse`, `PlayerDetailResponse`, `MetaResponse`, `FloorsResponse`, `MoversResponse`, `StatusResponse`, `Mover`, `SourceStatus`, `FaceStat`.

- [ ] **Step 1: Archivos raíz**

`package.json`:
```json
{
  "name": "fut27",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "worker", "web"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "build": "npm run build -w web",
    "deploy": "npm run build && npm run deploy -w worker"
  },
  "devDependencies": {
    "typescript": "~5.9.3",
    "vitest": "^4.1.11"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "isolatedModules": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.wrangler/
.dev.vars
*.log
```

`shared/package.json`:
```json
{
  "name": "@fut27/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc -p tsconfig.json" }
}
```

`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

`shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 2: Tipos**

`shared/src/types.ts`:
```ts
export type Platform = 'pc' | 'consola';
export type PriceLabel = 'pc' | 'consola' | 'estimado' | 'no_transferible' | 'sin_precio';

export interface FaceStat { label: string; value: number }

export interface Card {
  eaId: number;
  baseEaId: number;
  name: string;
  overall: number;
  position: string;
  altPositions: string[];
  clubId: number | null;
  clubName: string | null;
  leagueId: number | null;
  leagueName: string | null;
  nationId: number | null;
  nationName: string | null;
  rarityName: string;
  isIcon: boolean;
  isHero: boolean;
  isSbc: boolean;
  isObjective: boolean;
  isEvo: boolean;
  stats: FaceStat[];
  skillMoves: number | null;
  weakFoot: number | null;
  foot: string | null;
  height: number | null;
  age: number | null;
  playstyles: number[];
  playstylesPlus: number[];
  imageUrl: string | null;
}

export interface PriceRow { platform: Platform; price: number; source: string; updatedAt: string }

export interface ResolvedPrice {
  label: PriceLabel;
  value: number | null;
  updatedAt: string | null;
  /** Piso de consola de la valoración, como pista cuando no hay precio. */
  floorHint: number | null;
}

export type CardWithPrice = Card & { price: ResolvedPrice };

export interface PlayersResponse { items: CardWithPrice[]; page: number; pageSize: number; total: number }
export interface PricePoint { ts: string; price: number }
export interface PlayerDetailResponse {
  card: CardWithPrice;
  versions: CardWithPrice[];
  history: { pc: PricePoint[]; consola: PricePoint[] };
}
export interface NamedRef { id: number; name: string }
export interface MetaResponse { leagues: NamedRef[]; nations: NamedRef[]; clubs: NamedRef[]; rarities: string[]; positions: string[] }
export interface FloorsResponse {
  platform: Platform;
  current: { rating: number; price: number; updatedAt: string }[];
  history: { rating: number; ts: string; price: number }[];
}
export interface Mover { card: CardWithPrice; from: number; to: number; changePct: number }
export interface MoversResponse { platform: Platform; up: Mover[]; down: Mover[] }
export interface SourceStatus { source: string; lastOk: string | null; lastError: string | null; errorMsg: string | null; detail: string | null }
export interface StatusResponse { sources: SourceStatus[]; playerCount: number; pricedCount: number; cursor: unknown }
```

- [ ] **Step 3: Test de formato (falla)**

`shared/test/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatCoins, normalizeText } from '../src/format';

describe('formatCoins', () => {
  it('muestra números chicos completos', () => expect(formatCoins(650)).toBe('650'));
  it('usa K para miles', () => expect(formatCoins(27000)).toBe('27K'));
  it('usa un decimal en K cuando hace falta', () => expect(formatCoins(25250)).toBe('25,3K'));
  it('usa M para millones', () => expect(formatCoins(1885000)).toBe('1,89M'));
});

describe('normalizeText', () => {
  it('quita acentos y pasa a minúsculas', () => expect(normalizeText('Kylian Mbappé')).toBe('kylian mbappe'));
  it('colapsa espacios', () => expect(normalizeText('  Vini   Jr. ')).toBe('vini jr.'));
});
```

- [ ] **Step 4: Ejecutar y ver que falla**

Run: `npm install` y luego `npm test -w shared`
Expected: FAIL — `Cannot find module '../src/format'`

- [ ] **Step 5: Implementar**

`shared/src/format.ts`:
```ts
function trim(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(/\.?0+$/, '').replace('.', ',');
}

export function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000, 2)}M`;
  if (n >= 1_000) return `${trim(n / 1_000, 1)}K`;
  return String(n);
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
```

`shared/src/index.ts`:
```ts
export * from './types';
export * from './format';
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `npm test -w shared` → PASS (6 tests). Run: `npm run typecheck -w shared` → sin errores.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(shared): monorepo, tipos de dominio y formato de monedas"
```

---

### Task 2: Resolución de precios

**Files:**
- Create: `shared/src/price.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/price.test.ts`

**Interfaces:**
- Consumes: `PriceRow`, `ResolvedPrice`, `Card` de Task 1.
- Produces: `resolvePrice(input: ResolvePriceInput): ResolvedPrice`, `CONSOLA_MAX_AGE_MS`, `ESTIMABLE_RARITIES`, `type Floors = Record<number, number>`.

- [ ] **Step 1: Test (falla)**

`shared/test/price.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolvePrice } from '../src/price';

const now = new Date('2026-09-27T12:00:00Z');
const base = { overall: 86, rarityName: 'Rare', isSbc: false, isObjective: false, isEvo: false };
const floors = { 86: 3700, 96: 0 };
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe('resolvePrice', () => {
  it('cartas de SBC, objetivos o evoluciones no son transferibles', () => {
    for (const flag of ['isSbc', 'isObjective', 'isEvo'] as const) {
      const r = resolvePrice({ card: { ...base, [flag]: true }, prices: [], floors, now });
      expect(r.label).toBe('no_transferible');
      expect(r.value).toBeNull();
    }
  });

  it('prefiere PC aunque sea antiguo', () => {
    const r = resolvePrice({
      card: base, floors, now,
      prices: [
        { platform: 'consola', price: 3500, source: 'futgg', updatedAt: hoursAgo(1) },
        { platform: 'pc', price: 4100, source: 'captura', updatedAt: hoursAgo(72) },
      ],
    });
    expect(r).toEqual({ label: 'pc', value: 4100, updatedAt: hoursAgo(72), floorHint: 3700 });
  });

  it('usa consola si es reciente', () => {
    const r = resolvePrice({ card: base, floors, now, prices: [{ platform: 'consola', price: 3500, source: 'futgg', updatedAt: hoursAgo(47) }] });
    expect(r.label).toBe('consola');
    expect(r.value).toBe(3500);
  });

  it('ignora consola con más de 48 h y estima con el piso', () => {
    const r = resolvePrice({ card: base, floors, now, prices: [{ platform: 'consola', price: 3500, source: 'futgg', updatedAt: hoursAgo(49) }] });
    expect(r).toEqual({ label: 'estimado', value: 3700, updatedAt: null, floorHint: 3700 });
  });

  it('cartas especiales sin precio quedan sin_precio con pista', () => {
    const r = resolvePrice({ card: { ...base, rarityName: 'Team of the week' }, prices: [], floors, now });
    expect(r).toEqual({ label: 'sin_precio', value: null, updatedAt: null, floorHint: 3700 });
  });

  it('un piso en 0 no cuenta como precio ni como pista', () => {
    const r = resolvePrice({ card: { ...base, overall: 96 }, prices: [], floors, now });
    expect(r).toEqual({ label: 'sin_precio', value: null, updatedAt: null, floorHint: null });
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -w shared` → FAIL — `Cannot find module '../src/price'`

- [ ] **Step 3: Implementar**

`shared/src/price.ts`:
```ts
import type { Card, PriceRow, ResolvedPrice } from './types';

export type Floors = Record<number, number>;
export const CONSOLA_MAX_AGE_MS = 48 * 3_600_000;
/** Rarezas cuyo precio real suele ser el piso de su valoración. */
export const ESTIMABLE_RARITIES = new Set(['Common', 'Rare']);

export interface ResolvePriceInput {
  card: Pick<Card, 'overall' | 'rarityName' | 'isSbc' | 'isObjective' | 'isEvo'>;
  prices: PriceRow[];
  floors: Floors;
  now: Date;
}

export function resolvePrice({ card, prices, floors, now }: ResolvePriceInput): ResolvedPrice {
  const rawFloor = floors[card.overall];
  const floorHint = rawFloor && rawFloor > 0 ? rawFloor : null;

  if (card.isSbc || card.isObjective || card.isEvo) {
    return { label: 'no_transferible', value: null, updatedAt: null, floorHint: null };
  }
  const pc = prices.find((p) => p.platform === 'pc');
  if (pc) return { label: 'pc', value: pc.price, updatedAt: pc.updatedAt, floorHint };

  const consola = prices.find((p) => p.platform === 'consola');
  if (consola && now.getTime() - Date.parse(consola.updatedAt) <= CONSOLA_MAX_AGE_MS) {
    return { label: 'consola', value: consola.price, updatedAt: consola.updatedAt, floorHint };
  }
  if (floorHint !== null && ESTIMABLE_RARITIES.has(card.rarityName)) {
    return { label: 'estimado', value: floorHint, updatedAt: null, floorHint };
  }
  return { label: 'sin_precio', value: null, updatedAt: null, floorHint };
}
```

Agregar a `shared/src/index.ts`:
```ts
export * from './price';
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -w shared` → PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): resolución de precios pc/consola/estimado"
```

---

### Task 3: Worker base — esquema D1, adaptador de pruebas, cliente FUT.GG y mapeo de cartas

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/wrangler.toml`, `worker/migrations/0001_init.sql`
- Create: `worker/src/env.ts`, `worker/src/futgg/client.ts`, `worker/src/futgg/schemas.ts`, `worker/src/futgg/mapPlayer.ts`
- Create: `worker/test/d1.ts`, `worker/test/fixtures/players-page.json`, `worker/test/fixtures/cheapest-per-rating.json`, `worker/test/fixtures/cheapest-overview.json`
- Test: `worker/test/client.test.ts`, `worker/test/mapPlayer.test.ts`

**Interfaces:**
- Produces:
  - `type Fetcher = (url: string, init?: RequestInit) => Promise<Response>`
  - `getJson<T>(fetcher: Fetcher, path: string, schema: z.ZodType<T>): Promise<T>` — lanza `FutggError(status, message)`
  - `playersPageSchema`, `cheapestPerRatingSchema`, `cheapestOverviewSchema`, `type FutggPlayer`
  - `toPlayerRow(p: FutggPlayer, now: string): PlayerRow` y `interface PlayerRow` (columnas de `players` + `club`, `league`, `nation` refs)
  - `createTestDb(): D1Database` (tests) y `fixtureFetcher(map: Record<string, unknown | number>): Fetcher`
  - `interface Env { DB: D1Database; ASSETS: Fetcher-like; PAGES_PER_RUN: string }`

- [ ] **Step 1: Configuración del paquete**

`worker/package.json`:
```json
{
  "name": "@fut27/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "@fut27/shared": "*", "zod": "^4.6.5" },
  "devDependencies": { "wrangler": "^4.142.0", "@cloudflare/workers-types": "^5.20260927.1", "@types/node": "^24.0.0" }
}
```

`worker/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["@cloudflare/workers-types", "node"], "lib": ["ES2022"] },
  "include": ["src", "test"]
}
```

`worker/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } });
```

`worker/wrangler.toml` (el `database_id` se completa en Task 11):
```toml
name = "fut27"
main = "src/index.ts"
compatibility_date = "2026-09-01"

[triggers]
crons = ["* * * * *", "*/15 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "fut27"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "migrations"

[assets]
directory = "../web/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[vars]
PAGES_PER_RUN = "4"
```

- [ ] **Step 2: Migración**

`worker/migrations/0001_init.sql`:
```sql
CREATE TABLE players (
  ea_id INTEGER PRIMARY KEY,
  base_ea_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  search_name TEXT NOT NULL,
  overall INTEGER NOT NULL,
  position TEXT NOT NULL,
  alt_positions TEXT NOT NULL,
  club_id INTEGER,
  league_id INTEGER,
  nation_id INTEGER,
  rarity_name TEXT NOT NULL,
  is_icon INTEGER NOT NULL,
  is_hero INTEGER NOT NULL,
  is_sbc INTEGER NOT NULL,
  is_objective INTEGER NOT NULL,
  is_evo INTEGER NOT NULL,
  stats TEXT NOT NULL,
  skill_moves INTEGER,
  weak_foot INTEGER,
  foot TEXT,
  height INTEGER,
  age INTEGER,
  playstyles TEXT NOT NULL,
  playstyles_plus TEXT NOT NULL,
  image_url TEXT,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_players_overall ON players(overall DESC);
CREATE INDEX idx_players_base ON players(base_ea_id);

CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, league_id INTEGER);
CREATE TABLE leagues (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE nations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE prices (
  ea_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  price INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ea_id, platform)
);
CREATE TABLE price_history (ea_id INTEGER NOT NULL, platform TEXT NOT NULL, ts TEXT NOT NULL, price INTEGER NOT NULL);
CREATE INDEX idx_price_history ON price_history(platform, ts);
CREATE INDEX idx_price_history_card ON price_history(ea_id, platform, ts);

CREATE TABLE floors (rating INTEGER NOT NULL, platform TEXT NOT NULL, price INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (rating, platform));
CREATE TABLE floor_history (rating INTEGER NOT NULL, platform TEXT NOT NULL, ts TEXT NOT NULL, price INTEGER NOT NULL);
CREATE INDEX idx_floor_history ON floor_history(platform, ts);

CREATE TABLE sync_cursor (job TEXT PRIMARY KEY, cursor TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE source_status (source TEXT PRIMARY KEY, last_ok TEXT, last_error TEXT, error_msg TEXT, detail TEXT);
```

- [ ] **Step 3: Adaptador D1 sobre `node:sqlite` para tests**

`worker/test/d1.ts`:
```ts
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
  db.exec(readFileSync(fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url)), 'utf8'));
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
```

- [ ] **Step 4: Fixtures reales (recortados)**

Descargar y recortar (ejecutar desde `worker/`):
```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
mkdir -p test/fixtures
curl -s -A "$UA" "https://www.fut.gg/api/fut/players/v2/27/?page=1" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
const pick=[j.data.find(x=>x.isIcon), j.data.find(x=>x.position==="GK"), ...j.data.filter(x=>!x.isIcon).slice(0,3)];
const seen=new Set(); j.data=pick.filter(x=>x&&!seen.has(x.eaId)&&seen.add(x.eaId)); j.next=2;
require("fs").writeFileSync("test/fixtures/players-page.json", JSON.stringify(j,null,1));})'
curl -s -A "$UA" "https://www.fut.gg/api/fut/market/cheapest-price-per-rating/" > test/fixtures/cheapest-per-rating.json
curl -s -A "$UA" "https://www.fut.gg/api/fut/market/27/cheapest-by-rating/v2/overview/" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
for(const k of Object.keys(j.data)){ if(!["85","86"].includes(k)) delete j.data[k]; else j.data[k]=j.data[k].slice(0,2); }
require("fs").writeFileSync("test/fixtures/cheapest-overview.json", JSON.stringify(j,null,1));})'
```
Verificar: `players-page.json` tiene 4–5 cartas incluyendo un ícono y un arquero; `cheapest-overview.json` tiene claves `85` y `86` con 2 cartas cada una.

- [ ] **Step 5: Tests del cliente y del mapeo (fallan)**

`worker/test/client.test.ts`:
```ts
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
```

`worker/test/mapPlayer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import page from './fixtures/players-page.json';
import { playersPageSchema } from '../src/futgg/schemas';
import { toPlayerRow } from '../src/futgg/mapPlayer';

const parsed = playersPageSchema.parse(page);
const now = '2026-09-27T12:00:00.000Z';

describe('toPlayerRow', () => {
  it('ícono usa el club ICON (uniqueClub) y la liga Icons', () => {
    const icon = parsed.data.find((p) => p.isIcon)!;
    const row = toPlayerRow(icon, now);
    expect(row.is_icon).toBe(1);
    expect(row.club).toEqual({ id: 112658, name: 'ICON', leagueId: 2118 });
    expect(row.league?.id).toBe(2118);
  });
  it('arquero usa las stats de portero', () => {
    const gk = parsed.data.find((p) => p.position === 'GK')!;
    const labels = JSON.parse(toPlayerRow(gk, now).stats).map((s: { label: string }) => s.label);
    expect(labels).toEqual(['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS']);
  });
  it('genera nombre de búsqueda sin acentos e incluye nombre completo', () => {
    const p = parsed.data.find((x) => !x.isIcon)!;
    const row = toPlayerRow(p, now);
    expect(row.search_name).toBe(row.search_name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    expect(row.search_name).toContain((p.lastName ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  });
  it('el hash no depende de updated_at', () => {
    const p = parsed.data[0]!;
    expect(toPlayerRow(p, now).hash).toBe(toPlayerRow(p, '2030-01-01T00:00:00.000Z').hash);
  });
});
```

- [ ] **Step 6: Ejecutar y ver que fallan**

Run: `npm install` y `npm test -w worker` → FAIL — módulos `../src/futgg/*` no existen.

- [ ] **Step 7: Implementar cliente, esquemas y mapeo**

`worker/src/futgg/client.ts`:
```ts
import type { z } from 'zod';

export const FUTGG_BASE = 'https://www.fut.gg/api/fut/';
export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class FutggError extends Error {
  override name = 'FutggError';
  constructor(public status: number, message: string) { super(message); }
}

export async function getJson<T>(fetcher: Fetcher, path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetcher(FUTGG_BASE + path, { headers: { 'user-agent': BROWSER_UA, accept: 'application/json' } });
  if (!res.ok) throw new FutggError(res.status, `FUT.GG ${res.status} en ${path}`);
  let body: unknown;
  try { body = await res.json(); } catch { throw new FutggError(res.status, `FUT.GG devolvió algo que no es JSON en ${path}`); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new FutggError(res.status, `Forma inesperada en ${path}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
```

`worker/src/futgg/schemas.ts`:
```ts
import { z } from 'zod';

const ref = z.object({ eaId: z.number(), name: z.string() });
const clubRef = ref.extend({ leagueEaId: z.number().nullish() });

export const futggPlayerSchema = z.object({
  eaId: z.number(),
  basePlayerEaId: z.number(),
  overall: z.number(),
  commonName: z.string().nullish(),
  cardName: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  position: z.string(),
  alternativePositions: z.array(z.string()).nullish(),
  uniqueClub: clubRef.nullish(),
  league: ref.nullish(),
  nation: ref.nullish(),
  rarityName: z.string(),
  isIcon: z.boolean(),
  isHero: z.boolean(),
  isSbc: z.boolean(),
  isObjective: z.boolean(),
  isEvolutionPlayerItem: z.boolean(),
  faceStatsV2: z.record(z.string(), z.number().nullable()).nullish(),
  skillMoves: z.number().nullish(),
  weakFoot: z.number().nullish(),
  foot: z.string().nullish(),
  height: z.number().nullish(),
  age: z.number().nullish(),
  playStyleEaIds: z.array(z.number()).nullish(),
  playStylePlusEaIds: z.array(z.number()).nullish(),
  cardImageUrl: z.string().nullish(),
});
export type FutggPlayer = z.infer<typeof futggPlayerSchema>;

export const playersPageSchema = z.object({
  data: z.array(futggPlayerSchema),
  next: z.number().nullable(),
  total: z.number(),
});

export const cheapestPerRatingSchema = z.object({ data: z.record(z.string(), z.number()) });

export const cheapestOverviewSchema = z.object({
  data: z.record(z.string(), z.array(z.object({ price: z.number(), eaId: z.number(), name: z.string(), overall: z.number() }))),
});
```

`worker/src/futgg/mapPlayer.ts`:
```ts
import { normalizeText } from '@fut27/shared';
import type { FutggPlayer } from './schemas';

export interface PlayerRow {
  ea_id: number; base_ea_id: number; name: string; search_name: string; overall: number;
  position: string; alt_positions: string; club_id: number | null; league_id: number | null; nation_id: number | null;
  rarity_name: string; is_icon: number; is_hero: number; is_sbc: number; is_objective: number; is_evo: number;
  stats: string; skill_moves: number | null; weak_foot: number | null; foot: string | null; height: number | null; age: number | null;
  playstyles: string; playstyles_plus: string; image_url: string | null; hash: string; updated_at: string;
  club: { id: number; name: string; leagueId: number | null } | null;
  league: { id: number; name: string } | null;
  nation: { id: number; name: string } | null;
}

const OUTFIELD: [string, string][] = [['PAC', 'facePace'], ['SHO', 'faceShooting'], ['PAS', 'facePassing'], ['DRI', 'faceDribbling'], ['DEF', 'faceDefending'], ['PHY', 'facePhysicality']];
const KEEPER: [string, string][] = [['DIV', 'gkFaceDiving'], ['HAN', 'gkFaceHandling'], ['KIC', 'gkFaceKicking'], ['REF', 'gkFaceReflexes'], ['SPD', 'gkFaceSpeed'], ['POS', 'gkFacePositioning']];

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export function toPlayerRow(p: FutggPlayer, now: string): PlayerRow {
  const name = p.commonName || p.cardName || [p.firstName, p.lastName].filter(Boolean).join(' ') || String(p.eaId);
  const face = p.faceStatsV2 ?? {};
  const stats = (p.position === 'GK' ? KEEPER : OUTFIELD).map(([label, key]) => ({ label, value: face[key] ?? 0 }));
  const row: Omit<PlayerRow, 'hash' | 'updated_at'> = {
    ea_id: p.eaId,
    base_ea_id: p.basePlayerEaId,
    name,
    search_name: normalizeText([name, p.firstName, p.lastName].filter(Boolean).join(' ')),
    overall: p.overall,
    position: p.position,
    alt_positions: JSON.stringify(p.alternativePositions ?? []),
    club_id: p.uniqueClub?.eaId ?? null,
    league_id: p.league?.eaId ?? null,
    nation_id: p.nation?.eaId ?? null,
    rarity_name: p.rarityName,
    is_icon: Number(p.isIcon), is_hero: Number(p.isHero), is_sbc: Number(p.isSbc),
    is_objective: Number(p.isObjective), is_evo: Number(p.isEvolutionPlayerItem),
    stats: JSON.stringify(stats),
    skill_moves: p.skillMoves ?? null, weak_foot: p.weakFoot ?? null, foot: p.foot ?? null,
    height: p.height ?? null, age: p.age ?? null,
    playstyles: JSON.stringify(p.playStyleEaIds ?? []),
    playstyles_plus: JSON.stringify(p.playStylePlusEaIds ?? []),
    image_url: p.cardImageUrl ?? null,
    club: p.uniqueClub ? { id: p.uniqueClub.eaId, name: p.uniqueClub.name, leagueId: p.uniqueClub.leagueEaId ?? null } : null,
    league: p.league ? { id: p.league.eaId, name: p.league.name } : null,
    nation: p.nation ? { id: p.nation.eaId, name: p.nation.name } : null,
  };
  return { ...row, hash: fnv1a(JSON.stringify(row)), updated_at: now };
}
```

`worker/src/env.ts`:
```ts
export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PAGES_PER_RUN: string;
}
```

- [ ] **Step 8: Ejecutar y ver que pasan**

Run: `npm test -w worker` → PASS (7 tests). Si zod rechaza el fixture, ajustar el esquema a la forma real (campo `nullish`), no el fixture.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(worker): esquema D1, cliente FUT.GG validado y mapeo de cartas"
```

---

### Task 4: Job de sincronización de cartas por tramos y cursor

**Files:**
- Create: `worker/src/status.ts`, `worker/src/db/players.ts`, `worker/src/jobs/players.ts`
- Test: `worker/test/playersJob.test.ts`

**Interfaces:**
- Consumes: `getJson`, `playersPageSchema`, `toPlayerRow`, `PlayerRow`, `createTestDb`, `fixtureFetcher`.
- Produces:
  - `markOk(db, source, detail?: string, now: string)`, `markError(db, source, msg: string, now: string)`
  - `upsertPlayerPage(db, rows: PlayerRow[]): Promise<void>`
  - `RATING_BUCKETS: [number, number][]`, `interface PlayersCursor { bucket: number; page: number; cycleDate: string; done: boolean }`
  - `runPlayersBatch(db, fetcher, opts: { now: Date; pagesPerRun: number }): Promise<{ pages: number; cursor: PlayersCursor; error?: string }>`
  - `playersPath(bucket: number, page: number): string`

- [ ] **Step 1: Test (falla)**

`worker/test/playersJob.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import page from './fixtures/players-page.json';
import { createTestDb, fixtureFetcher } from './d1';
import { playersPath, RATING_BUCKETS, runPlayersBatch } from '../src/jobs/players';

const now = new Date('2026-09-27T12:00:00Z');
const lastPage = { ...page, next: null };

function allBucketsOnePage() {
  const map: Record<string, unknown> = {};
  RATING_BUCKETS.forEach((_, b) => { map[playersPath(b, 1)] = lastPage; });
  return map;
}

describe('runPlayersBatch', () => {
  it('guarda cartas, clubes, ligas y naciones y avanza el cursor', async () => {
    const db = createTestDb();
    const f = fixtureFetcher({ [playersPath(0, 1)]: page, [playersPath(0, 2)]: lastPage });
    const r = await runPlayersBatch(db, f, { now, pagesPerRun: 2 });
    expect(r.pages).toBe(2);
    expect(r.cursor).toMatchObject({ bucket: 1, page: 1, done: false });
    const n = await db.prepare('SELECT COUNT(*) c FROM players').first<{ c: number }>();
    expect(n!.c).toBe(page.data.length);
    expect((await db.prepare('SELECT name FROM clubs WHERE id = 112658').first<{ name: string }>())!.name).toBe('ICON');
  });

  it('retoma desde el cursor en la siguiente ejecución y cierra el ciclo', async () => {
    const db = createTestDb();
    const f = fixtureFetcher(allBucketsOnePage());
    await runPlayersBatch(db, f, { now, pagesPerRun: 4 });
    const r = await runPlayersBatch(db, f, { now, pagesPerRun: 4 });
    expect(r.cursor.done).toBe(true);
    expect(f.calls).toHaveLength(RATING_BUCKETS.length);
    const again = await runPlayersBatch(db, f, { now, pagesPerRun: 4 });
    expect(again.pages).toBe(0);
    const tomorrow = await runPlayersBatch(db, f, { now: new Date('2026-09-28T00:05:00Z'), pagesPerRun: 4 });
    expect(tomorrow.pages).toBe(4);
  });

  it('no reescribe cartas sin cambios', async () => {
    const db = createTestDb();
    const f = fixtureFetcher(allBucketsOnePage());
    await runPlayersBatch(db, f, { now, pagesPerRun: 1 });
    await db.prepare("DELETE FROM sync_cursor").run();
    await runPlayersBatch(db, f, { now: new Date('2026-09-27T13:00:00Z'), pagesPerRun: 1 });
    const u = await db.prepare('SELECT DISTINCT updated_at FROM players').all<{ updated_at: string }>();
    expect(u.results.map((x) => x.updated_at)).toEqual([now.toISOString()]);
  });

  it('si FUT.GG bloquea, no avanza el cursor y registra el error', async () => {
    const db = createTestDb();
    const r = await runPlayersBatch(db, fixtureFetcher({ [playersPath(0, 1)]: 403 }), { now, pagesPerRun: 2 });
    expect(r.error).toContain('403');
    expect(r.cursor).toMatchObject({ bucket: 0, page: 1 });
    const s = await db.prepare("SELECT error_msg FROM source_status WHERE source = 'futgg_players'").first<{ error_msg: string }>();
    expect(s!.error_msg).toContain('403');
  });

  it('marca error si un tramo llega al tope de 10.000', async () => {
    const db = createTestDb();
    const r = await runPlayersBatch(db, fixtureFetcher({ [playersPath(0, 1)]: { ...page, total: 10000 } }), { now, pagesPerRun: 1 });
    expect(r.error).toContain('tramo 0-59');
    const s = await db.prepare("SELECT error_msg FROM source_status WHERE source = 'futgg_players'").first<{ error_msg: string }>();
    expect(s!.error_msg).toContain('10.000');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -w worker` → FAIL — `Cannot find module '../src/jobs/players'`

- [ ] **Step 3: Implementar**

`worker/src/status.ts`:
```ts
export async function markOk(db: D1Database, source: string, now: string, detail: string | null = null) {
  await db.prepare(
    `INSERT INTO source_status (source, last_ok, detail) VALUES (?1, ?2, ?3)
     ON CONFLICT(source) DO UPDATE SET last_ok = ?2, detail = ?3`,
  ).bind(source, now, detail).run();
}

export async function markError(db: D1Database, source: string, now: string, msg: string) {
  await db.prepare(
    `INSERT INTO source_status (source, last_error, error_msg) VALUES (?1, ?2, ?3)
     ON CONFLICT(source) DO UPDATE SET last_error = ?2, error_msg = ?3`,
  ).bind(source, now, msg).run();
}
```

`worker/src/db/players.ts`:
```ts
import type { PlayerRow } from '../futgg/mapPlayer';

const COLS = ['ea_id', 'base_ea_id', 'name', 'search_name', 'overall', 'position', 'alt_positions', 'club_id', 'league_id', 'nation_id',
  'rarity_name', 'is_icon', 'is_hero', 'is_sbc', 'is_objective', 'is_evo', 'stats', 'skill_moves', 'weak_foot', 'foot', 'height', 'age',
  'playstyles', 'playstyles_plus', 'image_url', 'hash', 'updated_at'] as const;

const UPSERT = `INSERT INTO players (${COLS.join(', ')}) VALUES (${COLS.map((_, i) => `?${i + 1}`).join(', ')})
  ON CONFLICT(ea_id) DO UPDATE SET ${COLS.filter((c) => c !== 'ea_id').map((c) => `${c} = excluded.${c}`).join(', ')}
  WHERE players.hash IS NOT excluded.hash`;

export async function upsertPlayerPage(db: D1Database, rows: PlayerRow[]): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  const clubs = new Map<number, PlayerRow['club']>();
  const leagues = new Map<number, PlayerRow['league']>();
  const nations = new Map<number, PlayerRow['nation']>();
  for (const r of rows) {
    stmts.push(db.prepare(UPSERT).bind(...COLS.map((c) => r[c])));
    if (r.club) clubs.set(r.club.id, r.club);
    if (r.league) leagues.set(r.league.id, r.league);
    if (r.nation) nations.set(r.nation.id, r.nation);
  }
  for (const c of clubs.values()) stmts.push(db.prepare(
    'INSERT INTO clubs (id, name, league_id) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET name = ?2, league_id = ?3 WHERE clubs.name IS NOT ?2 OR clubs.league_id IS NOT ?3',
  ).bind(c!.id, c!.name, c!.leagueId));
  for (const [table, m] of [['leagues', leagues], ['nations', nations]] as const) {
    for (const x of m.values()) stmts.push(db.prepare(
      `INSERT INTO ${table} (id, name) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET name = ?2 WHERE ${table}.name IS NOT ?2`,
    ).bind(x!.id, x!.name));
  }
  if (stmts.length) await db.batch(stmts);
}
```

`worker/src/jobs/players.ts`:
```ts
import { getJson, type Fetcher } from '../futgg/client';
import { playersPageSchema } from '../futgg/schemas';
import { toPlayerRow } from '../futgg/mapPlayer';
import { upsertPlayerPage } from '../db/players';
import { markError, markOk } from '../status';

export const RATING_BUCKETS: [number, number][] = [[0, 59], [60, 64], [65, 69], [70, 74], [75, 79], [80, 84], [85, 99]];
const SOURCE = 'futgg_players';
const JOB = 'players';
const API_CAP = 10_000;

export interface PlayersCursor { bucket: number; page: number; cycleDate: string; done: boolean }

export function playersPath(bucket: number, page: number): string {
  const [lo, hi] = RATING_BUCKETS[bucket]!;
  return `players/v2/27/?page=${page}&overall__gte=${lo}&overall__lte=${hi}`;
}

async function loadCursor(db: D1Database, today: string): Promise<PlayersCursor> {
  const row = await db.prepare('SELECT cursor FROM sync_cursor WHERE job = ?1').bind(JOB).first<{ cursor: string }>();
  const c: PlayersCursor = row ? JSON.parse(row.cursor) : { bucket: 0, page: 1, cycleDate: today, done: false };
  if (c.done && c.cycleDate !== today) return { bucket: 0, page: 1, cycleDate: today, done: false };
  return c;
}

async function saveCursor(db: D1Database, c: PlayersCursor, now: string) {
  await db.prepare('INSERT INTO sync_cursor (job, cursor, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(job) DO UPDATE SET cursor = ?2, updated_at = ?3')
    .bind(JOB, JSON.stringify(c), now).run();
}

export async function runPlayersBatch(db: D1Database, fetcher: Fetcher, opts: { now: Date; pagesPerRun: number }) {
  const now = opts.now.toISOString();
  const cursor = await loadCursor(db, now.slice(0, 10));
  let pages = 0;
  let error: string | undefined;

  while (!cursor.done && pages < opts.pagesPerRun) {
    try {
      const data = await getJson(fetcher, playersPath(cursor.bucket, cursor.page), playersPageSchema);
      if (data.total >= API_CAP) {
        const [lo, hi] = RATING_BUCKETS[cursor.bucket]!;
        throw new Error(`El tramo ${lo}-${hi} tiene ${data.total} cartas y FUT.GG corta en 10.000: hay que partirlo`);
      }
      await upsertPlayerPage(db, data.data.map((p) => toPlayerRow(p, now)));
      pages++;
      if (data.next) cursor.page = data.next;
      else if (cursor.bucket + 1 < RATING_BUCKETS.length) { cursor.bucket++; cursor.page = 1; }
      else cursor.done = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  await saveCursor(db, cursor, now);
  if (error) await markError(db, SOURCE, now, error);
  else if (pages > 0) await markOk(db, SOURCE, now, cursor.done ? 'ciclo completo' : `tramo ${cursor.bucket + 1}/${RATING_BUCKETS.length}, página ${cursor.page}`);
  return { pages, cursor, error };
}
```

Nota: el test "retoma desde el cursor" hace 7 páginas con `pagesPerRun: 4` (4 + 3). La tercera llamada del mismo día debe hacer 0 páginas; la de mañana reinicia y hace 4.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -w worker` → PASS (todas).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(worker): sincronización de cartas por tramos con cursor y estado"
```

---

### Task 5: Job de mercado (pisos y cartas más baratas)

**Files:**
- Create: `worker/src/jobs/market.ts`
- Test: `worker/test/marketJob.test.ts`

**Interfaces:**
- Consumes: `getJson`, `cheapestPerRatingSchema`, `cheapestOverviewSchema`, `markOk`, `markError`.
- Produces: `runMarket(db, fetcher, opts: { now: Date }): Promise<{ floors: number; prices: number; error?: string }>`; constantes `FLOORS_PATH = 'market/cheapest-price-per-rating/'`, `OVERVIEW_PATH = 'market/27/cheapest-by-rating/v2/overview/'`. Escribe `platform = 'consola'`, `source = 'futgg_cheapest'`.

- [ ] **Step 1: Test (falla)**

`worker/test/marketJob.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import floorsFx from './fixtures/cheapest-per-rating.json';
import overviewFx from './fixtures/cheapest-overview.json';
import { createTestDb, fixtureFetcher } from './d1';
import { FLOORS_PATH, OVERVIEW_PATH, runMarket } from '../src/jobs/market';

const t1 = new Date('2026-09-27T12:00:00Z');
const t2 = new Date('2026-09-27T12:15:00Z');

describe('runMarket', () => {
  it('guarda pisos válidos (ignora 0) y precios de consola', async () => {
    const db = createTestDb();
    const r = await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now: t1 });
    expect(r.error).toBeUndefined();
    const zeros = Object.values(floorsFx.data).filter((v) => v === 0).length;
    expect(r.floors).toBe(Object.keys(floorsFx.data).length - zeros);
    const p = await db.prepare("SELECT platform, source FROM prices LIMIT 1").first<{ platform: string; source: string }>();
    expect(p).toEqual({ platform: 'consola', source: 'futgg_cheapest' });
    expect((await db.prepare('SELECT COUNT(*) c FROM floors WHERE price = 0').first<{ c: number }>())!.c).toBe(0);
  });

  it('solo agrega historial cuando el precio cambia', async () => {
    const db = createTestDb();
    const f = fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx });
    await runMarket(db, f, { now: t1 });
    await runMarket(db, f, { now: t2 });
    const h1 = await db.prepare('SELECT COUNT(*) c FROM floor_history').first<{ c: number }>();
    expect(h1!.c).toBe(Object.values(floorsFx.data).filter((v) => v > 0).length);
    const changed = { data: { ...floorsFx.data, '86': floorsFx.data['86']! + 100 } };
    await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: changed, [OVERVIEW_PATH]: overviewFx }), { now: new Date('2026-09-27T12:30:00Z') });
    const h2 = await db.prepare('SELECT COUNT(*) c FROM floor_history').first<{ c: number }>();
    expect(h2!.c).toBe(h1!.c + 1);
    const cur = await db.prepare("SELECT updated_at FROM floors WHERE rating = 85").first<{ updated_at: string }>();
    expect(cur!.updated_at).toBe('2026-09-27T12:30:00.000Z');
  });

  it('si una fuente falla no toca los datos y registra el error', async () => {
    const db = createTestDb();
    await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now: t1 });
    const r = await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: 403, [OVERVIEW_PATH]: { data: 'roto' } }), { now: t2 });
    expect(r.error).toBeDefined();
    const kept = await db.prepare('SELECT MAX(updated_at) m FROM floors').first<{ m: string }>();
    expect(kept!.m).toBe(t1.toISOString());
    const s = await db.prepare("SELECT error_msg FROM source_status WHERE source = 'futgg_market'").first<{ error_msg: string }>();
    expect(s!.error_msg).toContain('403');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -w worker` → FAIL — `Cannot find module '../src/jobs/market'`

- [ ] **Step 3: Implementar**

`worker/src/jobs/market.ts`:
```ts
import { getJson, type Fetcher } from '../futgg/client';
import { cheapestOverviewSchema, cheapestPerRatingSchema } from '../futgg/schemas';
import { markError, markOk } from '../status';

export const FLOORS_PATH = 'market/cheapest-price-per-rating/';
export const OVERVIEW_PATH = 'market/27/cheapest-by-rating/v2/overview/';
const SOURCE = 'futgg_market';
const PLATFORM = 'consola';

async function upsertFloors(db: D1Database, floors: Record<string, number>, now: string): Promise<number> {
  const current = await db.prepare('SELECT rating, price FROM floors WHERE platform = ?1').bind(PLATFORM).all<{ rating: number; price: number }>();
  const prev = new Map(current.results.map((r) => [r.rating, r.price]));
  const stmts: D1PreparedStatement[] = [];
  let valid = 0;
  for (const [k, price] of Object.entries(floors)) {
    const rating = Number(k);
    if (!Number.isInteger(rating) || price <= 0) continue;
    valid++;
    stmts.push(db.prepare('INSERT INTO floors (rating, platform, price, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(rating, platform) DO UPDATE SET price = ?3, updated_at = ?4')
      .bind(rating, PLATFORM, price, now));
    if (prev.get(rating) !== price) {
      stmts.push(db.prepare('INSERT INTO floor_history (rating, platform, ts, price) VALUES (?1, ?2, ?3, ?4)').bind(rating, PLATFORM, now, price));
    }
  }
  if (stmts.length) await db.batch(stmts);
  return valid;
}

async function upsertCheapest(db: D1Database, overview: Record<string, { eaId: number; price: number }[]>, now: string): Promise<number> {
  const cards = new Map<number, number>();
  for (const list of Object.values(overview)) for (const c of list) if (c.price > 0) cards.set(c.eaId, c.price);
  if (!cards.size) return 0;
  const ids = [...cards.keys()];
  const current = await db.prepare(`SELECT ea_id, price FROM prices WHERE platform = ?1 AND ea_id IN (${ids.map(() => '?').join(',')})`)
    .bind(PLATFORM, ...ids).all<{ ea_id: number; price: number }>();
  const prev = new Map(current.results.map((r) => [r.ea_id, r.price]));
  const stmts: D1PreparedStatement[] = [];
  for (const [eaId, price] of cards) {
    stmts.push(db.prepare("INSERT INTO prices (ea_id, platform, price, source, updated_at) VALUES (?1, ?2, ?3, 'futgg_cheapest', ?4) ON CONFLICT(ea_id, platform) DO UPDATE SET price = ?3, source = 'futgg_cheapest', updated_at = ?4")
      .bind(eaId, PLATFORM, price, now));
    if (prev.get(eaId) !== price) {
      stmts.push(db.prepare('INSERT INTO price_history (ea_id, platform, ts, price) VALUES (?1, ?2, ?3, ?4)').bind(eaId, PLATFORM, now, price));
    }
  }
  await db.batch(stmts);
  return cards.size;
}

export async function runMarket(db: D1Database, fetcher: Fetcher, opts: { now: Date }) {
  const now = opts.now.toISOString();
  const errors: string[] = [];
  let floors = 0;
  let prices = 0;
  try { floors = await upsertFloors(db, (await getJson(fetcher, FLOORS_PATH, cheapestPerRatingSchema)).data, now); }
  catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  try { prices = await upsertCheapest(db, (await getJson(fetcher, OVERVIEW_PATH, cheapestOverviewSchema)).data, now); }
  catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  const error = errors.length ? errors.join(' | ') : undefined;
  if (error) await markError(db, SOURCE, now, error);
  if (floors || prices) await markOk(db, SOURCE, now, `${floors} pisos, ${prices} precios`);
  return { floors, prices, error };
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -w worker` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(worker): job de mercado con pisos y precios de consola, historial solo en cambios"
```

---

### Task 6: API de cartas y metadatos

**Files:**
- Create: `worker/src/api/http.ts`, `worker/src/api/players.ts`, `worker/src/api/router.ts`
- Modify: `worker/src/db/players.ts` (agregar `rowToCard`, `loadFloors`, `CARD_SELECT`)
- Test: `worker/test/apiPlayers.test.ts`

**Interfaces:**
- Consumes: `resolvePrice`, `normalizeText`, tipos de `@fut27/shared`; `runPlayersBatch`, `runMarket` (para sembrar datos en tests).
- Produces:
  - `handleApi(req: Request, env: Env, now?: Date): Promise<Response>`
  - `GET /api/players?q&pos&league&club&nation&rarity&minOvr&maxOvr&type(icon|hero|tradeable)&sort(ovr|-ovr|name)&page` → `PlayersResponse` (pageSize 30)
  - `GET /api/players/:eaId` → `PlayerDetailResponse` o 404 `{error}`
  - `GET /api/meta` → `MetaResponse`
  - `json(data, status?)`, `CARD_SELECT`, `rowToCard(row, floors, now): CardWithPrice`, `loadFloors(db, platform): Promise<Floors>`

- [ ] **Step 1: Test (falla)**

`worker/test/apiPlayers.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import page from './fixtures/players-page.json';
import floorsFx from './fixtures/cheapest-per-rating.json';
import overviewFx from './fixtures/cheapest-overview.json';
import { createTestDb, fixtureFetcher } from './d1';
import { playersPath } from '../src/jobs/players';
import { runPlayersBatch } from '../src/jobs/players';
import { FLOORS_PATH, OVERVIEW_PATH, runMarket } from '../src/jobs/market';
import { handleApi } from '../src/api/router';
import type { Env } from '../src/env';
import type { MetaResponse, PlayerDetailResponse, PlayersResponse } from '@fut27/shared';

const now = new Date('2026-09-27T12:00:00Z');
let env: Env;

async function get<T>(path: string) {
  const res = await handleApi(new Request(`https://x.test${path}`), env, now);
  return { status: res.status, body: (await res.json()) as T };
}

beforeEach(async () => {
  const db = createTestDb();
  env = { DB: db, ASSETS: { fetch: async () => new Response('') }, PAGES_PER_RUN: '1' };
  await runPlayersBatch(db, fixtureFetcher({ [playersPath(0, 1)]: { ...page, next: null } }), { now, pagesPerRun: 1 });
  await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now });
});

describe('GET /api/players', () => {
  it('lista ordenado por valoración con precio resuelto y nombres de club/liga', async () => {
    const { status, body } = await get<PlayersResponse>('/api/players');
    expect(status).toBe(200);
    expect(body.total).toBe(page.data.length);
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
      expect(body.total).toBe(0);
    }
  });

  it('filtra por posición incluyendo alternativas y por tipo ícono', async () => {
    const withAlt = page.data.find((p) => (p.alternativePositions ?? []).length > 0)!;
    const alt = withAlt.alternativePositions![0]!;
    const { body } = await get<PlayersResponse>(`/api/players?pos=${alt}`);
    expect(body.items.map((c) => c.eaId)).toContain(withAlt.eaId);
    const icons = await get<PlayersResponse>('/api/players?type=icon');
    expect(icons.body.items.every((c) => c.isIcon)).toBe(true);
  });

  it('ignora parámetros numéricos inválidos', async () => {
    const { status } = await get<PlayersResponse>('/api/players?minOvr=abc&page=-3&league=x');
    expect(status).toBe(200);
  });
});

describe('GET /api/players/:eaId', () => {
  it('devuelve la carta, versiones e historial', async () => {
    const id = page.data[0]!.eaId;
    const { status, body } = await get<PlayerDetailResponse>(`/api/players/${id}`);
    expect(status).toBe(200);
    expect(body.card.eaId).toBe(id);
    expect(Array.isArray(body.history.consola)).toBe(true);
  });
  it('404 si no existe', async () => {
    expect((await get('/api/players/1')).status).toBe(404);
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
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -w worker` → FAIL — `Cannot find module '../src/api/router'`

- [ ] **Step 3: Implementar**

`worker/src/api/http.ts`:
```ts
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=60' : 'no-store' },
  });
}

export function intParam(v: string | null, min: number, max: number): number | null {
  if (v === null || !/^-?\d+$/.test(v)) return null;
  const n = Number(v);
  return n < min || n > max ? null : n;
}
```

Agregar a `worker/src/db/players.ts`:
```ts
import { resolvePrice, type CardWithPrice, type Floors, type Platform, type PriceRow } from '@fut27/shared';

export const CARD_SELECT = `SELECT p.*, c.name AS club_name, l.name AS league_name, n.name AS nation_name,
  pc.price AS pc_price, pc.source AS pc_source, pc.updated_at AS pc_at,
  co.price AS co_price, co.source AS co_source, co.updated_at AS co_at
  FROM players p
  LEFT JOIN clubs c ON c.id = p.club_id
  LEFT JOIN leagues l ON l.id = p.league_id
  LEFT JOIN nations n ON n.id = p.nation_id
  LEFT JOIN prices pc ON pc.ea_id = p.ea_id AND pc.platform = 'pc'
  LEFT JOIN prices co ON co.ea_id = p.ea_id AND co.platform = 'consola'`;

export type CardDbRow = Record<string, string | number | null>;

export async function loadFloors(db: D1Database, platform: Platform = 'consola'): Promise<Floors> {
  const r = await db.prepare('SELECT rating, price FROM floors WHERE platform = ?1').bind(platform).all<{ rating: number; price: number }>();
  return Object.fromEntries(r.results.map((x) => [x.rating, x.price]));
}

export function rowToCard(r: CardDbRow, floors: Floors, now: Date): CardWithPrice {
  const card = {
    eaId: r.ea_id as number, baseEaId: r.base_ea_id as number, name: r.name as string, overall: r.overall as number,
    position: r.position as string, altPositions: JSON.parse(r.alt_positions as string) as string[],
    clubId: r.club_id as number | null, clubName: r.club_name as string | null,
    leagueId: r.league_id as number | null, leagueName: r.league_name as string | null,
    nationId: r.nation_id as number | null, nationName: r.nation_name as string | null,
    rarityName: r.rarity_name as string,
    isIcon: r.is_icon === 1, isHero: r.is_hero === 1, isSbc: r.is_sbc === 1, isObjective: r.is_objective === 1, isEvo: r.is_evo === 1,
    stats: JSON.parse(r.stats as string), skillMoves: r.skill_moves as number | null, weakFoot: r.weak_foot as number | null,
    foot: r.foot as string | null, height: r.height as number | null, age: r.age as number | null,
    playstyles: JSON.parse(r.playstyles as string), playstylesPlus: JSON.parse(r.playstyles_plus as string),
    imageUrl: r.image_url as string | null,
  };
  const prices: PriceRow[] = [];
  if (r.pc_price != null) prices.push({ platform: 'pc', price: r.pc_price as number, source: r.pc_source as string, updatedAt: r.pc_at as string });
  if (r.co_price != null) prices.push({ platform: 'consola', price: r.co_price as number, source: r.co_source as string, updatedAt: r.co_at as string });
  return { ...card, price: resolvePrice({ card, prices, floors, now }) };
}
```

`worker/src/api/players.ts`:
```ts
import { normalizeText, type MetaResponse, type PlayerDetailResponse, type PlayersResponse } from '@fut27/shared';
import { CARD_SELECT, loadFloors, rowToCard, type CardDbRow } from '../db/players';
import { intParam, json } from './http';

const PAGE_SIZE = 30;
const POSITIONS = ['GK', 'RB', 'LB', 'CB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST'];
const SORTS: Record<string, string> = { '-ovr': 'p.overall DESC, p.name', ovr: 'p.overall ASC, p.name', name: 'p.name ASC' };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function listPlayers(db: D1Database, url: URL, now: Date): Promise<Response> {
  const q = url.searchParams;
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (sql: string, ...v: (string | number)[]) => { where.push(sql); args.push(...v); };

  const text = normalizeText(q.get('q') ?? '');
  if (text) add("p.search_name LIKE ? ESCAPE '\\'", `%${escapeLike(text)}%`);
  const pos = q.get('pos');
  if (pos && POSITIONS.includes(pos)) add('(p.position = ? OR p.alt_positions LIKE ?)', pos, `%"${pos}"%`);
  for (const [param, col] of [['league', 'p.league_id'], ['club', 'p.club_id'], ['nation', 'p.nation_id']] as const) {
    const v = intParam(q.get(param), 0, 1e9);
    if (v !== null) add(`${col} = ?`, v);
  }
  const rarity = q.get('rarity');
  if (rarity) add('p.rarity_name = ?', rarity);
  const minOvr = intParam(q.get('minOvr'), 1, 99);
  if (minOvr !== null) add('p.overall >= ?', minOvr);
  const maxOvr = intParam(q.get('maxOvr'), 1, 99);
  if (maxOvr !== null) add('p.overall <= ?', maxOvr);
  const type = q.get('type');
  if (type === 'icon') add('p.is_icon = 1');
  if (type === 'hero') add('p.is_hero = 1');
  if (type === 'tradeable') add('p.is_sbc = 0 AND p.is_objective = 0 AND p.is_evo = 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[q.get('sort') ?? '-ovr'] ?? SORTS['-ovr'];
  const page = intParam(q.get('page'), 1, 10_000) ?? 1;

  const [countRow, rows, floors] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM players p ${whereSql}`).bind(...args).first<{ c: number }>(),
    db.prepare(`${CARD_SELECT} ${whereSql} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`).bind(...args).all<CardDbRow>(),
    loadFloors(db),
  ]);
  const body: PlayersResponse = { items: rows.results.map((r) => rowToCard(r, floors, now)), page, pageSize: PAGE_SIZE, total: countRow?.c ?? 0 };
  return json(body);
}

export async function getPlayer(db: D1Database, eaId: number, now: Date): Promise<Response> {
  const floors = await loadFloors(db);
  const row = await db.prepare(`${CARD_SELECT} WHERE p.ea_id = ?`).bind(eaId).first<CardDbRow>();
  if (!row) return json({ error: 'Carta no encontrada' }, 404);
  const card = rowToCard(row, floors, now);
  const versions = await db.prepare(`${CARD_SELECT} WHERE p.base_ea_id = ? AND p.ea_id != ? ORDER BY p.overall DESC`).bind(card.baseEaId, eaId).all<CardDbRow>();
  const hist = await db.prepare('SELECT platform, ts, price FROM price_history WHERE ea_id = ? ORDER BY ts').bind(eaId).all<{ platform: string; ts: string; price: number }>();
  const body: PlayerDetailResponse = {
    card,
    versions: versions.results.map((r) => rowToCard(r, floors, now)),
    history: {
      pc: hist.results.filter((h) => h.platform === 'pc').map(({ ts, price }) => ({ ts, price })),
      consola: hist.results.filter((h) => h.platform === 'consola').map(({ ts, price }) => ({ ts, price })),
    },
  };
  return json(body);
}

export async function getMeta(db: D1Database): Promise<Response> {
  const [leagues, nations, clubs, rarities] = await Promise.all([
    db.prepare('SELECT id, name FROM leagues ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare('SELECT id, name FROM nations ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare('SELECT id, name FROM clubs ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare('SELECT DISTINCT rarity_name AS r FROM players ORDER BY r').all<{ r: string }>(),
  ]);
  const body: MetaResponse = { leagues: leagues.results, nations: nations.results, clubs: clubs.results, rarities: rarities.results.map((x) => x.r), positions: POSITIONS };
  return json(body);
}
```

`worker/src/api/router.ts`:
```ts
import type { Env } from '../env';
import { json } from './http';
import { getMeta, getPlayer, listPlayers } from './players';

export async function handleApi(req: Request, env: Env, now: Date = new Date()): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'Método no permitido' }, 405);
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  try {
    if (path === '/api/players') return await listPlayers(env.DB, url, now);
    const m = path.match(/^\/api\/players\/(\d+)$/);
    if (m) return await getPlayer(env.DB, Number(m[1]), now);
    if (path === '/api/meta') return await getMeta(env.DB);
    return json({ error: 'Ruta no encontrada' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'Error interno' }, 500);
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -w worker` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(worker): API de cartas con filtros, ficha y metadatos"
```

---

### Task 7: API de mercado (pisos, subidas y bajadas) y estado

**Files:**
- Create: `worker/src/market/movers.ts`, `worker/src/api/market.ts`, `worker/src/api/status.ts`
- Modify: `worker/src/api/router.ts`
- Test: `worker/test/movers.test.ts`, `worker/test/apiMarket.test.ts`

**Interfaces:**
- Produces:
  - `computeMovers(rows: { ea_id: number; ts: string; price: number }[], now: Date, limit: number): { eaId: number; from: number; to: number; changePct: number }[]` ordenado por `changePct` desc (el llamador separa subidas/bajadas)
  - `GET /api/market/floors?platform=consola` → `FloorsResponse` (historial de 7 días)
  - `GET /api/market/movers?platform=consola` → `MoversResponse` (top 20 subidas y 20 bajadas en 24 h)
  - `GET /api/status` → `StatusResponse`

- [ ] **Step 1: Tests (fallan)**

`worker/test/movers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeMovers } from '../src/market/movers';

const now = new Date('2026-09-28T12:00:00Z');
describe('computeMovers', () => {
  it('compara el precio actual con el vigente hace 24 h', () => {
    const rows = [
      { ea_id: 1, ts: '2026-09-27T08:00:00Z', price: 1000 },
      { ea_id: 1, ts: '2026-09-28T10:00:00Z', price: 1500 },
      { ea_id: 2, ts: '2026-09-27T09:00:00Z', price: 2000 },
      { ea_id: 2, ts: '2026-09-28T11:00:00Z', price: 1000 },
    ];
    const m = computeMovers(rows, now, 10);
    expect(m).toEqual([
      { eaId: 1, from: 1000, to: 1500, changePct: 50 },
      { eaId: 2, from: 2000, to: 1000, changePct: -50 },
    ]);
  });
  it('si no hay precio anterior a 24 h usa el más antiguo de la ventana; sin cambio no aparece', () => {
    const rows = [
      { ea_id: 3, ts: '2026-09-28T01:00:00Z', price: 800 },
      { ea_id: 3, ts: '2026-09-28T09:00:00Z', price: 1000 },
      { ea_id: 4, ts: '2026-09-28T09:00:00Z', price: 500 },
    ];
    expect(computeMovers(rows, now, 10)).toEqual([{ eaId: 3, from: 800, to: 1000, changePct: 25 }]);
  });
});
```

`worker/test/apiMarket.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import floorsFx from './fixtures/cheapest-per-rating.json';
import overviewFx from './fixtures/cheapest-overview.json';
import { createTestDb, fixtureFetcher } from './d1';
import { FLOORS_PATH, OVERVIEW_PATH, runMarket } from '../src/jobs/market';
import { handleApi } from '../src/api/router';
import type { FloorsResponse, MoversResponse, StatusResponse } from '@fut27/shared';

const now = new Date('2026-09-27T12:00:00Z');

describe('API de mercado y estado', () => {
  it('floors, movers y status responden con la forma esperada', async () => {
    const db = createTestDb();
    const env = { DB: db, ASSETS: { fetch: async () => new Response('') }, PAGES_PER_RUN: '1' };
    await runMarket(db, fixtureFetcher({ [FLOORS_PATH]: floorsFx, [OVERVIEW_PATH]: overviewFx }), { now });
    const floors = (await (await handleApi(new Request('https://x.test/api/market/floors'), env, now)).json()) as FloorsResponse;
    expect(floors.platform).toBe('consola');
    expect(floors.current.find((f) => f.rating === 86)!.price).toBe(floorsFx.data['86']);
    const movers = (await (await handleApi(new Request('https://x.test/api/market/movers'), env, now)).json()) as MoversResponse;
    expect(movers).toMatchObject({ platform: 'consola', up: [], down: [] });
    const status = (await (await handleApi(new Request('https://x.test/api/status'), env, now)).json()) as StatusResponse;
    expect(status.sources.map((s) => s.source)).toContain('futgg_market');
    expect(status.pricedCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test -w worker` → FAIL — `Cannot find module '../src/market/movers'`

- [ ] **Step 3: Implementar**

`worker/src/market/movers.ts`:
```ts
const DAY = 24 * 3_600_000;

export function computeMovers(rows: { ea_id: number; ts: string; price: number }[], now: Date, limit: number) {
  const byCard = new Map<number, { ts: number; price: number }[]>();
  for (const r of rows) {
    const list = byCard.get(r.ea_id) ?? [];
    list.push({ ts: Date.parse(r.ts), price: r.price });
    byCard.set(r.ea_id, list);
  }
  const cutoff = now.getTime() - DAY;
  const out: { eaId: number; from: number; to: number; changePct: number }[] = [];
  for (const [eaId, list] of byCard) {
    list.sort((a, b) => a.ts - b.ts);
    const to = list[list.length - 1]!.price;
    const before = list.filter((x) => x.ts <= cutoff);
    const from = (before.length ? before[before.length - 1]! : list[0]!).price;
    if (from === to || from <= 0) continue;
    out.push({ eaId, from, to, changePct: Math.round(((to - from) / from) * 1000) / 10 });
  }
  return out.sort((a, b) => b.changePct - a.changePct).slice(0, limit * 2);
}
```

`worker/src/api/market.ts`:
```ts
import type { FloorsResponse, Mover, MoversResponse, Platform } from '@fut27/shared';
import { CARD_SELECT, loadFloors, rowToCard, type CardDbRow } from '../db/players';
import { computeMovers } from '../market/movers';
import { json } from './http';

const platformOf = (url: URL): Platform => (url.searchParams.get('platform') === 'pc' ? 'pc' : 'consola');

export async function getFloors(db: D1Database, url: URL, now: Date): Promise<Response> {
  const platform = platformOf(url);
  const since = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
  const [current, history] = await Promise.all([
    db.prepare('SELECT rating, price, updated_at FROM floors WHERE platform = ? ORDER BY rating').bind(platform).all<{ rating: number; price: number; updated_at: string }>(),
    db.prepare('SELECT rating, ts, price FROM floor_history WHERE platform = ? AND ts >= ? ORDER BY ts').bind(platform, since).all<{ rating: number; ts: string; price: number }>(),
  ]);
  const body: FloorsResponse = { platform, current: current.results.map((r) => ({ rating: r.rating, price: r.price, updatedAt: r.updated_at })), history: history.results };
  return json(body);
}

export async function getMovers(db: D1Database, url: URL, now: Date): Promise<Response> {
  const platform = platformOf(url);
  const since = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const rows = await db.prepare('SELECT ea_id, ts, price FROM price_history WHERE platform = ? AND ts >= ?').bind(platform, since).all<{ ea_id: number; ts: string; price: number }>();
  const moves = computeMovers(rows.results, now, 20);
  let up: Mover[] = [];
  let down: Mover[] = [];
  if (moves.length) {
    const ids = moves.map((m) => m.eaId);
    const [cards, floors] = await Promise.all([
      db.prepare(`${CARD_SELECT} WHERE p.ea_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<CardDbRow>(),
      loadFloors(db),
    ]);
    const byId = new Map(cards.results.map((r) => [r.ea_id as number, rowToCard(r, floors, now)]));
    const withCard = moves.flatMap((m) => { const card = byId.get(m.eaId); return card ? [{ card, from: m.from, to: m.to, changePct: m.changePct }] : []; });
    up = withCard.filter((m) => m.changePct > 0).slice(0, 20);
    down = withCard.filter((m) => m.changePct < 0).reverse().slice(0, 20);
  }
  const body: MoversResponse = { platform, up, down };
  return json(body);
}
```

`worker/src/api/status.ts`:
```ts
import type { StatusResponse } from '@fut27/shared';
import { json } from './http';

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
```

En `worker/src/api/router.ts`, agregar los imports y las rutas antes del 404:
```ts
import { getFloors, getMovers } from './market';
import { getStatus } from './status';
// ...
    if (path === '/api/market/floors') return await getFloors(env.DB, url, now);
    if (path === '/api/market/movers') return await getMovers(env.DB, url, now);
    if (path === '/api/status') return await getStatus(env.DB);
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npm test -w worker` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(worker): API de pisos, subidas/bajadas y estado de fuentes"
```

---

### Task 8: Punto de entrada del Worker (fetch + cron)

**Files:**
- Create: `worker/src/index.ts`
- Test: `worker/test/index.test.ts`

**Interfaces:**
- Consumes: `handleApi`, `runPlayersBatch`, `runMarket`, `Env`.
- Produces: `default { fetch, scheduled }`; cron `*/15 * * * *` → mercado; cualquier otro → lote de cartas.

- [ ] **Step 1: Test (falla)**

`worker/test/index.test.ts`:
```ts
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 403 }));
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
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -w worker` → FAIL — `Cannot find module '../src/index'`

- [ ] **Step 3: Implementar**

`worker/src/index.ts`:
```ts
import { handleApi } from './api/router';
import type { Env } from './env';
import { runMarket } from './jobs/market';
import { runPlayersBatch } from './jobs/players';

const fetcher = (url: string, init?: RequestInit) => fetch(url, init);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date(controller.scheduledTime);
    if (controller.cron === '*/15 * * * *') {
      ctx.waitUntil(runMarket(env.DB, fetcher, { now }));
    } else {
      const pagesPerRun = Math.max(1, Number(env.PAGES_PER_RUN) || 4);
      ctx.waitUntil(runPlayersBatch(env.DB, fetcher, { now, pagesPerRun }));
    }
  },
};
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -w worker` → PASS. Run: `npm run typecheck -w worker` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(worker): entrada fetch/scheduled que despacha API, assets y cron"
```

---

### Task 9: Web — base, cliente de API, layout y pantalla Estado

Antes de escribir la interfaz, cargar la skill `frontend-design:frontend-design` para fijar la dirección visual (oscura, estilo tarjetas FUT, acento rojo carmesí coherente con las preferencias de Renato).

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/styles.css`, `web/src/components/PriceTag.tsx`, `web/src/pages/StatusPage.tsx`
- Test: `web/test/PriceTag.test.tsx`

**Interfaces:**
- Consumes: tipos de `@fut27/shared`, `formatCoins`.
- Produces: `api.players(params)`, `api.player(id)`, `api.meta()`, `api.floors()`, `api.movers()`, `api.status()`; `useApi<T>(fn, deps): { data?: T; error?: string; loading: boolean }`; `<PriceTag price={ResolvedPrice} />`; `PRICE_LABEL_TEXT: Record<PriceLabel, string>`.

- [ ] **Step 1: Configuración**

`web/package.json`:
```json
{
  "name": "@fut27/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "@fut27/shared": "*", "react": "^19.3.0", "react-dom": "^19.3.0", "react-router-dom": "^7.18.4" },
  "devDependencies": { "vite": "^8.3.1", "@vitejs/plugin-react": "^6.1.1", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" }
}
```

`web/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"], "jsx": "react-jsx", "types": ["vite/client"] },
  "include": ["src", "test"]
}
```

`web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  test: { include: ['test/**/*.test.{ts,tsx}'] },
} as never);
```

`web/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FUT27</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Test de PriceTag (falla)**

`web/test/PriceTag.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceTag } from '../src/components/PriceTag';

describe('PriceTag', () => {
  it('muestra valor y etiqueta de plataforma', () => {
    const html = renderToStaticMarkup(<PriceTag price={{ label: 'consola', value: 25250, updatedAt: '2026-09-27T12:00:00Z', floorHint: 25000 }} />);
    expect(html).toContain('25,3K');
    expect(html).toContain('Consola');
  });
  it('sin precio muestra la pista del piso', () => {
    const html = renderToStaticMarkup(<PriceTag price={{ label: 'sin_precio', value: null, updatedAt: null, floorHint: 3700 }} />);
    expect(html).toContain('desde 3,7K');
  });
  it('no transferible no muestra monedas', () => {
    const html = renderToStaticMarkup(<PriceTag price={{ label: 'no_transferible', value: null, updatedAt: null, floorHint: null }} />);
    expect(html).toContain('No transferible');
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npm install` y `npm test -w web` → FAIL — `Cannot find module '../src/components/PriceTag'`

- [ ] **Step 4: Implementar cliente, PriceTag, layout y Estado**

`web/src/api.ts`:
```ts
import { useEffect, useState } from 'react';
import type { FloorsResponse, MetaResponse, MoversResponse, PlayerDetailResponse, PlayersResponse, StatusResponse } from '@fut27/shared';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  return body as T;
}

export const api = {
  players: (qs: string) => get<PlayersResponse>(`/api/players${qs ? `?${qs}` : ''}`),
  player: (id: number) => get<PlayerDetailResponse>(`/api/players/${id}`),
  meta: () => get<MetaResponse>('/api/meta'),
  floors: () => get<FloorsResponse>('/api/market/floors'),
  movers: () => get<MoversResponse>('/api/market/movers'),
  status: () => get<StatusResponse>('/api/status'),
};

export function useApi<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => alive && setState({ data, loading: false }))
      .catch((e: Error) => alive && setState({ error: e.message, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
```

`web/src/components/PriceTag.tsx`:
```tsx
import { formatCoins, type PriceLabel, type ResolvedPrice } from '@fut27/shared';

export const PRICE_LABEL_TEXT: Record<PriceLabel, string> = {
  pc: 'PC', consola: 'Consola', estimado: 'Estimado', no_transferible: 'No transferible', sin_precio: 'Sin precio',
};

export function PriceTag({ price }: { price: ResolvedPrice }) {
  const title = price.updatedAt ? `Actualizado ${new Date(price.updatedAt).toLocaleString('es-CL')}` : undefined;
  return (
    <span className={`price price--${price.label}`} title={title}>
      {price.value !== null && <strong>{formatCoins(price.value)}</strong>}
      {price.value === null && price.floorHint !== null && price.label === 'sin_precio' && <strong>desde {formatCoins(price.floorHint)}</strong>}
      <small>{PRICE_LABEL_TEXT[price.label]}</small>
    </span>
  );
}
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
);
```

`web/src/App.tsx` (las páginas de Tasks 10–11 se agregan ahí):
```tsx
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { StatusPage } from './pages/StatusPage';

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">FUT27</span>
        <nav>
          <NavLink to="/jugadores">Jugadores</NavLink>
          <NavLink to="/mercado">Mercado</NavLink>
          <NavLink to="/estado">Estado</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/jugadores" replace />} />
          <Route path="/estado" element={<StatusPage />} />
          <Route path="*" element={<p className="empty">Página no encontrada.</p>} />
        </Routes>
      </main>
    </div>
  );
}
```

`web/src/pages/StatusPage.tsx`:
```tsx
import { api, useApi } from '../api';

const NAMES: Record<string, string> = { futgg_players: 'Cartas (FUT.GG)', futgg_market: 'Mercado (FUT.GG)' };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('es-CL') : '—');

export function StatusPage() {
  const { data, error, loading } = useApi(() => api.status(), []);
  if (loading) return <p className="empty">Cargando…</p>;
  if (error || !data) return <p className="error">No se pudo cargar el estado: {error}</p>;
  return (
    <section>
      <h1>Estado de las fuentes</h1>
      <p>{data.playerCount.toLocaleString('es-CL')} cartas · {data.pricedCount.toLocaleString('es-CL')} con precio</p>
      <table className="table">
        <thead><tr><th>Fuente</th><th>Último éxito</th><th>Detalle</th><th>Último error</th></tr></thead>
        <tbody>
          {data.sources.map((s) => {
            const failing = s.lastError && (!s.lastOk || s.lastError > s.lastOk);
            return (
              <tr key={s.source} className={failing ? 'row--error' : ''}>
                <td>{NAMES[s.source] ?? s.source}</td>
                <td>{fmt(s.lastOk)}</td>
                <td>{s.detail ?? '—'}</td>
                <td>{s.lastError ? `${fmt(s.lastError)} · ${s.errorMsg}` : '—'}</td>
              </tr>
            );
          })}
          {!data.sources.length && <tr><td colSpan={4}>Todavía no corre ninguna sincronización.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
```

`web/src/styles.css`: hoja base con variables (`--bg`, `--surface`, `--text`, `--muted`, `--accent` carmesí, `--pc`, `--consola`, `--estimado`), layout responsivo (`.app`, `.topbar`, `main` con máx. 1200 px y 16 px de margen lateral en móvil), `.table`, `.row--error`, `.price` y sus variantes por etiqueta, `.empty`, `.error`, `.filters`, `.card-row`, `.grid`. La definición concreta sale de la dirección visual acordada con la skill de diseño; debe verse bien a 360 px de ancho sin scroll horizontal.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `npm test -w web` → PASS (3 tests). Run: `npm run build -w web` → genera `web/dist/`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): base de la app, cliente de API, PriceTag y pantalla Estado"
```

---

### Task 10: Web — Jugadores (lista con filtros) y Ficha

**Files:**
- Create: `web/src/query.ts`, `web/src/components/Filters.tsx`, `web/src/components/CardRow.tsx`, `web/src/components/LineChart.tsx`, `web/src/pages/PlayersPage.tsx`, `web/src/pages/PlayerPage.tsx`
- Modify: `web/src/App.tsx` (rutas `/jugadores` y `/jugador/:id`)
- Test: `web/test/query.test.ts`

Antes de `LineChart`, cargar la skill `dataviz`.

**Interfaces:**
- Consumes: `api`, `useApi`, `PriceTag`, `MetaResponse`, `CardWithPrice`, `PricePoint`.
- Produces: `interface PlayerFilters { q?: string; pos?: string; league?: string; club?: string; nation?: string; rarity?: string; minOvr?: string; maxOvr?: string; type?: string; sort?: string; page?: string }`, `buildPlayersQuery(f: PlayerFilters): string`, `filtersFromSearch(s: URLSearchParams): PlayerFilters`, `<CardRow card />`, `<LineChart series={{ name: string; points: PricePoint[] }[]} />`.

- [ ] **Step 1: Test (falla)**

`web/test/query.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildPlayersQuery, filtersFromSearch } from '../src/query';

describe('buildPlayersQuery', () => {
  it('omite vacíos, recorta espacios y ordena las claves', () => {
    expect(buildPlayersQuery({ q: '  mbappé ', pos: '', league: '53', page: '1' })).toBe('league=53&q=mbapp%C3%A9');
  });
  it('mantiene la página si es mayor a 1', () => {
    expect(buildPlayersQuery({ page: '3' })).toBe('page=3');
  });
  it('ida y vuelta con URLSearchParams', () => {
    const f = filtersFromSearch(new URLSearchParams('q=vini&minOvr=85&x=1'));
    expect(f).toEqual({ q: 'vini', minOvr: '85' });
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -w web` → FAIL — `Cannot find module '../src/query'`

- [ ] **Step 3: Implementar**

`web/src/query.ts`:
```ts
export const FILTER_KEYS = ['q', 'pos', 'league', 'club', 'nation', 'rarity', 'minOvr', 'maxOvr', 'type', 'sort', 'page'] as const;
export type PlayerFilters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

export function buildPlayersQuery(f: PlayerFilters): string {
  const p = new URLSearchParams();
  for (const k of [...FILTER_KEYS].sort()) {
    const v = f[k]?.trim();
    if (!v || (k === 'page' && v === '1')) continue;
    p.set(k, v);
  }
  return p.toString();
}

export function filtersFromSearch(s: URLSearchParams): PlayerFilters {
  const f: PlayerFilters = {};
  for (const k of FILTER_KEYS) { const v = s.get(k); if (v) f[k] = v; }
  return f;
}
```

`web/src/components/CardRow.tsx`:
```tsx
import { Link } from 'react-router-dom';
import type { CardWithPrice } from '@fut27/shared';
import { PriceTag } from './PriceTag';

export function CardRow({ card }: { card: CardWithPrice }) {
  return (
    <Link to={`/jugador/${card.eaId}`} className="card-row">
      {card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" width={56} /> : <span className="card-row__ph" />}
      <span className="card-row__ovr">{card.overall}</span>
      <span className="card-row__main">
        <strong>{card.name}</strong>
        <small>{[card.position, ...card.altPositions].join(' · ')} — {card.rarityName}</small>
        <small>{[card.clubName, card.leagueName, card.nationName].filter(Boolean).join(' · ')}</small>
      </span>
      <PriceTag price={card.price} />
    </Link>
  );
}
```

`web/src/components/Filters.tsx`:
```tsx
import type { MetaResponse } from '@fut27/shared';
import type { PlayerFilters } from '../query';

interface Props { meta?: MetaResponse; value: PlayerFilters; onChange: (f: PlayerFilters) => void }

export function Filters({ meta, value, onChange }: Props) {
  const set = (k: keyof PlayerFilters) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value, page: '1' });
  const select = (k: keyof PlayerFilters, label: string, opts: { v: string; t: string }[]) => (
    <label>{label}
      <select value={value[k] ?? ''} onChange={set(k)}>
        <option value="">Todas</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );
  return (
    <form className="filters" onSubmit={(e) => e.preventDefault()}>
      <label className="filters__q">Buscar<input type="search" placeholder="Nombre del jugador" value={value.q ?? ''} onChange={set('q')} /></label>
      {select('pos', 'Posición', (meta?.positions ?? []).map((p) => ({ v: p, t: p })))}
      {select('league', 'Liga', (meta?.leagues ?? []).map((l) => ({ v: String(l.id), t: l.name })))}
      {select('nation', 'Nación', (meta?.nations ?? []).map((n) => ({ v: String(n.id), t: n.name })))}
      {select('club', 'Club', (meta?.clubs ?? []).map((c) => ({ v: String(c.id), t: c.name })))}
      {select('rarity', 'Rareza', (meta?.rarities ?? []).map((r) => ({ v: r, t: r })))}
      {select('type', 'Tipo', [{ v: 'icon', t: 'Íconos' }, { v: 'hero', t: 'Héroes' }, { v: 'tradeable', t: 'Transferibles' }])}
      <label>Val. mín.<input type="number" min={40} max={99} value={value.minOvr ?? ''} onChange={set('minOvr')} /></label>
      <label>Val. máx.<input type="number" min={40} max={99} value={value.maxOvr ?? ''} onChange={set('maxOvr')} /></label>
      <label>Orden
        <select value={value.sort ?? '-ovr'} onChange={set('sort')}>
          <option value="-ovr">Valoración ↓</option><option value="ovr">Valoración ↑</option><option value="name">Nombre</option>
        </select>
      </label>
    </form>
  );
}
```

`web/src/pages/PlayersPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { CardRow } from '../components/CardRow';
import { Filters } from '../components/Filters';
import { buildPlayersQuery, filtersFromSearch, type PlayerFilters } from '../query';

export function PlayersPage() {
  const [search, setSearch] = useSearchParams();
  const [filters, setFilters] = useState<PlayerFilters>(() => filtersFromSearch(search));
  const [qs, setQs] = useState(() => buildPlayersQuery(filters));
  useEffect(() => {
    const t = setTimeout(() => { const next = buildPlayersQuery(filters); setQs(next); setSearch(next, { replace: true }); }, 250);
    return () => clearTimeout(t);
  }, [filters, setSearch]);

  const meta = useApi(() => api.meta(), []);
  const list = useApi(() => api.players(qs), [qs]);
  const page = Number(filters.page ?? '1');
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <section>
      <h1>Jugadores</h1>
      <Filters meta={meta.data} value={filters} onChange={setFilters} />
      {list.error && <p className="error">No se pudo cargar la lista: {list.error}</p>}
      {list.loading && !list.data && <p className="empty">Cargando…</p>}
      {list.data && (
        <>
          <p className="muted">{list.data.total.toLocaleString('es-CL')} cartas</p>
          <div className="list">{list.data.items.map((c) => <CardRow key={c.eaId} card={c} />)}</div>
          {!list.data.items.length && <p className="empty">No hay cartas con esos filtros.</p>}
          <nav className="pager">
            <button disabled={page <= 1} onClick={() => setFilters({ ...filters, page: String(page - 1) })}>Anterior</button>
            <span>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setFilters({ ...filters, page: String(page + 1) })}>Siguiente</button>
          </nav>
        </>
      )}
    </section>
  );
}
```

`web/src/components/LineChart.tsx` (SVG propio, sin librería; colores y marcas según la skill `dataviz`):
```tsx
import { formatCoins, type PricePoint } from '@fut27/shared';

interface Series { name: string; points: PricePoint[]; color: string }

export function LineChart({ series, height = 220 }: { series: Series[]; height?: number }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="empty">Todavía no hay suficiente historial para graficar.</p>;
  const W = 640, H = height, P = { l: 56, r: 12, t: 12, b: 28 };
  const xs = all.map((p) => Date.parse(p.ts)), ys = all.map((p) => p.price);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (t: number) => P.l + ((t - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const sy = (v: number) => H - P.b - ((v - y0) / Math.max(1, y1 - y0)) * (H - P.t - P.b);
  const ticks = [y0, (y0 + y1) / 2, y1];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Historial de precio">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} className="chart__grid" />
            <text x={P.l - 6} y={sy(v)} className="chart__tick" textAnchor="end" dominantBaseline="middle">{formatCoins(Math.round(v))}</text>
          </g>
        ))}
        {series.filter((s) => s.points.length).map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2}
            points={s.points.map((p) => `${sx(Date.parse(p.ts))},${sy(p.price)}`).join(' ')} />
        ))}
        <text x={P.l} y={H - 8} className="chart__tick">{new Date(x0).toLocaleDateString('es-CL')}</text>
        <text x={W - P.r} y={H - 8} className="chart__tick" textAnchor="end">{new Date(x1).toLocaleDateString('es-CL')}</text>
      </svg>
      <figcaption>{series.filter((s) => s.points.length).map((s) => <span key={s.name} style={{ color: s.color }}>● {s.name}</span>)}</figcaption>
    </figure>
  );
}
```

`web/src/pages/PlayerPage.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { CardRow } from '../components/CardRow';
import { LineChart } from '../components/LineChart';
import { PriceTag } from '../components/PriceTag';

export function PlayerPage() {
  const id = Number(useParams().id);
  const { data, error, loading } = useApi(() => api.player(id), [id]);
  if (loading) return <p className="empty">Cargando…</p>;
  if (error || !data) return <p className="error">{error ?? 'Carta no encontrada'}</p>;
  const c = data.card;
  return (
    <section className="player">
      <div className="player__head">
        {c.imageUrl && <img src={c.imageUrl} alt={c.name} width={180} />}
        <div>
          <h1>{c.name} <span className="muted">{c.overall}</span></h1>
          <p>{[c.position, ...c.altPositions].join(' · ')} — {c.rarityName}</p>
          <p>{[c.clubName, c.leagueName, c.nationName].filter(Boolean).join(' · ')}</p>
          <PriceTag price={c.price} />
          <dl className="stats">{c.stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
          <p className="muted">Filigranas {c.skillMoves ?? '—'}★ · Pierna mala {c.weakFoot ?? '—'}★ · {c.foot ?? ''} · {c.height ? `${c.height} cm` : ''} · {c.age ? `${c.age} años` : ''}</p>
        </div>
      </div>
      <h2>Historial de precio</h2>
      <LineChart series={[
        { name: 'PC', points: data.history.pc, color: 'var(--pc)' },
        { name: 'Consola', points: data.history.consola, color: 'var(--consola)' },
      ]} />
      {data.versions.length > 0 && (<><h2>Otras versiones</h2><div className="list">{data.versions.map((v) => <CardRow key={v.eaId} card={v} />)}</div></>)}
    </section>
  );
}
```

En `web/src/App.tsx`, agregar:
```tsx
import { PlayersPage } from './pages/PlayersPage';
import { PlayerPage } from './pages/PlayerPage';
// dentro de <Routes>:
          <Route path="/jugadores" element={<PlayersPage />} />
          <Route path="/jugador/:id" element={<PlayerPage />} />
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -w web` → PASS. Run: `npm run build -w web` → OK.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): lista de jugadores con filtros y ficha con historial"
```

---

### Task 11: Web — Mercado

**Files:**
- Create: `web/src/pages/MarketPage.tsx`
- Modify: `web/src/App.tsx` (ruta `/mercado`)

**Interfaces:**
- Consumes: `api.floors()`, `api.movers()`, `LineChart`, `CardRow`, `formatCoins`.

- [ ] **Step 1: Implementar**

`web/src/pages/MarketPage.tsx`:
```tsx
import { formatCoins } from '@fut27/shared';
import { useState } from 'react';
import { api, useApi } from '../api';
import { CardRow } from '../components/CardRow';
import { LineChart } from '../components/LineChart';

export function MarketPage() {
  const floors = useApi(() => api.floors(), []);
  const movers = useApi(() => api.movers(), []);
  const [rating, setRating] = useState(86);
  const current = (floors.data?.current ?? []).filter((f) => f.rating >= 81 && f.rating <= 93);

  return (
    <section>
      <h1>Mercado</h1>
      <p className="muted">Precios de referencia de consola (FUT.GG). Los precios de PC llegan con la captura del bookmarklet (fase 3).</p>
      <h2>Pisos por valoración</h2>
      {floors.error && <p className="error">{floors.error}</p>}
      <div className="floors">
        {current.map((f) => (
          <button key={f.rating} className={`floor ${f.rating === rating ? 'floor--on' : ''}`} onClick={() => setRating(f.rating)}>
            <span>{f.rating}</span><strong>{formatCoins(f.price)}</strong>
          </button>
        ))}
      </div>
      {floors.data && (
        <LineChart series={[{ name: `Piso ${rating}`, color: 'var(--consola)', points: floors.data.history.filter((h) => h.rating === rating) }]} />
      )}
      <div className="grid">
        <div><h2>Suben (24 h)</h2>{movers.data?.up.map((m) => <div key={m.card.eaId}><CardRow card={m.card} /><small className="up">+{m.changePct}% · {formatCoins(m.from)} → {formatCoins(m.to)}</small></div>)}
          {movers.data && !movers.data.up.length && <p className="empty">Sin movimientos todavía.</p>}</div>
        <div><h2>Bajan (24 h)</h2>{movers.data?.down.map((m) => <div key={m.card.eaId}><CardRow card={m.card} /><small className="down">{m.changePct}% · {formatCoins(m.from)} → {formatCoins(m.to)}</small></div>)}
          {movers.data && !movers.data.down.length && <p className="empty">Sin movimientos todavía.</p>}</div>
      </div>
    </section>
  );
}
```

En `web/src/App.tsx`: `import { MarketPage } from './pages/MarketPage';` y `<Route path="/mercado" element={<MarketPage />} />`.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm test && npm run build` (raíz) → todo OK.

- [ ] **Step 3: Prueba local de punta a punta**

```bash
cd worker && npx wrangler d1 migrations apply fut27 --local && npx wrangler dev --test-scheduled
# en otra terminal:
curl "http://127.0.0.1:8787/__scheduled?cron=*/15+*+*+*+*"
curl "http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"
curl -s http://127.0.0.1:8787/api/status
```
Expected: `/api/status` muestra `futgg_market` y `futgg_players` con `last_ok`, `playerCount` > 0. Abrir `http://127.0.0.1:8787/jugadores` y revisar las cuatro pantallas en ancho de escritorio y 360 px.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): pantalla de mercado con pisos y subidas/bajadas"
```

---

### Task 12: Publicación en Cloudflare y GitHub

**Files:**
- Modify: `worker/wrangler.toml` (`database_id` real)
- Create: `README.md`

- [ ] **Step 1: Crear la base D1 y aplicar migraciones**

```bash
cd worker
npx wrangler d1 create fut27        # copiar el database_id al wrangler.toml
npx wrangler d1 migrations apply fut27 --remote
```

- [ ] **Step 2: Desplegar**

```bash
cd .. && npm run deploy
```
Expected: URL `https://fut27.la-fecha-futbolera.workers.dev` y los dos cron listados en la salida.

- [ ] **Step 3: Verificar en producción**

Esperar ~15 min y revisar `curl -s https://fut27.la-fecha-futbolera.workers.dev/api/status`: `futgg_market.last_ok` reciente, `futgg_players` avanzando por tramos sin `error_msg`. Si aparece "Exceeded CPU" en `npx wrangler tail`, bajar `PAGES_PER_RUN` a `2` y redeploy.

- [ ] **Step 4: README y repositorio privado**

`README.md` con: qué es, estructura del monorepo, `npm install`, `npm test`, desarrollo local (`wrangler dev --test-scheduled` + `npm run dev -w web`), deploy (`npm run deploy`), y la nota de que los precios de consola son referencia.

```bash
git add -A && git commit -m "chore: base D1 real, README y publicación"
gh repo create RenatoRiveraFIT/fut27 --private --source . --push
```
