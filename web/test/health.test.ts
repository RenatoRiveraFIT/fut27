import { describe, expect, it } from 'vitest';
import { sourceHealth } from '../src/health';

const now = new Date('2026-09-28T12:00:00Z');
const base = { source: 'futgg_floors', detail: null, errorMsg: null };

describe('sourceHealth', () => {
  it('ok si el último éxito es reciente y posterior al último error', () => {
    expect(sourceHealth({ ...base, lastOk: '2026-09-28T11:50:00Z', lastError: '2026-09-28T10:00:00Z' }, now)).toBe('ok');
  });
  it('error si el último error es igual o posterior al último éxito', () => {
    expect(sourceHealth({ ...base, lastOk: '2026-09-28T11:50:00Z', lastError: '2026-09-28T11:50:00Z' }, now)).toBe('error');
    expect(sourceHealth({ ...base, lastOk: null, lastError: '2026-09-28T11:50:00Z' }, now)).toBe('error');
  });
  it('vencida si no hubo éxito en más de 1 hora (la sincronización se detuvo)', () => {
    expect(sourceHealth({ ...base, lastOk: '2026-09-28T10:30:00Z', lastError: null }, now)).toBe('stale');
  });
});
