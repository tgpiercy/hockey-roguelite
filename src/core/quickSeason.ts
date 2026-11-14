import leagueRules from '../data/league.json';
import rules from '../data/offseason.json';
import type { GameResult, PlayerLine } from '../sim/match';
import type { SkaterRatings } from '../sim/ratings';
import { releasePlayer } from './gear';
import { goaliesOn, playerOf, rosterOf, skatersOn, userTeam } from './league';
import { autoLineup } from './lineup';
import type { DressedTeam } from './matchup';
import { decideContract, finishSeason, resignCapHit } from './offseason';
import { openPack } from './packs';
import { capHitOf } from './player';
import type { Rng } from './rng';
import { canSign, capSpace, payroll, sign } from './roster';
import {
  availableStops,
  buy,
  chooseEvent,
  currentStop,
  eventInfo,
  leaveShop,
  matchup,
  pickArtifact,
  recordGame,
  shopPrice,
  startSeason,
  train,
  travel,
  type Franchise,
} from './season';

const q = rules.quick;

/** Average of every rating of every dressed player, as the simulation would receive them. */
export function dressedStrength(team: DressedTeam): number {
  const all = [...team.setup.skaters, team.setup.goalie].flatMap((r) => Object.values(r));
  return all.reduce((sum, v) => sum + v, 0) / all.length;
}

/** The chance the stronger side wins, calibrated to the balance harness: a 20-point edge wins about 75%. */
export function winChance(edge: number): number {
  return 1 / (1 + 3 ** (-edge / q.ratingPointsFor75Percent));
}

/**
 * Settles a game from team strength, without simulating it, and makes up plausible player stats so that
 * XP, milestones and packs still flow. For multi-season health checks, where simulating every game would
 * take far too long. `levelEdge` is rating points taken off the home side for a sharper opponent AI.
 */
export function quickResult(rng: Rng, home: DressedTeam, away: DressedTeam, levelEdge = 0): GameResult {
  const won = rng.chance(winChance(dressedStrength(home) - dressedStrength(away) - levelEdge));
  const winnerGoals = rng.int(q.minGoals + 1, q.maxWinnerGoals);
  const loserGoals = rng.int(0, winnerGoals - 1);
  const mine = won ? winnerGoals : loserGoals;
  const theirs = won ? loserGoals : winnerGoals;

  const lines: PlayerLine[] = home.players.map((_, i) => ({
    id: i,
    team: 0,
    role: i === 6 ? 'goalie' : 'skater',
    line: i >= 3 && i < 6 ? 1 : 0,
    slot: i === 6 ? 0 : i % 3,
    goals: 0,
    assists: 0,
    shots: 0,
    hits: 0,
    blocks: 0,
    timeOnIce: i === 6 ? q.secondsOnIcePerGame * 2 : q.secondsOnIcePerGame,
    saves: 0,
    goalsAgainst: 0,
  }));
  // Goals go to skaters in proportion to shooting; each goal usually has an assist.
  const shooting = home.setup.skaters.map((r: SkaterRatings) => r.shooting);
  const total = shooting.reduce((s, v) => s + v, 0);
  const pickSkater = (): number => {
    let roll = rng.next() * total;
    for (let i = 0; i < shooting.length; i++) {
      roll -= shooting[i] as number;
      if (roll < 0) return i;
    }
    return 0;
  };
  for (let g = 0; g < mine; g++) {
    const scorer = pickSkater();
    lines[scorer]!.goals += 1;
    const helper = pickSkater();
    if (helper !== scorer) lines[helper]!.assists += 1;
  }
  for (let i = 0; i < 6; i++) {
    lines[i]!.shots = lines[i]!.goals + rng.int(1, Math.max(1, Math.round((q.shotsPerGoal * Math.max(1, mine)) / 6)));
    lines[i]!.hits = rng.int(0, Math.round(q.hitsPerGame / 3));
    lines[i]!.blocks = rng.int(0, Math.round(q.blocksPerGame / 3));
  }
  lines[6]!.saves = theirs * (q.shotsPerGoal - 1) + rng.int(0, 6);
  lines[6]!.goalsAgainst = theirs;

  return { score: [mine, theirs], winner: won ? 0 : 1, finished: true, overtime: false, periods: 3, players: lines, powerupsUsed: [] };
}

/**
 * An automatic manager's off-season: decide expiring contracts (keep anyone it can afford who is still
 * useful), then fill the roster with the best affordable free agents and dress the best six.
 */
export function autoOffseason(f: Franchise): void {
  const { league } = f;
  const team = userTeam(league);

  for (const id of [...f.offseason.pending]) {
    const player = playerOf(league, id);
    const affordable = payroll(league, team) - player.capHit + resignCapHit(player) <= leagueRules.cap;
    const useful = player.age <= q.autoKeepMaxAge || player.overall >= q.autoKeepOverall;
    if (!(affordable && useful && decideContract(f, id, player.age <= q.autoLongDealMaxAge ? q.autoLongDealYears : 1).ok)) decideContract(f, id, null);
  }

  for (let guard = 0; guard < 40; guard++) {
    const needSkater = skatersOn(league, team).length < leagueRules.rosterSkaters;
    const needGoalie = goaliesOn(league, team).length < leagueRules.rosterGoalies;
    if (!needSkater && !needGoalie) break;
    const emptyAfter =
      leagueRules.rosterSkaters - skatersOn(league, team).length + (leagueRules.rosterGoalies - goaliesOn(league, team).length) - 1;
    const budget = capSpace(league, team) - emptyAfter * capHitOf(0);
    const choice = league.freeAgents
      .map((id) => playerOf(league, id))
      .filter((p) => (p.position === 'G') === needGoalie && p.capHit <= budget && canSign(league, team, p.id).ok)
      .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))[0];
    if (choice && sign(league, team, choice.id).ok) continue;
    // Nobody affordable: let the most expensive contract go and try again.
    const costly = rosterOf(league, team).sort((a, b) => b.capHit - a.capHit || a.id.localeCompare(b.id))[0];
    if (!costly) break;
    releasePlayer(f, costly.id);
  }
  team.lineup = autoLineup(league, team);
  for (const pack of [...f.packs]) openPack(f, pack.id);
}

/** Plays one whole season quickly: random legal choices on the map, games settled from strength. */
export function quickSeason(f: Franchise, rng: Rng): void {
  if (!startSeason(f).ok) return;
  for (let guard = 0; guard < 400 && f.season.phase !== 'ended'; guard++) {
    const game = matchup(f);
    if (f.season.stage === 'reward') {
      pickArtifact(f, rng.pick(f.season.offer));
    } else if (game) {
      // A sharper opponent AI is worth some rating points, per 0.1 of level above the middle.
      const levelEdge = (game.level - 0.5) * 10 * q.ratingPointsPerTenthOfLevel;
      recordGame(f, quickResult(rng, game.home, game.away, levelEdge));
    } else if (f.season.current === null) {
      const options = availableStops(f);
      if (options.length === 0) break;
      travel(f, rng.pick(options).id);
    } else {
      const stop = currentStop(f)!;
      if (stop.kind === 'training') train(f, rng.pick(f.season.dressed));
      else if (stop.kind === 'event') chooseEvent(f, rng.int(0, eventInfo(stop.eventId!).choices.length - 1));
      else {
        const affordable = (stop.stock ?? []).filter((id) => shopPrice(f, id) <= f.season.currency);
        if (affordable.length > 0) buy(f, rng.pick(affordable));
        leaveShop(f);
      }
    }
  }
  if (f.season.phase === 'ended') finishSeason(f);
}

export interface LeagueSnapshot {
  season: number;
  /** How many rostered players are in each grade. */
  grades: Record<string, number>;
  averageAge: number;
  /** Teams without exactly 7 skaters and a goalie, or with an illegal lineup. */
  illegalRosters: number;
  /** Teams over the cap. */
  overCap: number;
  freeAgents: number;
  /** Average overall of your team, and of the AI teams. */
  userStrength: number;
  leagueStrength: number;
  players: number;
}

/** A health check of the whole league at one moment. */
export function leagueSnapshot(f: Franchise): LeagueSnapshot {
  const { league } = f;
  const grades: Record<string, number> = { S: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, 'C+': 0, C: 0, D: 0 };
  let ages = 0;
  let count = 0;
  let illegal = 0;
  let overCap = 0;
  let aiTotal = 0;
  let aiCount = 0;
  let userTotal = 0;
  let userCount = 0;
  for (const team of league.teams) {
    const roster = rosterOf(league, team);
    const isUser = team.id === league.userTeamId;
    for (const p of roster) {
      grades[p.grade] = (grades[p.grade] ?? 0) + 1;
      ages += p.age;
      count += 1;
      if (isUser) {
        userTotal += p.overall;
        userCount += 1;
      } else {
        aiTotal += p.overall;
        aiCount += 1;
      }
    }
    const full = skatersOn(league, team).length === leagueRules.rosterSkaters && goaliesOn(league, team).length === leagueRules.rosterGoalies;
    if (!full) illegal += 1;
    if (payroll(league, team) > leagueRules.cap) overCap += 1;
  }
  return {
    season: league.season,
    grades,
    averageAge: count === 0 ? 0 : ages / count,
    illegalRosters: illegal,
    overCap,
    freeAgents: league.freeAgents.length,
    userStrength: userCount === 0 ? 0 : userTotal / userCount,
    leagueStrength: aiCount === 0 ? 0 : aiTotal / aiCount,
    players: Object.keys(league.players).length,
  };
}
