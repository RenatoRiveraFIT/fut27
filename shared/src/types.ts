export type Platform = 'pc' | 'consola';
export type PriceLabel = 'pc' | 'consola' | 'estimado' | 'no_transferible' | 'sin_precio';

export interface FaceStat { label: string; value: number }

export interface Card {
  eaId: number;
  baseEaId: number;
  name: string;
  overall: number;
  position: string;
  altPositions: string[];
  clubId: number | null;
  clubName: string | null;
  leagueId: number | null;
  leagueName: string | null;
  nationId: number | null;
  nationName: string | null;
  rarityName: string;
  isIcon: boolean;
  isHero: boolean;
  isSbc: boolean;
  isObjective: boolean;
  isEvo: boolean;
  stats: FaceStat[];
  skillMoves: number | null;
  weakFoot: number | null;
  foot: string | null;
  height: number | null;
  age: number | null;
  playstyles: number[];
  playstylesPlus: number[];
  imageUrl: string | null;
}

export interface PriceRow { platform: Platform; price: number; source: string; updatedAt: string }

export interface ResolvedPrice {
  label: PriceLabel;
  value: number | null;
  updatedAt: string | null;
  /** Piso de consola de la valoración, como pista cuando no hay precio. */
  floorHint: number | null;
}

export type CardWithPrice = Card & { price: ResolvedPrice };

export interface PlayersResponse { items: CardWithPrice[]; page: number; pageSize: number; hasMore: boolean }
export interface PricePoint { ts: string; price: number }
export interface PlayerDetailResponse {
  card: CardWithPrice;
  versions: CardWithPrice[];
  history: { pc: PricePoint[]; consola: PricePoint[] };
}
export interface NamedRef { id: number; name: string }
export interface MetaResponse { leagues: NamedRef[]; nations: NamedRef[]; clubs: NamedRef[]; rarities: string[]; positions: string[] }
export interface FloorsResponse {
  platform: Platform;
  current: { rating: number; price: number; updatedAt: string }[];
  history: { rating: number; ts: string; price: number }[];
}
export interface Mover { card: CardWithPrice; from: number; to: number; changePct: number }
export interface MoversResponse { platform: Platform; up: Mover[]; down: Mover[] }
export interface SourceStatus { source: string; lastOk: string | null; lastError: string | null; errorMsg: string | null; detail: string | null }
export interface StatusResponse { sources: SourceStatus[]; playerCount: number; pricedCount: number; cursor: unknown }
