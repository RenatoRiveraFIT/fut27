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
