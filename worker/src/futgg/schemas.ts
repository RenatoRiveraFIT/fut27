import { z } from 'zod';

const ref = z.object({ eaId: z.number(), name: z.string() });
const clubRef = ref.extend({ leagueEaId: z.number().nullish() });

export const futggPlayerSchema = z.object({
  eaId: z.number(),
  basePlayerEaId: z.number(),
  overall: z.number(),
  commonName: z.string().nullish(),
  cardName: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  position: z.string(),
  alternativePositions: z.array(z.string()).nullish(),
  uniqueClub: clubRef.nullish(),
  league: ref.nullish(),
  nation: ref.nullish(),
  rarityName: z.string(),
  isIcon: z.boolean(),
  isHero: z.boolean(),
  isSbc: z.boolean(),
  isObjective: z.boolean(),
  isEvolutionPlayerItem: z.boolean(),
  faceStatsV2: z.record(z.string(), z.number().nullable()).nullish(),
  skillMoves: z.number().nullish(),
  weakFoot: z.number().nullish(),
  foot: z.string().nullish(),
  height: z.number().nullish(),
  age: z.number().nullish(),
  playStyleEaIds: z.array(z.number()).nullish(),
  playStylePlusEaIds: z.array(z.number()).nullish(),
  cardImageUrl: z.string().nullish(),
});
export type FutggPlayer = z.infer<typeof futggPlayerSchema>;

export const playersPageSchema = z.object({
  data: z.array(futggPlayerSchema),
  next: z.number().nullable(),
  total: z.number(),
});

export const cheapestPerRatingSchema = z.object({ data: z.record(z.string(), z.number()) });

export const cheapestOverviewSchema = z.object({
  data: z.record(z.string(), z.array(z.object({ price: z.number(), eaId: z.number(), name: z.string(), overall: z.number() }))),
});
