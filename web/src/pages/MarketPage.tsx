import { formatCoins, type Mover } from '@fut27/shared';
import { useState } from 'react';
import { api, useApi } from '../api';
import { CardRow } from '../components/CardRow';
import { LineChart } from '../components/LineChart';

function MoverList({ items, dir }: { items: Mover[]; dir: 'up' | 'down' }) {
  if (!items.length) return <p className="empty">Sin movimientos en las últimas 24 horas.</p>;
  return (
    <div className="list">
      {items.map((m) => (
        <div key={m.card.eaId}>
          <CardRow card={m.card} />
          <small className={`move ${dir}`}>{dir === 'up' ? '+' : ''}{m.changePct}%, de {formatCoins(m.from)} a {formatCoins(m.to)}</small>
        </div>
      ))}
    </div>
  );
}

export function MarketPage() {
  const floors = useApi(() => api.floors(), []);
  const movers = useApi(() => api.movers(), []);
  const [rating, setRating] = useState(86);
  const current = (floors.data?.current ?? []).filter((f) => f.rating >= 81 && f.rating <= 93);

  return (
    <section>
      <h1>Mercado</h1>
      <p className="muted">Precios de referencia de consola según FUT.GG. Los precios de PC se sumarán cuando captures tus búsquedas del mercado.</p>
      <h2>Precio más barato por valoración</h2>
      {floors.error && <p className="error">No se pudieron cargar los pisos: {floors.error}</p>}
      {floors.data && !current.length && <p className="empty">Todavía no hay pisos. Se cargan cada 15 minutos.</p>}
      <div className="floors" role="tablist" aria-label="Valoración">
        {current.map((f) => (
          <button key={f.rating} role="tab" aria-selected={f.rating === rating}
            className={`floor ${f.rating === rating ? 'floor--on' : ''}`} onClick={() => setRating(f.rating)}>
            <span>{f.rating}</span><strong>{formatCoins(f.price)}</strong>
          </button>
        ))}
      </div>
      {floors.data && current.length > 0 && (
        <LineChart label={`Piso de valoración ${rating} en los últimos 7 días`}
          series={[{ name: `Piso ${rating}`, color: 'var(--consola)', points: floors.data.history.filter((h) => h.rating === rating) }]} />
      )}
      {movers.error && <p className="error">No se pudieron cargar los movimientos: {movers.error}</p>}
      {movers.data && (
        <div className="grid">
          <div><h2>Suben en 24 horas</h2><MoverList items={movers.data.up} dir="up" /></div>
          <div><h2>Bajan en 24 horas</h2><MoverList items={movers.data.down} dir="down" /></div>
        </div>
      )}
    </section>
  );
}
