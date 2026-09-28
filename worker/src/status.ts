export async function markOk(db: D1Database, source: string, now: string, detail: string | null = null) {
  await db.prepare(
    `INSERT INTO source_status (source, last_ok, detail) VALUES (?1, ?2, ?3)
     ON CONFLICT(source) DO UPDATE SET last_ok = ?2, detail = ?3`,
  ).bind(source, now, detail).run();
}

export async function markError(db: D1Database, source: string, now: string, msg: string) {
  await db.prepare(
    `INSERT INTO source_status (source, last_error, error_msg) VALUES (?1, ?2, ?3)
     ON CONFLICT(source) DO UPDATE SET last_error = ?2, error_msg = ?3`,
  ).bind(source, now, msg).run();
}
