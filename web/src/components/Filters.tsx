import type { MetaResponse } from '@fut27/shared';
import type { PlayerFilters } from '../query';

interface Props { meta?: MetaResponse; value: PlayerFilters; onChange: (f: PlayerFilters) => void }

export function Filters({ meta, value, onChange }: Props) {
  const set = (k: keyof PlayerFilters) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value, page: '1' });
  const select = (k: keyof PlayerFilters, label: string, opts: { v: string; t: string }[], all = 'Todas') => (
    <label>{label}
      <select value={value[k] ?? ''} onChange={set(k)}>
        <option value="">{all}</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );
  return (
    <form className="filters" onSubmit={(e) => e.preventDefault()}>
      <label className="filters__q">Buscar<input type="search" placeholder="Nombre del jugador" value={value.q ?? ''} onChange={set('q')} /></label>
      {select('pos', 'Posición', (meta?.positions ?? []).map((p) => ({ v: p, t: p })))}
      {select('league', 'Liga', (meta?.leagues ?? []).map((l) => ({ v: String(l.id), t: l.name })))}
      {select('nation', 'Nación', (meta?.nations ?? []).map((n) => ({ v: String(n.id), t: n.name })))}
      {select('club', 'Club', (meta?.clubs ?? []).map((c) => ({ v: String(c.id), t: c.name })), 'Todos')}
      {select('rarity', 'Rareza', (meta?.rarities ?? []).map((r) => ({ v: r, t: r })))}
      {select('type', 'Tipo', [{ v: 'icon', t: 'Íconos' }, { v: 'hero', t: 'Héroes' }, { v: 'tradeable', t: 'Transferibles' }], 'Todos')}
      <label>Valoración mín.<input type="number" min={40} max={99} value={value.minOvr ?? ''} onChange={set('minOvr')} /></label>
      <label>Valoración máx.<input type="number" min={40} max={99} value={value.maxOvr ?? ''} onChange={set('maxOvr')} /></label>
      <label>Orden
        <select value={value.sort ?? '-ovr'} onChange={set('sort')}>
          <option value="-ovr">Mayor valoración</option><option value="ovr">Menor valoración</option><option value="name">Nombre</option>
        </select>
      </label>
    </form>
  );
}
