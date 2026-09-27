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
