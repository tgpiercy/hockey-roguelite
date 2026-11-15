import rules from '../data/league.json';
import weights from '../data/overallWeights.json';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';
import { USER_TEAM_ID, type League, type Team } from './league';
import { autoLineup, emptyLineup } from './lineup';
import { createNameMaker, type NameMaker } from './names';
import { overallOf, rate, type PlayerRecord, type Position } from './player';
import { rollKind, talentChance, type PlayerKind } from './playerKind';
import { createRng, type Rng } from './rng';

const clampRating = (v: number): number => Math.max(rules.ratingMin, Math.min(rules.ratingMax, Math.round(v)));

/**
 * Ratings that average out to the wanted overall. Each rating is scattered around the target;
 * forwards lean toward shooting and defencemen toward checking; then everything is nudged up or
 * down together until the weighted overall lands on the target.
 */
function ratingsFor(rng: Rng, position: Position, target: number, kind: PlayerKind): SkaterRatings | GoalieRatings {
  const keys = Object.keys(weights[position]);
  const bias = (key: string): number => {
    if (position === 'F') return key === 'shooting' ? rules.positionBias : key === 'checking' ? -rules.positionBias : 0;
    if (position === 'D') return key === 'checking' ? rules.positionBias : key === 'shooting' ? -rules.positionBias : 0;
    return 0;
  };
  const values: Record<string, number> = {};
  // His kind leans him further: a sniper shoots well above his overall and checks well below it.
  for (const key of keys) values[key] = clampRating(target + rng.int(-rules.ratingSpread, rules.ratingSpread) + bias(key) + (kind.lean[key] ?? 0));

  const asRatings = (): SkaterRatings | GoalieRatings => values as unknown as SkaterRatings | GoalieRatings;
  for (let pass = 0; pass < 20; pass++) {
    const off = target - overallOf(position, asRatings());
    if (off === 0) break;
    // A big miss moves every rating together, which keeps his shape; the last point or two move one
    // rating at a time, heaviest first, so a single point of overall can be hit exactly.
    if (Math.abs(off) >= 2) {
      for (const key of keys) values[key] = clampRating((values[key] as number) + Math.sign(off) * (Math.abs(off) - 1));
      continue;
    }
    const order = [...keys].sort((a, b) => (weights[position] as Record<string, number>)[b]! - (weights[position] as Record<string, number>)[a]!);
    const key = order[pass % order.length] as string;
    values[key] = clampRating((values[key] as number) + Math.sign(off));
  }
  return asRatings();
}

/** Makes one player of a given position with (as near as possible) a given overall rating. */
export function generatePlayer(rng: Rng, names: NameMaker, id: string, position: Position, targetOverall: number): PlayerRecord {
  const target = Math.max(rules.ratingMin, Math.min(rules.ratingMax, Math.round(targetOverall)));
  const kind = rollKind(rng, position);
  const rated = rate({ position, ratings: ratingsFor(rng, position, target, kind) });
  const age = rng.int(rules.minAge, rules.maxAge);
  // The younger he is, the more room he may have left to grow.
  const youth = Math.max(0, (rules.potentialPeakAge - age) / (rules.potentialPeakAge - rules.minAge));
  const potential = Math.min(rules.ratingMax, rated.overall + Math.round(rng.next() * rules.potentialMaxBonus * youth));
  return {
    id,
    name: names.player(),
    age,
    potential,
    contractYears: rng.int(rules.minContractYears, rules.maxContractYears),
    xp: 0,
    level: 1,
    ...rated,
    // The better he is, the likelier he has the talent that goes with his kind.
    ...(kind.talent !== null && rng.chance(talentChance(rated.grade)) ? { talent: kind.talent } : {}),
  };
}

/**
 * Builds a whole league from a seed: the player's team (mostly C grade), the AI teams from weak to strong,
 * and a pool of free agents. Every team has 7 skaters and a goalie and fits under the cap.
 */
export function generateLeague(seed: string): League {
  const rng = createRng(seed);
  const names = createNameMaker(rng.fork('names'));
  const players: Record<string, PlayerRecord> = {};
  let count = 0;

  const add = (stream: Rng, position: Position, overall: number): PlayerRecord => {
    count += 1;
    const player = generatePlayer(stream, names, `p-${String(count).padStart(4, '0')}`, position, overall);
    players[player.id] = player;
    return player;
  };
  const position = (index: number): Position => (index < rules.forwardsPerTeam ? 'F' : 'D');

  const makeTeam = (id: string, stream: Rng, skaterTargets: number[], goalieTarget: number): Team => {
    // If the wanted team would break the cap, everyone is made a point worse until it fits.
    for (let drop = 0; ; drop++) {
      const before = count;
      const made = [
        ...skaterTargets.map((target, i) => add(stream, position(i), target - drop)),
        add(stream, 'G', goalieTarget - drop),
      ];
      if (made.reduce((sum, p) => sum + p.capHit, 0) <= rules.cap || drop >= 40) {
        const team: Team = { id, name: names.team(), roster: made.map((p) => p.id), lineup: emptyLineup() };
        return team;
      }
      for (const p of made) delete players[p.id];
      count = before;
    }
  };

  const teams: Team[] = [];
  teams.push(makeTeam(USER_TEAM_ID, rng.fork('user'), rules.userTeam.skaters, rules.userTeam.goalie));
  rules.aiTeamStrengths.forEach((strength, i) => {
    const stream = rng.fork(`team-${i}`);
    const skaters = rules.aiSkaterOffsets.map((offset) => strength + offset + stream.int(-1, 1));
    const goalie = strength + stream.int(-rules.aiGoalieSpread, rules.aiGoalieSpread);
    teams.push(makeTeam(`t-${String(i + 1).padStart(2, '0')}`, stream, skaters, goalie));
  });

  const pool = rng.fork('free-agents');
  const freeAgents = rules.freeAgents.map((spec) => add(pool, spec.position as Position, spec.overall).id);

  const league: League = { seed, season: 1, players, teams, freeAgents, userTeamId: USER_TEAM_ID };
  for (const team of teams) team.lineup = autoLineup(league, team);
  return league;
}
