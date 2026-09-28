import { api, useApi } from '../api';

const NAMES: Record<string, string> = { futgg_players: 'Cartas (FUT.GG)', futgg_market: 'Mercado (FUT.GG)' };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('es-CL') : '—');

export function StatusPage() {
  const { data, error, loading } = useApi(() => api.status(), []);
  if (loading) return <p className="empty">Cargando…</p>;
  if (error || !data) return <p className="error">No se pudo cargar el estado: {error}</p>;
  return (
    <section>
      <h1>Estado de las fuentes</h1>
      <p className="muted">{data.playerCount.toLocaleString('es-CL')} cartas en la base, {data.pricedCount.toLocaleString('es-CL')} con precio de mercado.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Fuente</th><th>Último éxito</th><th>Detalle</th><th>Último error</th></tr></thead>
          <tbody>
            {data.sources.map((s) => {
              const failing = s.lastError && (!s.lastOk || s.lastError > s.lastOk);
              return (
                <tr key={s.source} className={failing ? 'row--error' : ''}>
                  <td>{NAMES[s.source] ?? s.source}</td>
                  <td>{fmt(s.lastOk)}</td>
                  <td>{s.detail ?? '—'}</td>
                  <td>{s.lastError ? `${fmt(s.lastError)}: ${s.errorMsg}` : '—'}</td>
                </tr>
              );
            })}
            {!data.sources.length && <tr><td colSpan={4}>Todavía no corre ninguna sincronización. La primera empieza en menos de un minuto.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
