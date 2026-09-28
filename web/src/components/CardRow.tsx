import { Link } from 'react-router-dom';
import type { CardWithPrice } from '@fut27/shared';
import { PriceTag } from './PriceTag';

export function CardRow({ card }: { card: CardWithPrice }) {
  const origin = [card.clubName, card.leagueName, card.nationName].filter(Boolean).join(', ');
  return (
    <Link to={`/jugador/${card.eaId}`} className="card-row">
      {card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" /> : <span className="card-row__ph" />}
      <span className="card-row__ovr">{card.overall}</span>
      <span className="card-row__main">
        <strong>{card.name}</strong>
        <small><span className="pos">{[card.position, ...card.altPositions].join(' / ')}</span>{card.rarityName}</small>
        <small>{origin}</small>
      </span>
      <PriceTag price={card.price} />
    </Link>
  );
}
