# FUT27

App personal estilo FUT.GG / FUTBIN para EA FC 27 Ultimate Team (mercado de PC).

Publicada en https://fut27.la-fecha-futbolera.workers.dev

## Qué hace hoy (fase 1)

- Sincroniza las ~19.900 cartas de FC 27 desde FUT.GG, por tramos de valoración, en un ciclo diario.
- Cada 15 minutos guarda el precio más barato por valoración y las cartas más baratas de cada valoración.
- La sincronización corre en **GitHub Actions** (`.github/workflows/sync.yml`) y escribe en D1 por la API de Cloudflare:
  FUT.GG responde 403 a las peticiones que salen de Cloudflare Workers. Secretos del repo: `CLOUDFLARE_API_TOKEN`
  (permiso D1 Edit), `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`.
- Pantallas: Jugadores (buscador con filtros), Ficha (stats, versiones, historial), Mercado (pisos, subidas y bajadas) y Estado.

Los precios libres de FUT.GG son de **consola** y se muestran como referencia. Los de PC llegan en la fase 3,
con la captura de las búsquedas que hagas en la Web App de EA. Cada precio indica de dónde sale:
PC, Consola, Estimado (piso de su valoración), Sin precio o No transferible.

## Estructura

```
shared/   tipos y lógica pura (precios, formato)
worker/   Cloudflare Worker: cron de scraping, API /api/* y assets de la web; esquema D1 en migrations/
web/      Vite + React
docs/     spec y planes
```

## Desarrollo

```bash
npm install
npm test                 # shared + worker + web
npm run typecheck

# local: API + web compilada
npm run build
cd worker && npx wrangler d1 migrations apply fut27 --local && npx wrangler dev

# una sincronización manual contra la base remota (mismas variables que en Actions)
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... D1_DATABASE_ID=... PAGES_PER_RUN=10 npx tsx worker/src/sync/cli.ts

# web con recarga en caliente (usa el worker local como API)
npm run dev -w web
```

## Publicar

```bash
npm run deploy                                   # compila la web y despliega el Worker
cd worker && npx wrangler d1 migrations apply fut27 --remote   # solo si hay migraciones nuevas
```
