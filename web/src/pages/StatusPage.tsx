import { api, useApi } from '../api';
import { sourceHealth, type Health } from '../health';

const NAMES: Record<string, string> = {
  futgg_players: 'Cartas (FUT.GG)',
  futgg_floors: 'Pisos por valoración (FUT.GG)',
  futgg_cheapest: 'Cartas más baratas (FUT.GG)',
};
const HEALTH_TEXT: Record<Health, string> = { ok: 'Al día', error: 'Con error', stale: 'Sin actualizar hace más de 1 hora' };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('es-CL') : '—');

export function StatusPage() {
  const { data, error, loading } = useApi(() => api.status(), []);
  if (loading) return <p className="empty">Cargando…</p>;
  if (error || !data) return <p className="error">No se pudo cargar el estado: {error}</p>;
  const now = new Date();
  return (
    <section>
      <h1>Estado de las fuentes</h1>
      <p className="muted">{data.playerCount.toLocaleString('es-CL')} cartas en la base, {data.pricedCount.toLocaleString('es-CL')} con precio de mercado.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Fuente</th><th>Estado</th><th>Último éxito</th><th>Detalle</th><th>Último error</th></tr></thead>
          <tbody>
            {data.sources.map((s) => {
              const health = sourceHealth(s, now);
              return (
                <tr key={s.source} className={health === 'ok' ? '' : `row--${health}`}>
                  <td>{NAMES[s.source] ?? s.source}</td>
                  <td>{HEALTH_TEXT[health]}</td>
                  <td>{fmt(s.lastOk)}</td>
                  <td>{s.detail ?? '—'}</td>
                  <td>{s.lastError ? `${fmt(s.lastError)}: ${s.errorMsg}` : '—'}</td>
                </tr>
              );
            })}
            {!data.sources.length && <tr><td colSpan={5}>Todavía no corre ninguna sincronización. Se ejecuta cada 15 minutos desde GitHub Actions.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
