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
