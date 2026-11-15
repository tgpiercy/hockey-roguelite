import { readTactics } from '../sim/tactics';
import leagueRules from '../data/league.json';
import { alwaysOnModifiers, talentOf } from './playerKind';
import { playStyle } from './playStyle';
import type { GameResult } from '../sim/match';
import rules from '../data/season.json';
import type { Modifier } from '../sim/modifiers';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';
import type { TeamSetup } from '../sim/world';
import { playerOf, type League, type Team } from './league';
import { abilityModifiers, boostedRatings } from './gear';
import { dressedSkaters } from './lineup';
import type { PlayerRecord } from './player';
import { canPlay } from './roster';
import type { TeamRecord } from './season';

/** A team ready for the ice: what the simulation needs, plus who is who for the summary screen. */
export interface DressedTeam {
  name: string;
  setup: TeamSetup;
  /** The dressed players in simulation order: line 1, line 2, then the goalie. */
  players: PlayerRecord[];
}

export interface DressOptions {
  /** Points added to every rating of a player for now (training and events), by player id. */
  bumps?: Record<string, number>;
  /** Points added to every rating of every player on the team (a harder league after prestige). */
  bumpAll?: number;
  /** Lasting modifiers for the whole team: artifacts, temporary effects, boss traits. */
  modifiers?: Modifier[];
  /** The modifiers one player gets from the gear he is wearing: rating boosts, perks and set bonuses. */
  gear?: (playerId: string) => Modifier[];
}

/** A player's ratings with a number of points added to each, held at the top of the scale. */
function bumped<T extends SkaterRatings | GoalieRatings>(ratings: T, points: number): T {
  if (points === 0) return ratings;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(ratings)) out[key] = Math.max(0, Math.min(rules.maxRating, value + points));
  return out as unknown as T;
}

/**
 * Turns a team's dressed lineup into the roster the simulation takes: six skaters
 * (line 1 then line 2, each with its centre first) and a goalie. Returns null if the lineup is not legal.
 */
const LINE_BONUS = leagueRules.lineBonus.modifiers as Modifier[];

/** True if one of the two dressed lines (the first three skaters, or the next three) has a forward and a defenceman. */
export function balancedLine(skaters: Pick<PlayerRecord, 'position'>[], line: 0 | 1): boolean {
  const three = skaters.slice(line * 3, line * 3 + 3);
  return three.some((p) => p.position === 'F') && three.some((p) => p.position === 'D');
}

export function dress(league: League, team: Team, options: DressOptions = {}): DressedTeam | null {
  if (!canPlay(league, team).ok) return null;
  const bump = (p: PlayerRecord): number => (options.bumps?.[p.id] ?? 0) + (options.bumpAll ?? 0);
  const gear = (p: PlayerRecord): Modifier[] => options.gear?.(p.id) ?? [];
  const skaters = dressedSkaters(team.lineup).map((id) => playerOf(league, id));
  const goalie = playerOf(league, team.lineup.goalie as string);
  // Gear's rating boosts change the ratings; its perks and set bonuses go to the ice as modifiers.
  return {
    name: team.name,
    players: [...skaters, goalie],
    setup: {
      skaters: skaters.map((p) => boostedRatings(bumped(p.ratings as SkaterRatings, bump(p)), gear(p))),
      goalie: boostedRatings(bumped(goalie.ratings as GoalieRatings, bump(goalie)), gear(goalie)),
      positions: skaters.map((p) => (p.position === 'D' ? 'D' : 'F')),
      modifiers: options.modifiers ?? [],
      skaterModifiers: skaters.map((p, i) => [...abilityModifiers(gear(p)), ...alwaysOnModifiers(talentOf(p)), ...(balancedLine(skaters, i < 3 ? 0 : 1) ? LINE_BONUS : [])]),
      skaterTalents: skaters.map((p) => (talentOf(p) ? [p.talent as string] : [])),
      goalieModifiers: abilityModifiers(gear(goalie)),
      // Every team but yours attacks in its own way; your linemates have no leaning.
      ...(team.id !== league.userTeamId ? { style: playStyle(team.name) } : {}),
      ...(team.lineup.heavy !== undefined ? { heavyLine: team.lineup.heavy } : {}),
      ...(team.lineup.tactics ? { tactics: readTactics(team.lineup.tactics) } : {}),
    },
  };
}

/** Adds a finished game to the record of the team that played as team 0. */
export function applyResult(record: TeamRecord, result: GameResult): TeamRecord {
  if (!result.finished || result.winner === null) return record;
  if (result.winner === 0) return { ...record, wins: record.wins + 1 };
  if (result.overtime) return { ...record, overtimeLosses: record.overtimeLosses + 1 };
  return { ...record, losses: record.losses + 1 };
}
