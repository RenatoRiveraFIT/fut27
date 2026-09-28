import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceTag } from '../src/components/PriceTag';

describe('PriceTag', () => {
  it('muestra valor y etiqueta de plataforma', () => {
    const html = renderToStaticMarkup(<PriceTag price={{ label: 'consola', value: 25250, updatedAt: '2026-09-27T12:00:00Z', floorHint: 25000 }} />);
    expect(html).toContain('25,3K');
    expect(html).toContain('Consola');
  });
  it('sin precio muestra la pista del piso', () => {
    const html = renderToStaticMarkup(<PriceTag price={{ label: 'sin_precio', value: null, updatedAt: null, floorHint: 3700 }} />);
    expect(html).toContain('desde 3,7K');
  });
  it('no transferible no muestra monedas', () => {
    const html = renderToStaticMarkup(<PriceTag price={{ label: 'no_transferible', value: null, updatedAt: null, floorHint: null }} />);
    expect(html).toContain('No transferible');
  });
});
