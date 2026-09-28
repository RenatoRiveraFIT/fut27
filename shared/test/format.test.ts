import { describe, expect, it } from 'vitest';
import { formatCoins, normalizeText } from '../src/format';

describe('formatCoins', () => {
  it('muestra números chicos completos', () => expect(formatCoins(650)).toBe('650'));
  it('usa K para miles', () => expect(formatCoins(27000)).toBe('27K'));
  it('usa un decimal en K cuando hace falta', () => expect(formatCoins(25250)).toBe('25,3K'));
  it('usa M para millones', () => expect(formatCoins(1885000)).toBe('1,89M'));
});

describe('normalizeText', () => {
  it('quita acentos y pasa a minúsculas', () => expect(normalizeText('Kylian Mbappé')).toBe('kylian mbappe'));
  it('colapsa espacios', () => expect(normalizeText('  Vini   Jr. ')).toBe('vini jr.'));
  it('translitera letras que NFD no descompone', () => {
    expect(normalizeText('Ødegaard')).toBe('odegaard');
    expect(normalizeText('Højlund')).toBe('hojlund');
    expect(normalizeText('Yıldız')).toBe('yildiz');
    expect(normalizeText('Błaszczykowski')).toBe('blaszczykowski');
    expect(normalizeText('Æ Œ Đ ß Þ')).toBe('ae oe d ss th');
  });
});
