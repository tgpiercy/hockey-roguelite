import { overLimit } from './economy';
import leagueRules from '../data/league.json';
import rules from '../data/offseason.json';
import grades from '../data/grades.json';
import { ageOneYear, developOffIce, retires } from './aging';
import { clubStat } from './club';
import { bookSeasonEnd } from './economy';
import { releasePlayer } from './gear';
import { generatePlayer } from './generate';
import { goaliesOn, playerOf, rosterOf, skatersOn, userTeam, type League, type Team } from './league';
import { autoLineup, repairLineup } from './lineup';
import { createNameMaker, type NameMaker } from './names';
import { capHitOf, type PlayerRecord, type Position } from './player';
import { createRng, type Rng } from './rng';
import { payroll, type MoveResult } from './roster';
import { endSeason, type ActionResult, type Franchise, type OffseasonReport, type RatingChange } from './season';
import { tickTenure } from './scouting';
import { tickStaff } from './staff';
import { addXp, withAgeBonus } from './xp';

const MIN_CAP_HIT = capHitOf(0);

/** Takes a player out of the league for good: off his team or out of the pool, his gear back in the inventory. */
function removePlayer(f: Franchise, playerId: string): void {
  const { league } = f;
  for (const item of f.gear) if (item.wornBy === playerId) item.wornBy = null;
  for (const team of league.teams) {
    if (!team.roster.includes(playerId)) continue;
    team.roster = team.roster.filter((id) => id !== playerId);
    repairLineup(league, team);
  }
  league.freeAgents = league.freeAgents.filter((id) => id !== playerId);
  delete league.players[playerId];
}

/**
 * Ends the season and runs everything that happens between seasons, in order:
 * XP is banked and players level up, everyone ages, retirements, contracts tick down.
 * Your expiring contracts then wait for your decision; once there are none left to decide,
 * the AI teams make their moves and the rookie class arrives.
 */
export function finishSeason(f: Franchise): ActionResult {
  if (f.season.phase !== 'ended') return { ok: false, reason: 'The season is not over.' };
  const { league } = f;
  const mine = userTeam(league);
  const rng = createRng(`${league.seed}/offseason/${league.season}`);
  const report: OffseasonReport = { season: league.season, improved: [], declined: [], retired: [], leagueRetired: 0, news: [] };
  const before = new Map(mine.roster.map((id) => [id, playerOf(league, id).overall]));

  // 0. The books: sponsorship in, the season's bills out, for the team that played it.
  const closed = bookSeasonEnd(f);
  // Pay owed to players released a year ago has run its course.
  for (const team of league.teams) delete team.deadCap;

  // 1. Bank XP: your players level up from what they earned this season.
  let extraXp = 0;
  for (const id of mine.roster) {
    const player = playerOf(league, id);
    // Trainers and the training centre raise what a season's XP is worth.
    const boost = clubStat(f, 'xpGain', 1) * clubStat(f, `xpGain.${player.position}`, 1);
    // Your players' points are kept for you to spend.
    extraXp += withAgeBonus(player, f.season.xp[id] ?? 0) * (boost - 1);
    addXp(player, withAgeBonus(player, f.season.xp[id] ?? 0) * boost, true);
  }
  const waiting = mine.roster.reduce((sum, id) => sum + (playerOf(league, id).points ?? 0), 0);
  if (waiting > 0) report.news.push(`Your players earned ${waiting} skill point${waiting === 1 ? '' : 's'}: spend them under Team, Skill points.`);
  // Everyone else develops by a simple yearly rule.
  const mineSet = new Set(mine.roster);
  const everyone = Object.values(league.players).sort((a, b) => a.id.localeCompare(b.id));
  for (const player of everyone) if (!mineSet.has(player.id)) developOffIce(player, rng);

  // 2. Everyone ages a year.
  const gentler = clubStat(f, 'agingDecline', 1);
  for (const player of everyone) ageOneYear(player, rng, mineSet.has(player.id) ? gentler : 1);

  // What the club's buildings and staff did this season, in the report.
  const extraOf = (line: number, stat: string): number => {
    const scale = clubStat(f, stat, 1);
    return scale > 1 ? line * (1 - 1 / scale) : 0;
  };
  const extraMoney = extraOf(closed.ledger.tickets, 'ticketRevenue') + extraOf(closed.ledger.merchandise, 'merchRevenue') + extraOf(closed.ledger.sponsorship, 'sponsorRevenue');
  const percent = (x: number): number => Math.round(Math.abs(x) * 100);
  if (extraXp >= 1) report.news.push(`Your club: trainers and the training centre gave your players ${Math.round(extraXp)} more XP.`);
  if (gentler < 1) report.news.push(`Your club: the training centre took ${percent(1 - gentler)}% off what age cost your players.`);
  if (extraMoney >= 1) report.news.push(`Your club: the arena and your promoter brought in $${(extraMoney / 1_000_000).toFixed(2)}M more than the bare club would have.`);
  const drain = clubStat(f, 'drainScale', 1);
  if (drain < 1) report.news.push(`Your club: the medical wing had your players tiring ${percent(1 - drain)}% more slowly in every game.`);
  const arena = f.facilities.arena ?? 0;
  if (arena > 0) report.news.push(`Your club: a level ${arena} arena gave you home ice in every home game.`);

  const change = (id: string): RatingChange | null => {
    const player = league.players[id];
    const from = before.get(id);
    return player && from !== undefined && player.overall !== from ? { id, name: player.name, from, to: player.overall } : null;
  };
  for (const id of mine.roster) {
    const c = change(id);
    if (c) (c.to > c.from ? report.improved : report.declined).push(c);
  }

  // 3. Retirements.
  for (const player of everyone) {
    if (!retires(player, rng)) continue;
    report.leagueRetired += 1;
    if (mineSet.has(player.id)) report.retired.push(`${player.name} (${player.age})`);
    removePlayer(f, player.id);
  }

  // 4. Contracts tick down for everyone on a team.
  for (const team of league.teams) for (const id of team.roster) playerOf(league, id).contractYears -= 1;
  const pending = mine.roster.filter((id) => playerOf(league, id).contractYears <= 0);

  const ended = endSeason(f);
  if (!ended.ok) return ended;
  f.offseason = { report, pending, released: [], leagueMoved: false, signed: [] };
  // Staff contracts tick, a new staff pool arrives, and your players are a season better known.
  report.news.push(...tickStaff(f));
  tickTenure(f);
  if (pending.length === 0) leagueMoves(f);
  return { ok: true, message: 'The season is over. Here is what changed.' };
}

/**
 * What re-signing a player would cost a year: the cap hit for his grade as it stands now,
 * less the front office's discount if the franchise is given.
 */
export function resignCapHit(player: PlayerRecord, f?: Franchise, years = 1): number {
  // A longer deal costs more a year for a player still improving (you are buying his better years at
  // today's price) and less for one past his peak (he takes security over pay).
  const c = rules.contract;
  const perYear = player.age <= c.youngMaxAge ? c.youngPerYear : player.age >= c.oldMinAge ? -c.oldPerYear : 0;
  const full = Math.max(MIN_CAP_HIT, Math.round((capHitOf(player.overall) * (1 + perYear * (years - 1))) / grades.capRounding) * grades.capRounding);
  if (!f) return full;
  const discounted = Math.round(clubStat(f, 'resignCost', full) / grades.capRounding) * grades.capRounding;
  return Math.max(MIN_CAP_HIT, Math.min(full, discounted));
}

/**
 * Decides one of your expiring contracts. With a number of years he is re-signed at a cap hit set by his
 * current grade (refused if that breaks the cap); with null he is let go to the free-agent pool.
 * When the last one is decided, the rest of the league makes its moves.
 */
export function decideContract(f: Franchise, playerId: string, years: number | null): MoveResult {
  if (!f.offseason.pending.includes(playerId)) return { ok: false, reason: 'His contract is not up for renewal.' };
  const { league } = f;
  const team = userTeam(league);
  const player = playerOf(league, playerId);

  if (years === null) {
    const result = releasePlayer(f, playerId);
    if (!result.ok) return result;
    f.offseason.released.push(playerId);
  } else {
    if (!rules.resignYears.includes(years)) return { ok: false, reason: 'Contracts run from 1 to 4 years.' };
    const cost = resignCapHit(player, f, years);
    const after = payroll(league, team) - player.capHit + cost;

    if (after > leagueRules.cap) {
      const money = (n: number): string => `$${(n / 1_000_000).toFixed(2)}M`;
      return { ok: false, reason: `Over the cap: re-signing him at ${money(cost)} would put you at ${money(after)}.` };
    }
    // A raise has to fit under the owner's limit too; staying on the same pay or less always does.
    const limit = overLimit(f, cost - player.capHit, 0);
    if (!limit.ok) return limit;
    player.capHit = cost;
    player.contractYears = years;
  }
  f.offseason.pending = f.offseason.pending.filter((id) => id !== playerId);
  if (f.offseason.pending.length === 0 && !f.offseason.leagueMoved) leagueMoves(f);
  return { ok: true };
}

/** Signs a free agent to an AI team at the cap hit for his current grade. */
function aiSign(league: League, team: Team, player: PlayerRecord, rng: Rng): void {
  league.freeAgents = league.freeAgents.filter((id) => id !== player.id);
  team.roster.push(player.id);
  player.capHit = capHitOf(player.overall);
  player.contractYears = rng.int(leagueRules.minContractYears, leagueRules.maxContractYears);
}

/**
 * Fills an AI team up to 7 skaters and a goalie from the free-agent pool, best affordable first,
 * always leaving enough cap for the spots still empty. If nobody suitable is left, a replacement-level
 * player is brought in at the minimum salary, so a team can never be stuck short or over the cap.
 */
function fillRoster(f: Franchise, team: Team, rng: Rng, names: NameMaker, nextId: () => string): string[] {
  const { league } = f;
  const signed: string[] = [];
  const needs = (): { skaters: number; goalies: number } => ({
    skaters: leagueRules.rosterSkaters - skatersOn(league, team).length,
    goalies: leagueRules.rosterGoalies - goaliesOn(league, team).length,
  });

  for (let guard = 0; guard < 40; guard++) {
    const need = needs();
    if (need.skaters <= 0 && need.goalies <= 0) break;
    const wantGoalie = need.goalies > 0;
    const stillEmptyAfter = need.skaters + need.goalies - 1;
    const budget = leagueRules.cap - payroll(league, team) - stillEmptyAfter * MIN_CAP_HIT;
    // No room even for a minimum-salary player: the most expensive contract is let go to make space.
    if (budget < MIN_CAP_HIT) {
      const costly = rosterOf(league, team).sort((a, b) => b.capHit - a.capHit || a.id.localeCompare(b.id))[0];
      if (!costly) break;
      team.roster = team.roster.filter((id) => id !== costly.id);
      league.freeAgents.push(costly.id);
      continue;
    }
    const choice = league.freeAgents
      .map((id) => playerOf(league, id))
      .filter((p) => (p.position === 'G') === wantGoalie && capHitOf(p.overall) <= budget)
      .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))[0];

    if (choice) {
      aiSign(league, team, choice, rng);
      signed.push(choice.id);
    } else {
      const position: Position = wantGoalie ? 'G' : skatersOn(league, team).filter((p) => p.position === 'F').length < leagueRules.forwardsPerTeam ? 'F' : 'D';
      const player = generatePlayer(rng, names, nextId(), position, rules.replacementOverall);
      player.age = rng.int(rules.rookies.minAge, rules.rookies.maxAge + 4);
      player.capHit = MIN_CAP_HIT;
      league.players[player.id] = player;
      team.roster.push(player.id);
    }
  }
  return signed;
}

/**
 * The rest of the league's off-season: AI teams re-sign or drop their expiring players, then sign free
 * agents (including anyone you let go) until every roster is full and legal; a rookie class arrives;
 * and the free-agent pool is refreshed and kept to a sensible size.
 */
export function leagueMoves(f: Franchise): void {
  const { league } = f;
  const rng = createRng(`${league.seed}/league-moves/${league.season}`);
  const names = createNameMaker(rng.fork('names'), Object.values(league.players).map((p) => p.name));
  let made = 0;
  const nextId = (): string => `p-s${league.season}-${String(++made).padStart(3, '0')}`;
  const news = f.offseason.report?.news ?? [];
  const released = new Set(f.offseason.released);

  // Free agents are re-priced for their current grade before anyone shops.
  for (const id of league.freeAgents) playerOf(league, id).capHit = capHitOf(playerOf(league, id).overall);

  const aiTeams = league.teams.filter((t) => t.id !== league.userTeamId);

  // AI teams decide their own expiring contracts: keep the best they can afford, drop the old.
  for (const team of aiTeams) {
    const expiring = rosterOf(league, team).filter((p) => p.contractYears <= 0);
    for (const player of expiring) {
      const cost = capHitOf(player.overall);
      const fits = payroll(league, team) - player.capHit + cost <= leagueRules.cap;
      if (fits && player.age <= rules.aiResignMaxAge) {
        player.capHit = cost;
        player.contractYears = rng.int(leagueRules.minContractYears, leagueRules.maxContractYears);
      } else {
        team.roster = team.roster.filter((id) => id !== player.id);
        league.freeAgents.push(player.id);
      }
    }
  }

  // Then they fill their rosters, weakest team first.
  const strength = (team: Team): number => rosterOf(league, team).reduce((sum, p) => sum + p.overall, 0);
  for (const team of [...aiTeams].sort((a, b) => strength(a) - strength(b) || a.id.localeCompare(b.id))) {
    for (const id of fillRoster(f, team, rng, names, nextId)) {
      if (released.has(id)) news.push(`${playerOf(league, id).name}, whom you let go, signed with ${team.name}.`);
    }
    team.lineup = autoLineup(league, team);
  }

  // The rookie class.
  const r = rules.rookies;
  for (let i = 0; i < r.count; i++) {
    const position: Position = rng.chance(r.goalieShare) ? 'G' : rng.chance(0.57) ? 'F' : 'D';
    const player = generatePlayer(rng, names, nextId(), position, rng.int(r.minOverall, r.maxOverall));
    player.age = rng.int(r.minAge, r.maxAge);
    player.potential = Math.min(leagueRules.ratingMax, player.overall + rng.int(r.minPotentialBonus, r.maxPotentialBonus));
    league.players[player.id] = player;
    league.freeAgents.push(player.id);
  }
  // There must always be goalies to sign: if the pool is short of them, more rookies are found.
  const goaliesInPool = (): number => league.freeAgents.filter((id) => playerOf(league, id).position === 'G').length;
  while (goaliesInPool() < rules.poolMinGoalies) {
    const player = generatePlayer(rng, names, nextId(), 'G', rng.int(r.minOverall, r.maxOverall));
    player.age = rng.int(r.minAge, r.maxAge);
    player.potential = Math.min(leagueRules.ratingMax, player.overall + rng.int(r.minPotentialBonus, r.maxPotentialBonus));
    league.players[player.id] = player;
    league.freeAgents.push(player.id);
  }
  news.push(`${r.count} rookies have entered the free-agent pool.`);

  // There must always be someone a team with almost no cap space can afford: skaters and goalies both.
  const cheap = (goalie: boolean): PlayerRecord[] =>
    league.freeAgents
      .map((id) => playerOf(league, id))
      .filter((p) => (p.position === 'G') === goalie && capHitOf(p.overall) <= rules.cheapCapHit)
      .sort((x, y) => x.age - y.age || x.id.localeCompare(y.id));
  const ensureCheap = (goalie: boolean, wanted: number): void => {
    while (cheap(goalie).length < wanted) {
      const position: Position = goalie ? 'G' : rng.chance(0.57) ? 'F' : 'D';
      const player = generatePlayer(rng, names, nextId(), position, rules.replacementOverall);
      player.age = rng.int(r.minAge, r.maxAge + 2);
      league.players[player.id] = player;
      league.freeAgents.push(player.id);
    }
  };
  ensureCheap(false, rules.poolMinCheapSkaters);
  ensureCheap(true, rules.poolMinCheapGoalies);
  const protectedCheap = new Set(
    [...cheap(false).slice(0, rules.poolMinCheapSkaters), ...cheap(true).slice(0, rules.poolMinCheapGoalies)].map((p) => p.id),
  );

  // Keep the pool to a sensible size: the oldest drift out of the game.
  const pool = league.freeAgents.map((id) => playerOf(league, id));
  const keepGoalies = new Set(
    pool
      .filter((p) => p.position === 'G')
      .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
      .slice(0, rules.poolMinGoalies)
      .map((p) => p.id),
  );
  // The oldest go first, so the pool keeps its young and cheap players for teams short of cap space.
  const expendable = pool.filter((p) => !keepGoalies.has(p.id)).sort((a, b) => b.age - a.age || a.overall - b.overall || a.id.localeCompare(b.id));
  while (league.freeAgents.length > rules.poolTarget && expendable.length > 0) {
    const gone = expendable.shift() as PlayerRecord;
    if (protectedCheap.has(gone.id)) continue;
    league.freeAgents = league.freeAgents.filter((id) => id !== gone.id);
    delete league.players[gone.id];
  }
  // Everyone left in the pool is on offer at today's price, and anyone whose contract ran out asks for a new term.
  const terms = rng.fork('terms');
  for (const id of league.freeAgents) {
    const player = playerOf(league, id);
    player.capHit = capHitOf(player.overall);
    if (player.contractYears <= 0) player.contractYears = terms.int(leagueRules.minContractYears, leagueRules.maxContractYears);
  }

  f.offseason.leagueMoved = true;
}
