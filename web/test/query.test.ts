import { describe, expect, it } from 'vitest';
import { buildPlayersQuery, filtersFromSearch } from '../src/query';

describe('buildPlayersQuery', () => {
  it('omite vacíos, recorta espacios y ordena las claves', () => {
    expect(buildPlayersQuery({ q: '  mbappé ', pos: '', league: '53', page: '1' })).toBe('league=53&q=mbapp%C3%A9');
  });
  it('mantiene la página si es mayor a 1', () => {
    expect(buildPlayersQuery({ page: '3' })).toBe('page=3');
  });
  it('ida y vuelta con URLSearchParams', () => {
    const f = filtersFromSearch(new URLSearchParams('q=vini&minOvr=85&x=1'));
    expect(f).toEqual({ q: 'vini', minOvr: '85' });
  });
});
