import { normalizeText } from '@fut27/shared';
import type { FutggPlayer } from './schemas';

export interface PlayerRow {
  ea_id: number; base_ea_id: number; name: string; search_name: string; overall: number;
  position: string; alt_positions: string; club_id: number | null; league_id: number | null; nation_id: number | null;
  rarity_name: string; is_icon: number; is_hero: number; is_sbc: number; is_objective: number; is_evo: number;
  stats: string; skill_moves: number | null; weak_foot: number | null; foot: string | null; height: number | null; age: number | null;
  playstyles: string; playstyles_plus: string; image_url: string | null; hash: string; updated_at: string;
  club: { id: number; name: string; leagueId: number | null } | null;
  league: { id: number; name: string } | null;
  nation: { id: number; name: string } | null;
}

const OUTFIELD: [string, string][] = [['PAC', 'facePace'], ['SHO', 'faceShooting'], ['PAS', 'facePassing'], ['DRI', 'faceDribbling'], ['DEF', 'faceDefending'], ['PHY', 'facePhysicality']];
const KEEPER: [string, string][] = [['DIV', 'gkFaceDiving'], ['HAN', 'gkFaceHandling'], ['KIC', 'gkFaceKicking'], ['REF', 'gkFaceReflexes'], ['SPD', 'gkFaceSpeed'], ['POS', 'gkFacePositioning']];

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export function toPlayerRow(p: FutggPlayer, now: string): PlayerRow {
  const name = p.commonName || p.cardName || [p.firstName, p.lastName].filter(Boolean).join(' ') || String(p.eaId);
  const face = p.faceStatsV2 ?? {};
  const stats = (p.position === 'GK' ? KEEPER : OUTFIELD).map(([label, key]) => ({ label, value: face[key] ?? 0 }));
  const row: Omit<PlayerRow, 'hash' | 'updated_at'> = {
    ea_id: p.eaId,
    base_ea_id: p.basePlayerEaId,
    name,
    search_name: normalizeText([name, p.firstName, p.lastName].filter(Boolean).join(' ')),
    overall: p.overall,
    position: p.position,
    alt_positions: JSON.stringify(p.alternativePositions ?? []),
    club_id: p.uniqueClub?.eaId ?? null,
    league_id: p.league?.eaId ?? null,
    nation_id: p.nation?.eaId ?? null,
    rarity_name: p.rarityName,
    is_icon: Number(p.isIcon), is_hero: Number(p.isHero), is_sbc: Number(p.isSbc),
    is_objective: Number(p.isObjective), is_evo: Number(p.isEvolutionPlayerItem),
    stats: JSON.stringify(stats),
    skill_moves: p.skillMoves ?? null, weak_foot: p.weakFoot ?? null, foot: p.foot ?? null,
    height: p.height ?? null, age: p.age ?? null,
    playstyles: JSON.stringify(p.playStyleEaIds ?? []),
    playstyles_plus: JSON.stringify(p.playStylePlusEaIds ?? []),
    image_url: p.cardImageUrl ?? null,
    club: p.uniqueClub ? { id: p.uniqueClub.eaId, name: p.uniqueClub.name, leagueId: p.uniqueClub.leagueEaId ?? null } : null,
    league: p.league ? { id: p.league.eaId, name: p.league.name } : null,
    nation: p.nation ? { id: p.nation.eaId, name: p.nation.name } : null,
  };
  return { ...row, hash: fnv1a(JSON.stringify(row)), updated_at: now };
}
