import { describe, expect, it } from 'vitest';
import page from './fixtures/players-page.json';
import { playersPageSchema } from '../src/futgg/schemas';
import { toPlayerRow } from '../src/futgg/mapPlayer';

const parsed = playersPageSchema.parse(page);
const now = '2026-09-27T12:00:00.000Z';

describe('toPlayerRow', () => {
  it('ícono usa el club ICON (uniqueClub) y la liga Icons', () => {
    const icon = parsed.data.find((p) => p.isIcon)!;
    const row = toPlayerRow(icon, now);
    expect(row.is_icon).toBe(1);
    expect(row.club).toEqual({ id: 112658, name: 'ICON', leagueId: 2118 });
    expect(row.league?.id).toBe(2118);
  });
  it('arquero usa las stats de portero', () => {
    const gk = parsed.data.find((p) => p.position === 'GK')!;
    const labels = JSON.parse(toPlayerRow(gk, now).stats).map((s: { label: string }) => s.label);
    expect(labels).toEqual(['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS']);
  });
  it('genera nombre de búsqueda sin acentos e incluye nombre completo', () => {
    const p = parsed.data.find((x) => !x.isIcon)!;
    const row = toPlayerRow(p, now);
    expect(row.search_name).toBe(row.search_name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    expect(row.search_name).toContain((p.lastName ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  });
  it('el hash no depende de updated_at', () => {
    const p = parsed.data[0]!;
    expect(toPlayerRow(p, now).hash).toBe(toPlayerRow(p, '2030-01-01T00:00:00.000Z').hash);
  });
});
