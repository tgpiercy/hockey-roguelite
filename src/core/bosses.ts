import { playStyle } from './playStyle';
import bosses from '../data/bosses.json';
import leagueRules from '../data/league.json';
import rules from '../data/season.json';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';
import type { Modifier } from '../sim/modifiers';
import { generatePlayer } from './generate';
import { rosterOf, teamOf, type League } from './league';
import type { DressedTeam } from './matchup';
import { createNameMaker } from './names';
import type { PlayerRecord, Position } from './player';
import { createRng } from './rng';

export interface BossInfo {
  id: string;
  name: string;
  trait: string;
  description: string;
  modifiers: Modifier[];
}

export function bossInfo(id: string): BossInfo {
  const boss = bosses.find((b) => b.id === id) ?? bosses[0]!;
  return boss as BossInfo;
}

/** Average overall of a league team. */
export function teamStrength(league: League, teamId: string): number {
  const roster = rosterOf(league, teamOf(league, teamId));
  return roster.reduce((sum, p) => sum + p.overall, 0) / Math.max(1, roster.length);
}

/** The AI teams' ids, weakest first. */
export function aiTeamsByStrength(league: League): string[] {
  return league.teams
    .filter((t) => t.id !== league.userTeamId)
    .map((t) => t.id)
    .sort((a, b) => teamStrength(league, a) - teamStrength(league, b) || a.localeCompare(b));
}

/**
 * Builds a boss team, ready for the ice: a generated roster a few points stronger than the best team
 * of its region, carrying the boss's signature trait as team modifiers. It is not part of the league.
 */
export function buildBoss(league: League, bossId: string, region: number, seed: string, tougher = 0): DressedTeam {
  const boss = bossInfo(bossId);
  const order = aiTeamsByStrength(league);
  const tierSize = Math.max(1, Math.floor(order.length / rules.regions));
  const tierEnd = region === rules.regions - 1 ? order.length : (region + 1) * tierSize;
  const strongest = order[Math.max(0, tierEnd - 1)] as string;
  const strength = Math.round(teamStrength(league, strongest)) + rules.bossStrengthBonus + tougher;

  const rng = createRng(`${seed}/boss/${bossId}`);
  const names = createNameMaker(rng.fork('names'));
  const offsets = leagueRules.aiSkaterOffsets.slice(0, leagueRules.dressedSkaters);
  const positions: Position[] = ['F', 'F', 'D', 'F', 'F', 'D'];
  const skaters: PlayerRecord[] = offsets.map((offset, i) =>
    generatePlayer(rng, names, `boss-${bossId}-${i}`, positions[i % positions.length] as Position, strength + offset),
  );
  const goalie = generatePlayer(rng, names, `boss-${bossId}-g`, 'G', strength + 2);

  return {
    name: boss.name,
    players: [...skaters, goalie],
    setup: {
      skaters: skaters.map((p) => p.ratings as SkaterRatings),
      goalie: goalie.ratings as GoalieRatings,
      positions: skaters.map((p) => (p.position === 'D' ? 'D' : 'F')),
      modifiers: boss.modifiers,
      style: playStyle(boss.name),
    },
  };
}
