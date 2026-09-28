import { useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { CardRow } from '../components/CardRow';
import { LineChart } from '../components/LineChart';
import { PriceTag } from '../components/PriceTag';

export function PlayerPage() {
  const id = Number(useParams().id);
  const { data, error, loading } = useApi(() => api.player(id), [id]);
  if (loading) return <p className="empty">Cargando…</p>;
  if (error || !data) return <p className="error">{error ?? 'Carta no encontrada'}</p>;
  const c = data.card;
  const facts = [
    c.skillMoves != null && `Filigranas ${c.skillMoves}★`,
    c.weakFoot != null && `Pierna mala ${c.weakFoot}★`,
    c.foot && (c.foot === 'Left' ? 'Zurdo' : 'Diestro'),
    c.height && `${c.height} cm`,
    c.age && `${c.age} años`,
  ].filter(Boolean) as string[];
  return (
    <section className="player">
      <div className="player__head">
        {c.imageUrl && <img src={c.imageUrl} alt={c.name} />}
        <div>
          <h1><span className="player__ovr">{c.overall}</span>{c.name}</h1>
          <p><span className="pos">{[c.position, ...c.altPositions].join(' / ')}</span>{c.rarityName}</p>
          <p className="muted">{[c.clubName, c.leagueName, c.nationName].filter(Boolean).join(', ')}</p>
          <PriceTag price={c.price} />
          <dl className="stats">{c.stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
          <ul className="facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      </div>
      <h2>Historial de precio</h2>
      <LineChart label={`Historial de precio de ${c.name}`} series={[
        { name: 'PC', points: data.history.pc, color: 'var(--pc)' },
        { name: 'Consola', points: data.history.consola, color: 'var(--consola)' },
      ]} />
      {data.versions.length > 0 && (<><h2>Otras versiones</h2><div className="list">{data.versions.map((v) => <CardRow key={v.eaId} card={v} />)}</div></>)}
    </section>
  );
}
