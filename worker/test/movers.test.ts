import { describe, expect, it } from 'vitest';
import { computeMovers } from '../src/market/movers';

const now = new Date('2026-09-28T12:00:00Z');
describe('computeMovers', () => {
  it('compara el precio actual con el vigente hace 24 h', () => {
    const rows = [
      { ea_id: 1, ts: '2026-09-27T08:00:00Z', price: 1000 },
      { ea_id: 1, ts: '2026-09-28T10:00:00Z', price: 1500 },
      { ea_id: 2, ts: '2026-09-27T09:00:00Z', price: 2000 },
      { ea_id: 2, ts: '2026-09-28T11:00:00Z', price: 1000 },
    ];
    const m = computeMovers(rows, now, 10);
    expect(m).toEqual([
      { eaId: 1, from: 1000, to: 1500, changePct: 50 },
      { eaId: 2, from: 2000, to: 1000, changePct: -50 },
    ]);
  });
  it('si no hay precio anterior a 24 h usa el más antiguo de la ventana; sin cambio no aparece', () => {
    const rows = [
      { ea_id: 3, ts: '2026-09-28T01:00:00Z', price: 800 },
      { ea_id: 3, ts: '2026-09-28T09:00:00Z', price: 1000 },
      { ea_id: 4, ts: '2026-09-28T09:00:00Z', price: 500 },
    ];
    expect(computeMovers(rows, now, 10)).toEqual([{ eaId: 3, from: 800, to: 1000, changePct: 25 }]);
  });
});
