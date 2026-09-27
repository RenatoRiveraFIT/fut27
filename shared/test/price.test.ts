import { describe, expect, it } from 'vitest';
import { resolvePrice } from '../src/price';

const now = new Date('2026-09-27T12:00:00Z');
const base = { overall: 86, rarityName: 'Rare', isSbc: false, isObjective: false, isEvo: false };
const floors = { 86: 3700, 96: 0 };
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe('resolvePrice', () => {
  it('cartas de SBC, objetivos o evoluciones no son transferibles', () => {
    for (const flag of ['isSbc', 'isObjective', 'isEvo'] as const) {
      const r = resolvePrice({ card: { ...base, [flag]: true }, prices: [], floors, now });
      expect(r.label).toBe('no_transferible');
      expect(r.value).toBeNull();
    }
  });

  it('prefiere PC aunque sea antiguo', () => {
    const r = resolvePrice({
      card: base, floors, now,
      prices: [
        { platform: 'consola', price: 3500, source: 'futgg', updatedAt: hoursAgo(1) },
        { platform: 'pc', price: 4100, source: 'captura', updatedAt: hoursAgo(72) },
      ],
    });
    expect(r).toEqual({ label: 'pc', value: 4100, updatedAt: hoursAgo(72), floorHint: 3700 });
  });

  it('usa consola si es reciente', () => {
    const r = resolvePrice({ card: base, floors, now, prices: [{ platform: 'consola', price: 3500, source: 'futgg', updatedAt: hoursAgo(47) }] });
    expect(r.label).toBe('consola');
    expect(r.value).toBe(3500);
  });

  it('ignora consola con más de 48 h y estima con el piso', () => {
    const r = resolvePrice({ card: base, floors, now, prices: [{ platform: 'consola', price: 3500, source: 'futgg', updatedAt: hoursAgo(49) }] });
    expect(r).toEqual({ label: 'estimado', value: 3700, updatedAt: null, floorHint: 3700 });
  });

  it('cartas especiales sin precio quedan sin_precio con pista', () => {
    const r = resolvePrice({ card: { ...base, rarityName: 'Team of the week' }, prices: [], floors, now });
    expect(r).toEqual({ label: 'sin_precio', value: null, updatedAt: null, floorHint: 3700 });
  });

  it('un piso en 0 no cuenta como precio ni como pista', () => {
    const r = resolvePrice({ card: { ...base, overall: 96 }, prices: [], floors, now });
    expect(r).toEqual({ label: 'sin_precio', value: null, updatedAt: null, floorHint: null });
  });
});
