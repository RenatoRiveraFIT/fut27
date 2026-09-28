import { handleApi } from './api/router';
import type { Env } from './env';

// La sincronización con FUT.GG no corre aquí: FUT.GG bloquea (403) las peticiones que salen de Workers.
// Corre en GitHub Actions (worker/src/sync/cli.ts) y escribe en la misma base D1.
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
};
