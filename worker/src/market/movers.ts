const DAY = 24 * 3_600_000;

export function computeMovers(rows: { ea_id: number; ts: string; price: number }[], now: Date, limit: number) {
  const byCard = new Map<number, { ts: number; price: number }[]>();
  for (const r of rows) {
    const list = byCard.get(r.ea_id) ?? [];
    list.push({ ts: Date.parse(r.ts), price: r.price });
    byCard.set(r.ea_id, list);
  }
  const cutoff = now.getTime() - DAY;
  const out: { eaId: number; from: number; to: number; changePct: number }[] = [];
  for (const [eaId, list] of byCard) {
    list.sort((a, b) => a.ts - b.ts);
    const to = list[list.length - 1]!.price;
    const before = list.filter((x) => x.ts <= cutoff);
    const from = (before.length ? before[before.length - 1]! : list[0]!).price;
    if (from === to || from <= 0) continue;
    out.push({ eaId, from, to, changePct: Math.round(((to - from) / from) * 1000) / 10 });
  }
  return out.sort((a, b) => b.changePct - a.changePct).slice(0, limit * 2);
}
