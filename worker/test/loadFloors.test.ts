import { describe, expect, it } from 'vitest';
import { createTestDb } from './d1';
import { loadFloors } from '../src/db/players';

describe('loadFloors', () => {
  it('ignora pisos con más de 48 h (la sincronización se detuvo)', async () => {
    const db = createTestDb();
    await db.batch([
      db.prepare("INSERT INTO floors VALUES (85, 'consola', 1500, '2026-09-27T00:00:00.000Z')"),
      db.prepare("INSERT INTO floors VALUES (86, 'consola', 3700, '2026-09-29T00:00:00.000Z')"),
    ]);
    expect(await loadFloors(db, 'consola', new Date('2026-09-29T12:00:00Z'))).toEqual({ 86: 3700 });
  });
});
