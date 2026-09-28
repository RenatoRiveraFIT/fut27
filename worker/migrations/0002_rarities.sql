-- Rarezas precalculadas para /api/meta (evita un DISTINCT sobre toda la tabla players en cada carga).
CREATE TABLE rarities (name TEXT PRIMARY KEY);
INSERT OR IGNORE INTO rarities (name) SELECT DISTINCT rarity_name FROM players;
