import leagueRules from '../data/league.json';
import rules from '../data/offseason.json';
import type { GameResult, PlayerLine } from '../sim/match';
import type { SkaterRatings } from '../sim/ratings';
import { bailOut, inFireSale, playerSalePrice, seasonEndBills } from './economy';
import { build, buildCost, FACILITIES, facilityLevel, totalFacilityLevels } from './facilities';
import { releasePlayer } from './gear';
import { totals } from './ledger';
import { goaliesOn, playerOf, rosterOf, skatersOn, userTeam } from './league';
import { autoLineup } from './lineup';
import type { DressedTeam } from './matchup';
import { decideContract, finishSeason, resignCapHit } from './offseason';
import { openPack } from './packs';
import { capHitOf } from './player';
import type { Rng } from './rng';
import { canSign, capSpace, payroll } from './roster';
import { hiddenFreeAgents, signPlayer } from './scouting';
import { levelEdge, quickResult } from './quickGame';
import { costumeCost, upgradeCostume } from './mascot';
import { gradePower, hire, letGo, roleOf, slotsFor, staffOfKind, staffSalePrice } from './staff';
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

export { dressedStrength, quickResult, winChance } from './quickGame';

/** How an automatic manager handles money. "none" spends nothing beyond filling the roster. */
export type ManagerStyle = 'none' | 'cautious' | 'balanced' | 'spender';

/** What happened to the money in one automatic off-season. */
export interface OffseasonMoney {
  /** True if cash was below zero and contracts had to be sold. */
  fireSale: boolean;
  /** True if the league had to cover the debt. */
  bailedOut: boolean;
}

const styleRules = (style: ManagerStyle) => q.styles[style === 'none' ? 'spender' : style];

/** What the season's fixed bills will come to as things stand. */
function billsOf(f: Franchise): number {
  const bills = seasonEndBills(f);
  return bills.salaries + bills.staff + bills.upkeep + bills.mascot;
}

/** What the manager expects to take in next season: last season's income, or a first guess. */
function expectedIncome(f: Franchise): number {
  const last = f.books[f.books.length - 1];
  return last ? totals(last.ledger).income - last.ledger.sales : q.firstSeasonIncome;
}

/** The most the manager is willing to pay its players next season. "none" and the spender only mind the cap. */
function payrollBudget(f: Franchise, style: ManagerStyle): number {
  if (style === 'none' || style === 'spender') return leagueRules.cap;
  const bills = seasonEndBills(f);
  const spare = Math.max(0, f.cash) * styleRules(style).cashShareForPayroll;
  return Math.min(leagueRules.cap, expectedIncome(f) - bills.staff - bills.upkeep - bills.mascot + spare);
}

/** Out of cash: sell staff contracts, then the most expensive player contracts, then ask the league. */
function resolveFireSale(f: Franchise): OffseasonMoney {
  const money: OffseasonMoney = { fireSale: false, bailedOut: false };
  if (!inFireSale(f)) return money;
  money.fireSale = true;
  for (const member of [...f.staff].sort((x, y) => y.salary - x.salary)) {
    if (!inFireSale(f)) return money;
    if (staffSalePrice(f, member) > 0) letGo(f, member.id);
  }
  const team = userTeam(f.league);
  for (let guard = 0; guard < 20 && inFireSale(f); guard++) {
    const sellable = rosterOf(f.league, team)
      .filter((p) => playerSalePrice(f, p) > 0)
      .sort((x, y) => y.capHit - x.capHit || x.id.localeCompare(y.id))[0];
    if (!sellable) break;
    releasePlayer(f, sellable.id);
  }
  if (inFireSale(f) && bailOut(f).ok) money.bailedOut = true;
  return money;
}

/** Spends spare cash the way the style says: staff, then facilities, then the mascot's costume. */
function spend(f: Franchise, style: ManagerStyle): void {
  if (style === 'none') return;
  const rulesFor = styleRules(style);
  const reserve = (): number => billsOf(f) * rulesFor.reserveShareOfBills;
  const income = expectedIncome(f);

  // Staff: the best affordable person for each empty job, promoters first because they pay for themselves.
  const order = ['promoter', 'scout', 'trainer', 'trainer'] as const;
  for (const kind of order) {
    if (staffOfKind(f, kind).length >= slotsFor(kind)) continue;
    const pick = f.staffPool
      .filter((m) => roleOf(m).kind === kind && gradePower(m.grade) <= rulesFor.maxStaffPower && m.salary <= income * rulesFor.maxStaffSalaryShare)
      .sort((x, y) => gradePower(y.grade) - gradePower(x.grade) || x.id.localeCompare(y.id))[0];
    if (pick && f.cash - pick.salary >= reserve()) hire(f, pick.id);
  }

  // Facilities: the arena first (it earns money), then whichever is lowest.
  for (let guard = 0; guard < 40; guard++) {
    const next = FACILITIES.map((facility) => ({ id: facility.id, level: facilityLevel(f, facility.id) }))
      .filter((x) => buildCost(x.level) !== null)
      .sort((x, y) => x.level - (x.id === 'arena' ? 1 : 0) - (y.level - (y.id === 'arena' ? 1 : 0)) || x.id.localeCompare(y.id))[0];
    if (!next) break;
    const cost = buildCost(next.level) as number;
    if (f.cash - cost < reserve()) break;
    if (!build(f, next.id).ok) break;
  }

  // The costume, with whatever is left.
  for (let guard = 0; guard < 6; guard++) {
    const cost = costumeCost(f);
    if (cost === null || f.cash - cost < reserve() || !upgradeCostume(f).ok) break;
  }
}

/**
 * An automatic manager's off-season: decide expiring contracts (keep anyone it can afford who is still
 * useful), deal with a cash crisis, spend spare cash by its style, then fill the roster with the best
 * affordable free agents its scouts can see and dress the best six.
 */
export function autoOffseason(f: Franchise, style: ManagerStyle = 'none'): OffseasonMoney {
  const { league } = f;
  const team = userTeam(league);
  const budget = payrollBudget(f, style);

  for (const id of [...f.offseason.pending]) {
    const player = playerOf(league, id);
    const after = payroll(league, team) - player.capHit + resignCapHit(player, f);
    const affordable = after <= leagueRules.cap && after <= budget;
    const useful = player.age <= q.autoKeepMaxAge || player.overall >= q.autoKeepOverall;
    if (!(affordable && useful && decideContract(f, id, player.age <= q.autoLongDealMaxAge ? q.autoLongDealYears : 1).ok)) decideContract(f, id, null);
  }

  const money = resolveFireSale(f);
  spend(f, style);

  for (let guard = 0; guard < 40; guard++) {
    const needSkater = skatersOn(league, team).length < leagueRules.rosterSkaters;
    const needGoalie = goaliesOn(league, team).length < leagueRules.rosterGoalies;
    if (!needSkater && !needGoalie) break;
    const emptyAfter =
      leagueRules.rosterSkaters - skatersOn(league, team).length + (leagueRules.rosterGoalies - goaliesOn(league, team).length) - 1;
    const capRoom = capSpace(league, team) - emptyAfter * capHitOf(0);
    // Money matters too, but a roster spot is never left empty for want of it: the cheapest players always fit.
    const moneyRoom = Math.max(rules.cheapCapHit, budget - payroll(league, team) - emptyAfter * capHitOf(0));
    const hidden = hiddenFreeAgents(f);
    const choice = league.freeAgents
      .filter((id) => !hidden.has(id))
      .map((id) => playerOf(league, id))
      .filter((p) => (p.position === 'G') === needGoalie && p.capHit <= Math.min(capRoom, moneyRoom) && canSign(league, team, p.id).ok)
      .sort((x, y) => y.overall - x.overall || x.id.localeCompare(y.id))[0];
    if (choice && signPlayer(f, choice.id).ok) continue;
    // Nobody affordable: let the most expensive contract go and try again.
    const costly = rosterOf(league, team).sort((x, y) => y.capHit - x.capHit || x.id.localeCompare(y.id))[0];
    if (!costly) break;
    releasePlayer(f, costly.id);
  }
  team.lineup = autoLineup(league, team);
  for (const pack of [...f.packs]) openPack(f, pack.id);
  return money;
}

/** Plays one whole season quickly: random legal choices on the map, games settled from strength. */
export function quickSeason(f: Franchise, rng: Rng): void {
  if (!startSeason(f).ok) return;
  for (let guard = 0; guard < 400 && f.season.phase !== 'ended'; guard++) {
    const game = matchup(f);
    if (f.season.stage === 'reward') {
      pickArtifact(f, rng.pick(f.season.offer));
    } else if (game) {
      recordGame(f, quickResult(rng, game.home, game.away, levelEdge(game.level)));
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
  /** Your money: operating cash, franchise value, payroll, and how much is built and hired. */
  cash: number;
  value: number;
  payroll: number;
  facilityLevels: number;
  staff: number;
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
    cash: f.cash,
    value: f.value,
    payroll: payroll(league, userTeam(league)),
    facilityLevels: totalFacilityLevels(f),
    staff: f.staff.length,
  };
}
