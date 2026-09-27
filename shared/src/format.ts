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
