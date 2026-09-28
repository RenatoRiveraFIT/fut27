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
