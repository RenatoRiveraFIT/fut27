export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=60' : 'no-store' },
  });
}

export function intParam(v: string | null, min: number, max: number): number | null {
  if (v === null || !/^-?\d+$/.test(v)) return null;
  const n = Number(v);
  return n < min || n > max ? null : n;
}
