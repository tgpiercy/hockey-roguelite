import rules from '../data/league.json';
import { goaliesOn, skatersOn, type League, type Lineup, type Team } from './league';

export const LINE_SIZE = rules.dressedSkaters / 2;

export function emptyLineup(): Lineup {
  return {
    line1: Array.from({ length: LINE_SIZE }, () => null),
    line2: Array.from({ length: LINE_SIZE }, () => null),
    goalie: null,
  };
}

/** Every skater id in the lineup, in order: line 1 then line 2. Empty slots are left out. */
export function dressedSkaters(lineup: Lineup): string[] {
  return [...lineup.line1, ...lineup.line2].filter((id): id is string => id !== null);
}

/** What is wrong with a team's lineup, in plain words. An empty list means it is legal. */
export function lineupProblems(league: League, team: Team): string[] {
  const problems: string[] = [];
  const { lineup } = team;
  const skaters = new Set(skatersOn(league, team).map((p) => p.id));
  const goalies = new Set(goaliesOn(league, team).map((p) => p.id));
  const slots = [...lineup.line1, ...lineup.line2];

  if (lineup.line1.length !== LINE_SIZE || lineup.line2.length !== LINE_SIZE) problems.push(`Each line needs ${LINE_SIZE} skaters.`);
  if (slots.some((id) => id === null)) problems.push('A line has an empty spot.');
  const dressed = dressedSkaters(lineup);
  if (new Set(dressed).size !== dressed.length) problems.push('A skater is in the lineup twice.');
  if (dressed.some((id) => !skaters.has(id))) problems.push('A dressed skater is not on the roster.');
  if (lineup.goalie === null) problems.push('No goalie is dressed.');
  else if (!goalies.has(lineup.goalie)) problems.push('The dressed goalie is not on the roster.');
  return problems;
}

/** Best six skaters by overall: the top three on line 1, the next three on line 2, plus the best goalie. */
export function autoLineup(league: League, team: Team): Lineup {
  const skaters = skatersOn(league, team).map((p) => p.id);
  const lineup = emptyLineup();
  lineup.line1 = lineup.line1.map((_, i) => skaters[i] ?? null);
  lineup.line2 = lineup.line2.map((_, i) => skaters[LINE_SIZE + i] ?? null);
  lineup.goalie = goaliesOn(league, team)[0]?.id ?? null;
  return lineup;
}

/**
 * After a roster move: anyone no longer on the team is taken out of the lineup,
 * and empty spots are filled with the best skaters not already dressed.
 */
export function repairLineup(league: League, team: Team): void {
  const skaters = skatersOn(league, team).map((p) => p.id);
  const onRoster = new Set(skaters);
  const seen = new Set<string>();
  const keep = (id: string | null): string | null => {
    if (id === null || !onRoster.has(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  };
  const line1 = Array.from({ length: LINE_SIZE }, (_, i) => keep(team.lineup.line1[i] ?? null));
  const line2 = Array.from({ length: LINE_SIZE }, (_, i) => keep(team.lineup.line2[i] ?? null));

  const spare = skaters.filter((id) => !seen.has(id));
  const fill = (id: string | null): string | null => id ?? spare.shift() ?? null;
  team.lineup.line1 = line1.map(fill);
  team.lineup.line2 = line2.map(fill);

  const goalies = goaliesOn(league, team).map((p) => p.id);
  team.lineup.goalie = team.lineup.goalie !== null && goalies.includes(team.lineup.goalie) ? team.lineup.goalie : (goalies[0] ?? null);
}

/**
 * Puts a skater in a spot (line 0 or 1, slot 0 to 2). If he is already dressed elsewhere,
 * the two swap places, so nobody is ever in the lineup twice.
 */
export function setLineupSlot(league: League, team: Team, line: 0 | 1, slot: number, playerId: string): boolean {
  if (!skatersOn(league, team).some((p) => p.id === playerId)) return false;
  if (slot < 0 || slot >= LINE_SIZE) return false;
  const lines = [team.lineup.line1, team.lineup.line2] as const;
  const displaced = lines[line][slot] ?? null;
  for (const l of lines) {
    const at = l.indexOf(playerId);
    if (at !== -1) l[at] = displaced;
  }
  lines[line][slot] = playerId;
  return true;
}
