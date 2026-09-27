import type { Card, PriceRow, ResolvedPrice } from './types';

export type Floors = Record<number, number>;
export const CONSOLA_MAX_AGE_MS = 48 * 3_600_000;
/** Rarezas cuyo precio real suele ser el piso de su valoración. */
export const ESTIMABLE_RARITIES = new Set(['Common', 'Rare']);

export interface ResolvePriceInput {
  card: Pick<Card, 'overall' | 'rarityName' | 'isSbc' | 'isObjective' | 'isEvo'>;
  prices: PriceRow[];
  floors: Floors;
  now: Date;
}

export function resolvePrice({ card, prices, floors, now }: ResolvePriceInput): ResolvedPrice {
  const rawFloor = floors[card.overall];
  const floorHint = rawFloor && rawFloor > 0 ? rawFloor : null;

  if (card.isSbc || card.isObjective || card.isEvo) {
    return { label: 'no_transferible', value: null, updatedAt: null, floorHint: null };
  }
  const pc = prices.find((p) => p.platform === 'pc');
  if (pc) return { label: 'pc', value: pc.price, updatedAt: pc.updatedAt, floorHint };

  const consola = prices.find((p) => p.platform === 'consola');
  if (consola && now.getTime() - Date.parse(consola.updatedAt) <= CONSOLA_MAX_AGE_MS) {
    return { label: 'consola', value: consola.price, updatedAt: consola.updatedAt, floorHint };
  }
  if (floorHint !== null && ESTIMABLE_RARITIES.has(card.rarityName)) {
    return { label: 'estimado', value: floorHint, updatedAt: null, floorHint };
  }
  return { label: 'sin_precio', value: null, updatedAt: null, floorHint };
}
