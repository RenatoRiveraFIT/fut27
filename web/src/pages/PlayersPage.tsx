import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { CardRow } from '../components/CardRow';
import { Filters } from '../components/Filters';
import { buildPlayersQuery, filtersFromSearch, type PlayerFilters } from '../query';

export function PlayersPage() {
  const [search, setSearch] = useSearchParams();
  const [filters, setFilters] = useState<PlayerFilters>(() => filtersFromSearch(search));
  const [qs, setQs] = useState(() => buildPlayersQuery(filters));
  useEffect(() => {
    const t = setTimeout(() => { const next = buildPlayersQuery(filters); setQs(next); setSearch(next, { replace: true }); }, 250);
    return () => clearTimeout(t);
  }, [filters, setSearch]);

  const meta = useApi(() => api.meta(), []);
  const list = useApi(() => api.players(qs), [qs]);
  const page = Number(filters.page ?? '1');
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <section>
      <h1>Jugadores</h1>
      <Filters meta={meta.data} value={filters} onChange={setFilters} />
      {list.error && <p className="error">No se pudo cargar la lista: {list.error}</p>}
      {list.loading && !list.data && <p className="empty">Cargando…</p>}
      {list.data && (
        <>
          <p className="muted">{list.data.total.toLocaleString('es-CL')} cartas</p>
          <div className="list">{list.data.items.map((c) => <CardRow key={c.eaId} card={c} />)}</div>
          {!list.data.items.length && <p className="empty">Ninguna carta cumple esos filtros. Prueba quitando alguno.</p>}
          {pages > 1 && (
            <nav className="pager" aria-label="Páginas">
              <button disabled={page <= 1} onClick={() => setFilters({ ...filters, page: String(page - 1) })}>Anterior</button>
              <span>Página {page} de {pages}</span>
              <button disabled={page >= pages} onClick={() => setFilters({ ...filters, page: String(page + 1) })}>Siguiente</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
