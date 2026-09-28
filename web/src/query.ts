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
