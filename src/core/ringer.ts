import { RINGER } from './bounty';
import { generatePlayer } from './generate';
import { MASCOT_ID } from './mascot';
import type { DressedTeam } from './matchup';
import { createNameMaker } from './names';
import { kindOf } from './playerKind';
import type { PlayerRecord } from './player';
import { createRng } from './rng';
import type { SkaterRatings } from '../sim/ratings';

/**
 * A ringer: a loan skater offered after a boss is beaten. He plays for you for the rest of the season
 * in place of your lowest-rated dressed skater, then leaves. He is not on your roster or your cap,
 * earns no XP and counts toward no milestone. One of those offered is better and costs Pucks a game.
 */
export interface Ringer {
  player: PlayerRecord;
  /** Pucks he costs after every game. */
  fee: number;
}

/** The id every ringer has: he is nobody's league player. */
export const RINGER_ID = 'guest/ringer';

/** True for a player in a dressed team who is not a league player: the mascot, or a ringer. */
export function isGuest(playerId: string): boolean {
  return playerId === MASCOT_ID || playerId.startsWith('guest/');
}

/**
 * The ringers on offer: fixed by the label (the season's seed and the boss beaten), each a skater with
 * a talent, a few points better than your team's average. The last is the best and the one that costs.
 */
export function ringerOffer(label: string, teamAverage: number, star?: { name: string; talent?: string }): Ringer[] {
  const rng = createRng(`${label}/ringers`);
  const names = createNameMaker(rng.fork('names'));
  const out: Ringer[] = [];
  for (let i = 0; i < RINGER.offers; i++) {
    const pricey = i === RINGER.offers - 1;
    const above = pricey ? RINGER.pricierAbove : rng.int(RINGER.above[0] as number, RINGER.above[1] as number);
    const made = generatePlayer(rng, names, RINGER_ID, rng.chance(0.65) ? 'F' : 'D', teamAverage + above);
    // Every ringer has the talent of his kind: that is what you are hiring.
    const talents = kindOf(made.position, made.ratings).talents;
    const player: PlayerRecord = { ...made, capHit: 0, contractYears: 0, ...(made.talent || talents.length === 0 ? {} : { talent: rng.pick(talents) }) };
    // The last, the one that costs, is the beaten boss's own man: his name, and his club's talent if it has one.
    const named: PlayerRecord = pricey && star ? { ...player, name: star.name, ...(star.talent ? { talent: star.talent } : {}) } : player;
    out.push({ player: named, fee: pricey ? RINGER.fee : 0 });
  }
  return out;
}

/** The dressed skater a guest would replace: the lowest rated (of equals, the later one). */
export function weakestSkater(team: DressedTeam): number {
  let slot = 0;
  team.players.slice(0, team.setup.skaters.length).forEach((p, i) => {
    if (p.overall <= (team.players[slot]?.overall ?? Infinity)) slot = i;
  });
  return slot;
}

/** Your dressed team with the ringer in your lowest-rated skater's place. The team given is left alone. */
export function withRinger(team: DressedTeam, ringer: Ringer): DressedTeam {
  const slot = weakestSkater(team);
  const count = team.setup.skaters.length;
  const record = ringer.player;
  const skaterModifiers = Array.from({ length: count }, (_, i) => (i === slot ? [] : (team.setup.skaterModifiers?.[i] ?? [])));
  const skaterTalents = Array.from({ length: count }, (_, i) => (i === slot ? (record.talent ? [record.talent] : []) : (team.setup.skaterTalents?.[i] ?? [])));
  return {
    ...team,
    players: team.players.map((p, i) => (i === slot ? record : p)),
    setup: {
      ...team.setup,
      skaters: team.setup.skaters.map((r, i) => (i === slot ? (record.ratings as SkaterRatings) : r)),
      positions: Array.from({ length: count }, (_, i) => (i === slot ? (record.position === 'D' ? 'D' : 'F') : (team.setup.positions?.[i] ?? 'F'))),
      skaterModifiers,
      skaterTalents,
    },
  };
}
