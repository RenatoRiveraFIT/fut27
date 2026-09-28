import type { SourceStatus } from '@fut27/shared';

export type Health = 'ok' | 'error' | 'stale';
/** La sincronización corre cada 15 min; sin un éxito en 1 hora, algo la detuvo. */
const STALE_MS = 60 * 60_000;

export function sourceHealth(s: SourceStatus, now: Date): Health {
  if (s.lastError && (!s.lastOk || s.lastError >= s.lastOk)) return 'error';
  if (!s.lastOk || now.getTime() - Date.parse(s.lastOk) > STALE_MS) return 'stale';
  return 'ok';
}
