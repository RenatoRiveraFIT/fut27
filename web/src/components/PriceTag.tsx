import { formatCoins, type PriceLabel, type ResolvedPrice } from '@fut27/shared';

export const PRICE_LABEL_TEXT: Record<PriceLabel, string> = {
  pc: 'PC', consola: 'Consola', estimado: 'Estimado', no_transferible: 'No transferible', sin_precio: 'Sin precio',
};

export function PriceTag({ price }: { price: ResolvedPrice }) {
  const title = price.updatedAt ? `Actualizado ${new Date(price.updatedAt).toLocaleString('es-CL')}` : undefined;
  return (
    <span className={`price price--${price.label}`} title={title}>
      {price.value !== null && <strong>{formatCoins(price.value)}</strong>}
      {price.value === null && price.floorHint !== null && price.label === 'sin_precio' && <strong>desde {formatCoins(price.floorHint)}</strong>}
      <small>{PRICE_LABEL_TEXT[price.label]}</small>
    </span>
  );
}
