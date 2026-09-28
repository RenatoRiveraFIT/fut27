import { formatCoins, type PricePoint } from '@fut27/shared';
import { useState } from 'react';

interface Series { name: string; points: PricePoint[]; color: string }

const W = 640;
const P = { l: 56, r: 16, t: 12, b: 28 };

export function LineChart({ series, height = 220, label }: { series: Series[]; height?: number; label: string }) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const shown = series.filter((s) => s.points.length);
  const all = shown.flatMap((s) => s.points);
  if (all.length < 2) return <p className="empty">Todavía no hay historial suficiente. Se arma solo a medida que cambian los precios.</p>;

  const H = height;
  const xs = all.map((p) => Date.parse(p.ts));
  const ys = all.map((p) => p.price);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (t: number) => P.l + ((t - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const sy = (v: number) => H - P.b - ((v - y0) / Math.max(1, y1 - y0)) * (H - P.t - P.b);
  const ticks = y0 === y1 ? [y0] : [y0, (y0 + y1) / 2, y1];

  // Punto vigente de cada serie en el instante bajo el cursor (el precio es escalonado).
  const at = hoverX === null ? null : x0 + ((hoverX - P.l) / (W - P.l - P.r)) * (x1 - x0);
  const readings = at === null ? [] : shown.flatMap((s) => {
    const past = s.points.filter((p) => Date.parse(p.ts) <= at);
    const p = past[past.length - 1];
    return p ? [{ s, p }] : [];
  });

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = P.l + ((e.clientX - box.left) / box.width) * (W - P.l - P.r);
    setHoverX(Math.min(W - P.r, Math.max(P.l, x)));
  };

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} className="chart__grid" />
            <text x={P.l - 8} y={sy(v)} className="chart__tick" textAnchor="end" dominantBaseline="middle">{formatCoins(Math.round(v))}</text>
          </g>
        ))}
        {shown.map((s) => {
          // Línea escalonada: el precio se mantiene hasta el siguiente cambio.
          const pts = s.points.flatMap((p, i) => {
            const x = sx(Date.parse(p.ts)), y = sy(p.price);
            const prev = s.points[i - 1];
            return prev ? [`${x},${sy(prev.price)}`, `${x},${y}`] : [`${x},${y}`];
          });
          return <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" points={pts.join(' ')} />;
        })}
        <text x={P.l} y={H - 8} className="chart__tick">{new Date(x0).toLocaleDateString('es-CL')}</text>
        <text x={W - P.r} y={H - 8} className="chart__tick" textAnchor="end">{new Date(x1).toLocaleDateString('es-CL')}</text>
        {hoverX !== null && (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={P.t} y2={H - P.b} className="chart__cross" />
            {readings.map(({ s, p }) => <circle key={s.name} cx={hoverX} cy={sy(p.price)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
          </g>
        )}
        <rect x={P.l} y={P.t} width={W - P.l - P.r} height={H - P.t - P.b} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHoverX(null)} />
      </svg>
      {at !== null && readings.length > 0 && (
        <div className="chart__tip" style={{ left: `${(hoverX! / W) * 100}%` }}>
          <div className="muted">{new Date(at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</div>
          {readings.map(({ s, p }) => <div key={s.name}><i style={{ background: s.color }} />{s.name}: <strong>{formatCoins(p.price)}</strong></div>)}
        </div>
      )}
      {shown.length > 1 && (
        <figcaption>{shown.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</figcaption>
      )}
    </figure>
  );
}
