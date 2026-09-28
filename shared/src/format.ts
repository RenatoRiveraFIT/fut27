function trim(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(/\.?0+$/, '').replace('.', ',');
}

export function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000, 2)}M`;
  if (n >= 1_000) return `${trim(n / 1_000, 1)}K`;
  return String(n);
}

/** Letras que NFD no descompone en base + diacrítico. */
const TRANSLIT: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', ı: 'i', đ: 'd', ß: 'ss', þ: 'th', ð: 'd' };

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[øæœłıđßþð]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ');
}
