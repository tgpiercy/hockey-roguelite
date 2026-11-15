import { describe, expect, it } from 'vitest';
import { ageOneYear } from '../src/core/aging';
import { clubStat } from '../src/core/club';
import {
  bailOut,
  bookSeasonEnd,
  canBailOut,
  inFireSale,
  isHomeGame,
  merchMoney,
  playerSalePrice,
  seasonEndBills,
  sponsorshipMoney,
  STARTING_CASH,
  STARTING_VALUE,
  ticketMoney,
} from '../src/core/economy';
import { build, buildCost, FACILITIES, facilityUpkeep, MAX_FACILITY_LEVEL } from '../src/core/facilities';
import { releasePlayer } from '../src/core/gear';
import { generateLeague } from '../src/core/generate';
import { EXPENSE_LINES, INCOME_LINES, totals } from '../src/core/ledger';
import { playerOf, rosterOf, userTeam } from '../src/core/league';
import {
  aiMascot,
  bossMascot,
  costumeCost,
  dropInChance,
  MASCOT_ID,
  mascotPower,
  mascotRating,
  rollDropIn,
  talentCount,
  TALENTS,
  upgradeCostume,
  userMascot,
  withMascot,
} from '../src/core/mascot';
import { decideContract, finishSeason, resignCapHit } from '../src/core/offseason';
import { capHitOf, type PlayerRecord } from '../src/core/player';
import { autoOffseason } from '../src/core/quickSeason';
import { createRng } from '../src/core/rng';
import { payroll } from '../src/core/roster';
import { franchiseOf, fromSave, parseSave, SAVE_VERSION, toSave } from '../src/core/save';
import { hiddenFreeAgents, potentialRange, potentialText, scoutingPoints, signPlayer, visibleFreeAgents, visibleShare } from '../src/core/scouting';
import { availableStops, dressUser, matchup, newFranchise, recordGame, startSeason, travel, type Franchise } from '../src/core/season';
import { generateStaffPool, gradePower, hire, letGo, roleOf, slotsFor, STAFF_KINDS, staffSalePrice, tickStaff, type StaffMember } from '../src/core/staff';
import economy from '../src/data/economy.json';
import facilityRules from '../src/data/facilities.json';
import mascotRules from '../src/data/mascot.json';
import offseasonRules from '../src/data/offseason.json';
import scoutingRules from '../src/data/scouting.json';
import staffRules from '../src/data/staff.json';
import talentRules from '../src/data/talents.json';
import { resolveCheck } from '../src/sim/check';
import type { GameResult, PlayerLine } from '../src/sim/match';
import { defaultGoalieRatings, defaultSkaterRatings } from '../src/sim/ratings';
import { goalLineX } from '../src/sim/rink';
import { spinEscape, stepTalents } from '../src/sim/talents';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent } from '../src/sim/types';
import { createWorld, STEP_SECONDS, type TeamSetup } from '../src/sim/world';
import { runFranchise, summarise } from './harness/seasons';
import { clearIce, giveTo, ID, place, player } from './helpers';

const fresh = (seed = 'club-test'): Franchise => newFranchise(generateLeague(seed));

const line = (index: number, over: Partial<PlayerLine> = {}): PlayerLine => ({
  id: index,
  team: 0,
  role: index === 6 ? 'goalie' : 'skater',
  line: index >= 3 && index < 6 ? 1 : 0,
  slot: index === 6 ? 0 : index % 3,
  goals: 0,
  assists: 0,
  shots: 0,
  hits: 0,
  blocks: 0,
  timeOnIce: 100,
  saves: 0,
  goalsAgainst: 0,
  ...over,
});
const game = (won: boolean, players: PlayerLine[] = [0, 1, 2, 3, 4, 5, 6].map((i) => line(i))): GameResult => ({
  score: won ? [3, 1] : [1, 3],
  winner: won ? 0 : 1,
  finished: true,
  overtime: false,
  periods: 3,
  players,
  powerupsUsed: [],
});

/** A franchise standing at its first game of the season. */
const atFirstGame = (seed = 'club-game'): Franchise => {
  const f = fresh(seed);
  startSeason(f);
  travel(f, availableStops(f).find((s) => s.kind === 'game')!.id);
  return f;
};
/** A franchise whose season has just ended. */
const seasonOver = (seed = 'club-over'): Franchise => {
  const f = fresh(seed);
  startSeason(f);
  f.season.phase = 'ended';
  f.season.outcome = 'eliminated';
  for (const p of rosterOf(f.league, userTeam(f.league))) {
    p.age = 25;
    p.contractYears = 3;
  }
  return f;
};
const staffer = (role: string, grade: string, over: Partial<StaffMember> = {}): StaffMember => ({
  id: `s-test-${role}-${grade}`,
  name: 'Test Staffer',
  role,
  grade,
  salary: staffRules.grades.find((g) => g.grade === grade)!.salary,
  contractYears: 2,
  ...over,
});

describe('operating cash', () => {
  it('a new franchise starts with the cash and value in the table, nothing built and nobody hired', () => {
    const f = fresh();
    expect(f.cash).toBe(economy.startingCash);
    expect(f.value).toBe(economy.startingValue);
    expect(STARTING_CASH).toBe(economy.startingCash);
    expect(STARTING_VALUE).toBe(economy.startingValue);
    expect(f.staff).toEqual([]);
    expect(Object.values(f.facilities).every((level) => level === 0)).toBe(true);
    expect(totals(f.ledger)).toEqual({ income: 0, expenses: 0, profit: 0 });
  });

  it('games alternate home and road, starting at home', () => {
    expect([1, 2, 3, 4, 5].map(isHomeGame)).toEqual([true, false, true, false, true]);
  });

  it('a home game pays tickets and merchandise; the money is in the message', () => {
    const f = atFirstGame();
    const result = recordGame(f, game(true));
    expect(result.ok && result.message).toMatch(/Cash \+\$/);
    // One game played and won: the win rate is 1.
    expect(f.ledger.tickets).toBe(Math.round(economy.ticketsPerHomeGame * (economy.ticketFormBase + economy.ticketFormPerWinRate)));
    expect(f.ledger.merchandise).toBe(economy.merchPerGame);
    expect(f.ledger.travel).toBe(0);
    expect(f.cash).toBe(economy.startingCash + f.ledger.tickets + f.ledger.merchandise);
  });

  it('the second game is on the road: travel is paid and there are no tickets', () => {
    const f = atFirstGame();
    recordGame(f, game(true));
    const tickets = f.ledger.tickets;
    // Whatever the next stop is, move the season to a game and record it.
    f.season.current = Object.values(f.season.map!.stops).find((s) => s.kind === 'game' && s.id !== f.season.last)!.id;
    f.season.stage = 'arrived';
    recordGame(f, game(false));
    expect(f.ledger.tickets).toBe(tickets);
    expect(f.ledger.travel).toBe(economy.travelPerRoadGame);
    expect(f.ledger.merchandise).toBe(economy.merchPerGame * 2);
  });

  it('tickets pay more when you are winning, and merchandise more with star players', () => {
    const f = fresh();
    f.season.gamesPlayed = 10;
    f.season.gamesWon = 2;
    const losing = ticketMoney(f);
    f.season.gamesWon = 9;
    expect(ticketMoney(f)).toBeGreaterThan(losing);
    const plain = merchMoney(f);
    const star = rosterOf(f.league, userTeam(f.league))[0]!;
    star.overall = economy.starMinOverall;
    expect(merchMoney(f)).toBe(plain + economy.merchPerStar);
  });

  it('a home playoff game pays a gate', () => {
    const f = fresh('gate');
    startSeason(f);
    f.season.phase = 'playoffs';
    f.season.playoffs = { round: 0, wins: 0, losses: 0, opponentId: f.league.teams[3]!.id };
    recordGame(f, game(true));
    expect(f.ledger.playoffGate).toBe(economy.playoffGate);
    recordGame(f, game(false));
    expect(f.ledger.playoffGate).toBe(economy.playoffGate);
  });

  it('each milestone reached pays a bonus', () => {
    const f = atFirstGame('bonus');
    f.season.gamesWon = 3;
    f.season.gamesPlayed = 4;
    const result = recordGame(f, game(true));
    expect(f.season.milestones.length).toBeGreaterThanOrEqual(1);
    expect(f.ledger.milestones).toBe(f.season.milestones.length * economy.milestoneBonus);
    expect(result.ok && result.message).toMatch(/cash bonus/);
  });

  it('the end of the season brings sponsorship in and pays players, staff, upkeep and the mascot', () => {
    const f = seasonOver();
    f.staff.push(staffer('promoter', 'C'));
    f.facilities.arena = 2;
    const bills = seasonEndBills(f);
    expect(bills.salaries).toBe(payroll(f.league, userTeam(f.league)));
    expect(bills.staff).toBe(600000);
    expect(bills.upkeep).toBe(2 * facilityRules.upkeepPerLevel);
    expect(bills.mascot).toBe(mascotRules.salary);
    expect(bills.sponsorship).toBe(sponsorshipMoney(f));
    const before = f.cash;
    finishSeason(f);
    const books = f.books[0]!;
    expect(books.season).toBe(1);
    expect(books.ledger.salaries).toBe(bills.salaries);
    expect(books.ledger.sponsorship).toBe(bills.sponsorship);
    expect(f.cash).toBe(before + bills.sponsorship - bills.salaries - bills.staff - bills.upkeep - bills.mascot);
    // The new season starts with clean books.
    expect(totals(f.ledger).income).toBe(0);
  });

  it('the income statement always adds up to the change in cash', () => {
    const f = atFirstGame('adds-up');
    recordGame(f, game(true));
    build(f, 'arena');
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    finishSeason(f);
    const profit = f.books.reduce((sum, b) => sum + totals(b.ledger).profit, 0) + totals(f.ledger).profit;
    expect(f.cash).toBe(economy.startingCash + profit);
    for (const b of f.books) for (const key of [...INCOME_LINES, ...EXPENSE_LINES]) expect(b.ledger[key]).toBeGreaterThanOrEqual(0);
  });
});

describe('franchise value', () => {
  it('moves with profit, wins and a title when the books are closed', () => {
    const f = seasonOver('value');
    f.season.gamesWon = 9;
    const v = economy.value;
    const start = f.value;
    const closed = bookSeasonEnd(f);
    expect(f.value).toBe(Math.round(start + v.profitShare * totals(closed.ledger).profit + v.perWin * 9));
    const champion = seasonOver('value');
    champion.season.gamesWon = 9;
    champion.season.outcome = 'champion';
    bookSeasonEnd(champion);
    expect(champion.value).toBe(f.value + v.title);
  });

  it('rises with every facility level built, and never falls below its floor', () => {
    const f = fresh();
    build(f, 'arena');
    expect(f.value).toBe(economy.startingValue + economy.value.perFacilityLevel);
    const poor = seasonOver('floor');
    poor.value = economy.value.floor;
    poor.cash = 0;
    bookSeasonEnd(poor);
    expect(poor.value).toBeGreaterThanOrEqual(economy.value.floor);
  });
});

describe('the fire sale', () => {
  const broke = (): Franchise => {
    const f = fresh('fire');
    for (const p of rosterOf(f.league, userTeam(f.league))) p.contractYears = 2;
    f.cash = -3_000_000;
    return f;
  };

  it('with cash below zero the season cannot start', () => {
    const f = broke();
    expect(inFireSale(f)).toBe(true);
    const refused = startSeason(f);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/cash/i);
  });

  it('releasing a player under contract pays half a season of his cap hit', () => {
    const f = broke();
    const p = rosterOf(f.league, userTeam(f.league))[0]!;
    expect(playerSalePrice(f, p)).toBe(Math.round(p.capHit * economy.fireSale.playerShare));
    releasePlayer(f, p.id);
    expect(f.cash).toBe(-3_000_000 + Math.round(p.capHit * economy.fireSale.playerShare));
    expect(f.ledger.sales).toBe(Math.round(p.capHit * economy.fireSale.playerShare));
  });

  it('pays nothing with cash in hand, for an expired contract, or for someone who joined this off-season', () => {
    const rich = fresh('fire');
    const p = rosterOf(rich.league, userTeam(rich.league))[0]!;
    p.contractYears = 2;
    expect(playerSalePrice(rich, p)).toBe(0);

    const f = broke();
    const mine = rosterOf(f.league, userTeam(f.league));
    mine[0]!.contractYears = 0;
    expect(playerSalePrice(f, mine[0]!)).toBe(0);
    // Sign a free agent and try to flip him for cash: nothing.
    releasePlayer(f, mine[1]!.id);
    const cheap = visibleFreeAgents(f)
      .map((id) => playerOf(f.league, id))
      .filter((x) => x.position !== 'G')
      .sort((a, b) => a.capHit - b.capHit)[0]!;
    expect(signPlayer(f, cheap.id).ok).toBe(true);
    expect(playerSalePrice(f, cheap)).toBe(0);
    const cash = f.cash;
    releasePlayer(f, cheap.id);
    expect(f.cash).toBe(cash);
  });

  it('a staff contract can be sold for half a season of his salary, but not one hired this off-season', () => {
    const f = broke();
    const old = staffer('scout', 'A');
    f.staff.push(old);
    expect(staffSalePrice(f, old)).toBe(Math.round(old.salary * economy.fireSale.staffShare));
    const result = letGo(f, old.id);
    expect(result.ok && result.paid).toBe(900000);
    expect(f.cash).toBe(-3_000_000 + 900000);
    const hired = f.staffPool[0]!;
    hire(f, hired.id);
    expect(staffSalePrice(f, hired)).toBe(0);
  });

  it('the league steps in only when nothing is left to sell, and it costs a tenth of the franchise value', () => {
    const f = broke();
    expect(canBailOut(f)).toBe(false);
    expect(bailOut(f).ok).toBe(false);
    for (const p of rosterOf(f.league, userTeam(f.league))) p.contractYears = 0;
    expect(canBailOut(f)).toBe(true);
    expect(bailOut(f)).toEqual({ ok: true });
    expect(f.cash).toBe(0);
    expect(f.value).toBe(Math.round(economy.startingValue * (1 - economy.value.bailoutLoss)));
    expect(canBailOut(f)).toBe(false);
  });

  it('is never a dead end: the automatic manager always gets back to a season it can start', () => {
    for (const debt of [-1_000_000, -8_000_000, -40_000_000]) {
      const f = broke();
      f.cash = debt;
      const money = autoOffseason(f, 'balanced');
      expect(money.fireSale).toBe(true);
      expect(f.cash).toBeGreaterThanOrEqual(0);
      expect(startSeason(f).ok).toBe(true);
    }
  });
});

describe('staff', () => {
  it('the pool is valid, the same every time, and always has someone for every kind of job', () => {
    const pool = generateStaffPool('staff-seed', 3);
    expect(pool).toEqual(generateStaffPool('staff-seed', 3));
    expect(pool).not.toEqual(generateStaffPool('staff-seed', 4));
    expect(pool).toHaveLength(staffRules.poolSize);
    expect(new Set(pool.map((s) => s.id)).size).toBe(pool.length);
    for (const s of pool) {
      const grade = staffRules.grades.find((g) => g.grade === s.grade)!;
      expect(s.salary).toBe(grade.salary);
      expect(staffRules.roles.some((r) => r.id === s.role)).toBe(true);
      expect(s.contractYears).toBeGreaterThanOrEqual(staffRules.minContractYears);
      expect(s.contractYears).toBeLessThanOrEqual(staffRules.maxContractYears);
    }
    for (const kind of STAFF_KINDS) expect(pool.some((s) => roleOf(s).kind === kind)).toBe(true);
  });

  it('salary rises with grade: D is one step and S is five', () => {
    const salaries = staffRules.grades.map((g) => g.salary);
    expect([...salaries].sort((a, b) => a - b)).toEqual(salaries);
    expect(['D', 'C', 'B', 'A', 'S'].map(gradePower)).toEqual([1, 2, 3, 4, 5]);
  });

  it('each kind of job has a set number of slots', () => {
    const f = fresh();
    f.staffPool = [staffer('shooting', 'C', { id: 'a' }), staffer('defence', 'C', { id: 'b' }), staffer('skating', 'C', { id: 'c' }), staffer('scout', 'D', { id: 'd' })];
    expect(hire(f, 'a')).toEqual({ ok: true });
    expect(hire(f, 'b')).toEqual({ ok: true });
    const third = hire(f, 'c');
    expect(third.ok).toBe(false);
    expect(!third.ok && third.reason).toMatch(/2 trainers/);
    expect(hire(f, 'd')).toEqual({ ok: true });
    expect(f.staff).toHaveLength(slotsFor('trainer') + 1);
    expect(f.staffPool.map((s) => s.id)).toEqual(['c']);
    expect(hire(f, 'nobody').ok).toBe(false);
  });

  it('contracts tick down at the end of a season, the expired leave with a line of news, and a new pool arrives', () => {
    const f = seasonOver('staff-tick');
    f.staff.push(staffer('scout', 'B', { id: 'stay', contractYears: 2 }), staffer('promoter', 'D', { id: 'leave', contractYears: 1, name: 'Going Soon' }));
    const pool = f.staffPool;
    finishSeason(f);
    expect(f.staff.map((s) => s.id)).toEqual(['stay']);
    expect(f.staff[0]!.contractYears).toBe(1);
    expect(f.offseason.report?.news.join(' ')).toContain('Going Soon');
    expect(f.staffPool).not.toEqual(pool);
    expect(tickStaff(fresh())).toEqual([]);
  });

  it('a promoter raises ticket, merchandise and sponsorship money, and a better one raises them more', () => {
    const f = fresh();
    const base = [ticketMoney(f), merchMoney(f), sponsorshipMoney(f)];
    f.staff = [staffer('promoter', 'D')];
    const weak = [ticketMoney(f), merchMoney(f), sponsorshipMoney(f)];
    f.staff = [staffer('promoter', 'S')];
    const strong = [ticketMoney(f), merchMoney(f), sponsorshipMoney(f)];
    for (let i = 0; i < 3; i++) {
      expect(weak[i]).toBeGreaterThan(base[i]!);
      expect(strong[i]).toBeGreaterThan(weak[i]!);
    }
    expect(mascotPower(f)).toBeGreaterThan(0);
  });

  it('a scout gives scouting points', () => {
    const f = fresh();
    expect(scoutingPoints(f)).toBe(0);
    f.staff = [staffer('scout', 'B')];
    expect(scoutingPoints(f)).toBe(3);
  });

  it('a trainer raises the XP of the players he works with, and only theirs', () => {
    const xpOf = (staff: StaffMember[]): { forward: PlayerRecord; goalie: PlayerRecord } => {
      const f = seasonOver('trainer');
      f.staff = staff;
      const roster = rosterOf(f.league, userTeam(f.league));
      const forward = roster.find((p) => p.position === 'F')!;
      const goalie = roster.find((p) => p.position === 'G')!;
      for (const p of [forward, goalie]) {
        p.age = 27;
        p.potential = 99;
        f.season.xp[p.id] = 90;
      }
      finishSeason(f);
      return { forward, goalie };
    };
    const plain = xpOf([]);
    const coached = xpOf([staffer('shooting', 'S')]);
    // 90 XP is under a level without help; a grade S shooting coach makes it 112, which is a level for the forward.
    expect(plain.forward.level).toBe(1);
    expect(coached.forward.level).toBe(2);
    expect(coached.goalie.level).toBe(1);
    expect(xpOf([staffer('goaltending', 'S')]).goalie.level).toBe(2);
    expect(xpOf([staffer('skating', 'S'), staffer('skating', 'S', { id: 'two' })]).goalie.level).toBe(2);
  });
});

describe('facilities', () => {
  it('there are six, each level costs more than the last, and each adds upkeep', () => {
    expect(FACILITIES.map((x) => x.id)).toEqual(['training', 'medical', 'office', 'scouting', 'arena', 'den']);
    expect([0, 1, 4].map(buildCost)).toEqual([1, 2, 5].map((n) => n * facilityRules.buildCostPerLevel));
    expect(buildCost(MAX_FACILITY_LEVEL)).toBe(null);
    const f = fresh();
    f.cash = 100_000_000;
    build(f, 'arena');
    build(f, 'arena');
    build(f, 'den');
    expect(f.cash).toBe(100_000_000 - 4 * facilityRules.buildCostPerLevel);
    expect(f.ledger.construction).toBe(4 * facilityRules.buildCostPerLevel);
    expect(facilityUpkeep(f)).toBe(3 * facilityRules.upkeepPerLevel);
  });

  it('cannot be built without the cash, or past the top level', () => {
    const f = fresh();
    f.cash = 1_000_000;
    const poor = build(f, 'arena');
    expect(poor.ok).toBe(false);
    expect(!poor.ok && poor.reason).toMatch(/costs/);
    expect(f.facilities.arena).toBe(0);
    f.cash = 1_000_000_000;
    for (let i = 0; i < MAX_FACILITY_LEVEL; i++) expect(build(f, 'arena')).toEqual({ ok: true });
    expect(build(f, 'arena').ok).toBe(false);
    expect(build(f, 'swimming-pool').ok).toBe(false);
  });

  it('training centre: more XP, and aging takes less', () => {
    const f = seasonOver('training');
    f.facilities.training = 5;
    expect(clubStat(f, 'xpGain', 1)).toBeCloseTo(1.3);
    expect(clubStat(f, 'agingDecline', 1)).toBeCloseTo(0.6);
    const young = rosterOf(f.league, userTeam(f.league))[0]!;
    young.age = 27;
    young.potential = 99;
    f.season.xp[young.id] = 80;
    finishSeason(f);
    expect(young.level).toBe(2);

    // Aging: with the scale at 0 nothing is lost; at 0.5 about half as much as normal.
    const lost = (scale: number): number => {
      const rng = createRng('decline');
      let total = 0;
      for (let i = 0; i < 300; i++) {
        const p: PlayerRecord = { ...young, age: 36, ratings: { shooting: 70, passing: 70, speed: 70, checking: 70, puckControl: 70, stamina: 70 } };
        ageOneYear(p, rng, scale);
        total += 420 - Object.values(p.ratings).reduce((s, v) => s + v, 0);
      }
      return total;
    };
    expect(lost(0)).toBe(0);
    expect(lost(0.5) / lost(1)).toBeGreaterThan(0.4);
    expect(lost(0.5) / lost(1)).toBeLessThan(0.6);
  });

  it('medical wing: your players tire slower and recover faster on the ice', () => {
    const f = fresh();
    const plain = dressUser(f)!;
    f.facilities.medical = 5;
    const fit = dressUser(f)!;
    const t = cloneTuning();
    const skaterOf = (setup: TeamSetup) => createWorld(t, 'medical', { human: false, teams: [setup, setup] }).players[0]!;
    expect(skaterOf(fit.setup).fx.drainScale).toBeCloseTo(skaterOf(plain.setup).fx.drainScale * 0.8);
    expect(skaterOf(fit.setup).fx.recoverScale).toBeCloseTo(skaterOf(plain.setup).fx.recoverScale * 1.2);
  });

  it('front office: re-signing costs less', () => {
    const f = fresh();
    const p = rosterOf(f.league, userTeam(f.league))[0]!;
    expect(resignCapHit(p, f)).toBe(capHitOf(p.overall));
    f.facilities.office = 5;
    expect(resignCapHit(p, f)).toBeLessThan(capHitOf(p.overall));
    expect(resignCapHit(p, f)).toBeCloseTo(capHitOf(p.overall) * 0.85, -5);
    expect(resignCapHit(p)).toBe(capHitOf(p.overall));
    // And that is what he is actually signed for.
    const g = seasonOver('office');
    g.facilities.office = 5;
    const mine = rosterOf(g.league, userTeam(g.league))[0]!;
    mine.contractYears = 1;
    finishSeason(g);
    const price = resignCapHit(mine, g);
    decideContract(g, mine.id, 2);
    expect(mine.capHit).toBe(price);
  });

  it('scouting office, arena and mascot den each do what they say', () => {
    const f = fresh();
    const tickets = ticketMoney(f);
    f.facilities.scouting = 3;
    f.facilities.arena = 5;
    f.facilities.den = 4;
    expect(scoutingPoints(f)).toBe(3);
    expect(ticketMoney(f)).toBe(Math.round(tickets * 1.4));
    expect(mascotPower(f)).toBe(4);
  });
});

describe('scouting', () => {
  it('the range always contains the true potential, at any amount of scouting', () => {
    const f = fresh('range');
    for (const level of [0, 2, 5]) {
      f.facilities.scouting = level;
      for (const p of Object.values(f.league.players)) {
        const { low, high } = potentialRange(f, p);
        expect(low).toBeLessThanOrEqual(p.potential);
        expect(high).toBeGreaterThanOrEqual(p.potential);
        expect(low).toBeGreaterThanOrEqual(p.overall);
      }
    }
  });

  it('narrows with scouting points, and with each season a player has been with you', () => {
    const f = fresh('narrow');
    const p = Object.values(f.league.players).find((x) => x.potential - x.overall >= 8 && x.potential < 90)!;
    const width = (): number => potentialRange(f, p).high - potentialRange(f, p).low;
    const none = width();
    f.facilities.scouting = 4;
    const some = width();
    expect(some).toBeLessThan(none);
    f.tenure[p.id] = 3;
    expect(width()).toBeLessThan(some);
    f.staff = [staffer('scout', 'S')];
    f.tenure[p.id] = 6;
    expect(potentialRange(f, p)).toEqual({ low: p.potential, high: p.potential });
  });

  it('says so in words, and has nothing to say about a player past his peak', () => {
    const f = fresh('words');
    const young = Object.values(f.league.players).find((x) => x.age < 25 && x.potential - x.overall >= 8)!;
    expect(potentialText(f, young)).toMatch(/^\d+ to \d+ overall$/);
    const old = Object.values(f.league.players).find((x) => x.age >= 33)!;
    expect(potentialText(f, old)).toMatch(/past his peak/);
    expect(potentialRange(f, old)).toEqual({ low: old.potential, high: old.potential });
  });

  it('time with you is counted at the end of each season, for the players still on your team', () => {
    const f = seasonOver('tenure');
    const roster = userTeam(f.league).roster;
    finishSeason(f);
    for (const id of userTeam(f.league).roster) expect(f.tenure[id]).toBe(1);
    expect(Object.keys(f.tenure).every((id) => roster.includes(id))).toBe(true);
  });

  it('part of the free-agent pool is out of sight, and more comes into view with scouting', () => {
    const f = fresh('hidden');
    expect(visibleShare(f)).toBe(scoutingRules.baseVisibleShare);
    const pool = f.league.freeAgents.length;
    const before = hiddenFreeAgents(f);
    expect(before.size).toBeGreaterThan(0);
    expect(before.size).toBeLessThanOrEqual(Math.floor(pool * (1 - scoutingRules.baseVisibleShare)));
    expect(visibleFreeAgents(f).length).toBe(pool - before.size);
    f.facilities.scouting = 4;
    expect(hiddenFreeAgents(f).size).toBeLessThan(before.size);
    f.staff = [staffer('scout', 'S')];
    expect(hiddenFreeAgents(f).size).toBe(0);
  });

  it('a hidden player cannot be signed, and cheap players are never hidden', () => {
    const f = fresh('hidden');
    const hidden = [...hiddenFreeAgents(f)][0]!;
    const refused = signPlayer(f, hidden);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/scouts/);
    for (const id of hiddenFreeAgents(f)) expect(playerOf(f.league, id).capHit).toBeGreaterThan(offseasonRules.cheapCapHit);
  });
});

describe('the mascot', () => {
  it('every franchise has one, with a name and an order in which he learns the five talents', () => {
    const f = fresh('mascot');
    expect(mascotRules.names).toContain(f.mascot.name);
    expect([...f.mascot.talents].sort()).toEqual(TALENTS.map((t) => t.id).sort());
    expect(newFranchise(generateLeague('mascot')).mascot).toEqual(f.mascot);
    expect(userMascot(f).talents).toEqual(f.mascot.talents.slice(0, 1));
  });

  it('drops in 5% of the time with no power, more with power, and never more than 35%', () => {
    expect(dropInChance(0)).toBeCloseTo(0.05);
    expect(dropInChance(5)).toBeCloseTo(0.2);
    expect(dropInChance(10)).toBeCloseTo(0.35);
    expect(dropInChance(50)).toBeCloseTo(0.35);
    const rate = (power: number): number => {
      let hits = 0;
      for (let i = 0; i < 20000; i++) if (rollDropIn(`rate/${power}/${i}`, power) !== null) hits++;
      return hits / 20000;
    };
    expect(rate(0)).toBeGreaterThan(0.04);
    expect(rate(0)).toBeLessThan(0.06);
    expect(rate(30)).toBeGreaterThan(0.33);
    expect(rate(30)).toBeLessThan(0.37);
  });

  it('the roll is fixed by its label, and always names one of the six skaters', () => {
    for (let i = 0; i < 500; i++) {
      const slot = rollDropIn(`slot/${i}`, 30);
      expect(rollDropIn(`slot/${i}`, 30)).toBe(slot);
      if (slot !== null) {
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThanOrEqual(5);
      }
    }
  });

  it('power comes from the costume, the den and the promoter; talents unlock as it grows', () => {
    const f = fresh();
    f.cash = 100_000_000;
    expect(costumeCost(f)).toBe(mascotRules.costume.costPerLevel);
    expect(upgradeCostume(f)).toEqual({ ok: true });
    expect(mascotPower(f)).toBe(1);
    expect(f.ledger.construction).toBe(mascotRules.costume.costPerLevel);
    f.facilities.den = 2;
    expect(mascotPower(f)).toBe(3);
    expect(userMascot(f).talents).toHaveLength(2);
    expect([0, 2.9, 3, 6, 9, 12, 40].map(talentCount)).toEqual([1, 1, 2, 3, 4, 5, 5]);
    for (let i = 0; i < 4; i++) upgradeCostume(f);
    expect(costumeCost(f)).toBe(null);
    expect(upgradeCostume(f).ok).toBe(false);
    f.cash = 0;
    f.mascot.costume = 0;
    expect(upgradeCostume(f).ok).toBe(false);
  });

  it('he plays better with more power, up to the top of the scale', () => {
    expect(mascotRating(0)).toBe(mascotRules.baseRating);
    expect(mascotRating(8)).toBeGreaterThan(mascotRating(0));
    expect(mascotRating(1000)).toBe(mascotRules.maxRating);
  });

  it('takes a skater\'s place in the dressed team, never the goalie\'s, and leaves the real team alone', () => {
    const f = fresh();
    const team = dressUser(f)!;
    const spec = { name: 'Testy', power: 12, talents: TALENTS.map((t) => t.id) };
    const swapped = withMascot(team, spec, 4);
    expect(swapped.players[4]!.id).toBe(MASCOT_ID);
    expect(swapped.players[6]).toBe(team.players[6]);
    expect(swapped.players.filter((p) => p.id === MASCOT_ID)).toHaveLength(1);
    expect(swapped.setup.skaters[4]!.shooting).toBe(mascotRating(12));
    expect(swapped.setup.skaterTalents?.[4]).toEqual(spec.talents);
    expect(swapped.setup.skaterTalents?.[0]).toEqual([]);
    // The cannon shot is simply always on, so it travels as one of his own modifiers.
    expect(swapped.setup.skaterModifiers?.[4]).toEqual(talentRules.talents.find((x) => x.id === 'cannonShot')!.modifiers);
    expect(team.players[4]!.id).not.toBe(MASCOT_ID);
    expect(team.setup.skaterTalents).toBeUndefined();
  });

  /** Moves the game counter on until your mascot drops in (or, with `want` false, stays away). */
  const untilDropIn = (f: Franchise, want: boolean): void => {
    for (let i = 0; i < 200; i++) {
      f.season.gamesPlayed = i;
      if ((matchup(f)!.mascots.home !== null) === want) return;
    }
    throw new Error('no such game found');
  };

  it('before a game he may replace one dressed skater, who is back for the next game', () => {
    const f = atFirstGame('drop');
    f.facilities.den = 5;
    f.mascot.costume = 5;
    const dressed = dressUser(f)!.players.map((p) => p.id);
    untilDropIn(f, true);
    const withHim = matchup(f)!;
    const slot = withHim.home.players.findIndex((p) => p.id === MASCOT_ID);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(6);
    expect(withHim.mascots.home!.sits).toBe(playerOf(f.league, dressed[slot]!).name);
    expect(withHim.mascots.home!.mascot.name).toBe(f.mascot.name);
    // Asking again gives the same answer.
    expect(matchup(f)!.home.players.map((p) => p.id)).toEqual(withHim.home.players.map((p) => p.id));
    untilDropIn(f, false);
    expect(matchup(f)!.home.players.map((p) => p.id)).toEqual(dressed);
  });

  it('he earns no XP and his goals count for no milestone; the skater who sat gets the stay-at-home share', () => {
    const f = atFirstGame('drop');
    f.facilities.den = 5;
    f.mascot.costume = 5;
    untilDropIn(f, true);
    const withHim = matchup(f)!;
    const slot = withHim.home.players.findIndex((p) => p.id === MASCOT_ID);
    const sat = dressUser(f)!.players[slot]!;
    recordGame(f, game(true, [0, 1, 2, 3, 4, 5, 6].map((i) => line(i, i === slot ? { goals: 3 } : {}))));
    expect(f.season.xp[MASCOT_ID]).toBeUndefined();
    expect(f.season.playerGoals[MASCOT_ID]).toBeUndefined();
    expect(f.season.hatTrick).toBe(false);
    expect(f.season.xp[sat.id]).toBeGreaterThan(0);
    const other = withHim.home.players.find((p) => p.id !== MASCOT_ID && p.position !== 'G')!;
    expect(f.season.xp[sat.id]).toBeLessThan(f.season.xp[other.id]!);
    expect(f.league.players[MASCOT_ID]).toBeUndefined();
  });

  it('AI teams have mascots too: stronger teams have stronger ones, and they can drop in against you', () => {
    const f = atFirstGame('rivals');
    const order = [...f.league.teams].filter((t) => t.id !== f.league.userTeamId);
    const powers = order.map((t) => aiMascot(f.league, t.id).power);
    expect(Math.max(...powers)).toBeGreaterThan(Math.min(...powers));
    expect(aiMascot(f.league, order[0]!.id)).toEqual(aiMascot(f.league, order[0]!.id));
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) {
      f.season.gamesPlayed = i;
      const m = matchup(f)!;
      if (!m.mascots.away) continue;
      seen = true;
      expect(m.away.players.filter((p) => p.id === MASCOT_ID)).toHaveLength(1);
      expect(m.away.players[6]!.id).not.toBe(MASCOT_ID);
    }
    expect(seen).toBe(true);
  });

  it('bosses have mascots, stronger in each region', () => {
    const powers = [0, 1, 2].map((region) => bossMascot('boss-seed', 'the-wall', region).power);
    expect(powers).toEqual(mascotRules.ai.bossPower);
    expect(bossMascot('boss-seed', 'the-wall', 2).talents.length).toBe(talentCount(powers[2]!));
  });
});

describe('talents on the ice', () => {
  const t = cloneTuning();
  const setup = (talents: string[][] = []): TeamSetup => ({
    skaters: Array.from({ length: 6 }, () => ({ ...defaultSkaterRatings })),
    goalie: { ...defaultGoalieRatings },
    skaterTalents: talents,
  });
  const worldWith = (ids: string[]) => createWorld(t, 'talents', { human: false, teams: [setup([ids]), setup()] });
  const info = (id: string) => talentRules.talents.find((x) => x.id === id)!;

  it('an ordinary player has none', () => {
    const world = createWorld(t, 'plain', { human: false });
    expect(world.players.every((p) => p.talents.length === 0)).toBe(true);
    const events: SimEvent[] = [];
    expect(spinEscape(world.players[0]!, events)).toBe(false);
  });

  it('crowd surge: after his team scores, the whole team skates faster for a while', () => {
    const world = worldWith(['crowdSurge']);
    const before = player(world, ID.home2).fx.topSpeedScale;
    stepTalents(world, t, [{ type: 'goal', side: 1, team: 1, scorer: null, assists: [] }], STEP_SECONDS);
    expect(world.teams[0].boosts).toHaveLength(0);
    const events: SimEvent[] = [{ type: 'goal', side: 1, team: 0, scorer: null, assists: [] }];
    stepTalents(world, t, events, STEP_SECONDS);
    expect(world.teams[0].boosts[0]).toMatchObject({ id: 'crowdSurge', secondsLeft: info('crowdSurge').seconds });
    expect(player(world, ID.home2).fx.topSpeedScale).toBeCloseTo(before * 1.1);
    expect(player(world, ID.away1).fx.topSpeedScale).toBeCloseTo(before);
    expect(events.some((e) => e.type === 'talent' && e.id === 'crowdSurge')).toBe(true);
  });

  it('crowd surge does nothing while he sits on the bench', () => {
    const world = worldWith(['crowdSurge']);
    player(world, ID.home1).onIce = false;
    stepTalents(world, t, [{ type: 'goal', side: 1, team: 0, scorer: null, assists: [] }], STEP_SECONDS);
    expect(world.teams[0].boosts).toHaveLength(0);
  });

  it('spin move: a check that would have stripped him fails, then it has to recharge', () => {
    const world = worldWith(['spinMove']);
    const sure = cloneTuning();
    sure.check.pokeBaseChance = 1;
    sure.check.ratingSwing = 0;
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.home1, 0, 0);
    giveTo(world, ID.home1);
    const checker = place(world, ID.away1, world.puck.pos.x - sure.check.pokeRange / 2, world.puck.pos.y, 0);
    const poke = (): SimEvent[] => {
      const events: SimEvent[] = [];
      checker.checkHeld = false;
      checker.checkCooldown = 0;
      resolveCheck(world, checker, true, sure, events);
      return events;
    };
    const first = poke();
    expect(first.find((e) => e.type === 'check')).toMatchObject({ success: false });
    expect(first.some((e) => e.type === 'talent' && e.id === 'spinMove')).toBe(true);
    expect(world.puck.carrier).toBe(ID.home1);
    // Still recharging: the next check works.
    expect(poke().find((e) => e.type === 'check')).toMatchObject({ success: true });
    expect(world.puck.carrier).toBe(null);
    // After the recharge time it is ready again.
    stepTalents(world, t, [], info('spinMove').cooldown! + 0.1);
    expect(spinEscape(player(world, ID.home1), [])).toBe(true);
  });

  it('distraction: carrying the puck into the attacking zone slows the other goalie for a while', () => {
    const world = worldWith(['distraction']);
    const keeper = player(world, ID.awayGoalie);
    const normal = keeper.goalie!.fx.reactionSeconds;
    clearIce(world, [ID.home1]);
    place(world, ID.home1, 0, 0);
    giveTo(world, ID.home1);
    stepTalents(world, t, [], STEP_SECONDS);
    expect(keeper.goalie!.fx.reactionSeconds).toBeCloseTo(normal);
    place(world, ID.home1, goalLineX(t) * 0.6, 0);
    const events: SimEvent[] = [];
    stepTalents(world, t, events, STEP_SECONDS);
    expect(keeper.goalie!.fx.reactionSeconds).toBeCloseTo(normal * 1.5);
    expect(player(world, ID.homeGoalie).goalie!.fx.reactionSeconds).toBeCloseTo(normal);
    expect(world.teams[1].boosts[0]).toMatchObject({ id: 'distraction', secondsLeft: info('distraction').seconds });
    expect(events.some((e) => e.type === 'talent')).toBe(true);
    // It has to recharge before it can start again.
    world.teams[1].boosts = [];
    stepTalents(world, t, [], STEP_SECONDS);
    expect(world.teams[1].boosts).toHaveLength(0);
    stepTalents(world, t, [], info('distraction').cooldown!);
    stepTalents(world, t, [], STEP_SECONDS);
    expect(world.teams[1].boosts).toHaveLength(1);
  });

  it('cannon shot: his fully charged shot is harder, and nobody else\'s is', () => {
    const f = fresh();
    const spec = { name: 'Boomer', power: 12, talents: ['cannonShot'] };
    const team = withMascot(dressUser(f)!, spec, 0);
    const world = createWorld(t, 'cannon', { human: false, teams: [team.setup, setup()] });
    expect(player(world, ID.home1).fx.chargedShotScale).toBeCloseTo(1.3);
    expect(player(world, ID.home2).fx.chargedShotScale).toBeCloseTo(1);
    expect(player(world, ID.home1).talents).toEqual(['cannonShot']);
  });

  it('rally cry: once a period, tired linemates get their energy back', () => {
    const world = worldWith(['rallyCry']);
    world.period = 1;
    const mates = [player(world, ID.home2), player(world, ID.home3)];
    stepTalents(world, t, [], STEP_SECONDS);
    for (const m of mates) m.energy = 0.2;
    const events: SimEvent[] = [];
    stepTalents(world, t, events, STEP_SECONDS);
    expect(mates.every((m) => m.energy === 1)).toBe(true);
    expect(events.some((e) => e.type === 'talent' && e.id === 'rallyCry')).toBe(true);
    // Not twice in one period.
    for (const m of mates) m.energy = 0.2;
    stepTalents(world, t, [], STEP_SECONDS);
    expect(mates.every((m) => m.energy === 0.2)).toBe(true);
    // But again in the next.
    world.period = 2;
    stepTalents(world, t, [], STEP_SECONDS);
    expect(mates.every((m) => m.energy === 1)).toBe(true);
  });
});

describe('saving the club', () => {
  it('a Phase 7 save (version 4) gets the starting cash, nothing built, nobody hired, and a mascot', () => {
    const f = fresh('v4');
    const { cash: _c, value: _v, ledger: _l, books: _b, staff: _s, staffPool: _p, facilities: _f, mascot: _m, tenure: _t, ...older } = f;
    const { signed: _signed, ...oldOffseason } = older.offseason;
    const old = JSON.parse(JSON.stringify({ schemaVersion: 4, savedAt: 'then', ...older, offseason: oldOffseason }));
    const loaded = fromSave(old);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.schemaVersion).toBe(SAVE_VERSION);
    const back = franchiseOf(loaded.save);
    expect(back).toEqual(f);
    expect(back.cash).toBe(economy.startingCash);
    expect(back.offseason.signed).toEqual([]);
    expect(startSeason(back).ok).toBe(true);
  });

  it('a franchise with money spent, staff, buildings and a costume loads back the same', () => {
    const f = fresh('round');
    f.cash = 50_000_000;
    build(f, 'arena');
    hire(f, f.staffPool[0]!.id);
    upgradeCostume(f);
    const loaded = parseSave(JSON.stringify(toSave(f, 'now')));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(franchiseOf(loaded.save)).toEqual(f);
  });

  it('a save without its finances is refused', () => {
    const { cash: _cash, ...broken } = toSave(fresh(), 'now');
    const loaded = fromSave(JSON.parse(JSON.stringify(broken)));
    expect(loaded.ok).toBe(false);
  });
});

describe('20 seasons of money, three ways of managing', () => {
  const seeds = 20;
  const years = 20;
  const run = (style: 'cautious' | 'balanced' | 'spender') => {
    const runs = Array.from({ length: seeds }, (_, i) => runFranchise(`money-${i}`, years, style));
    return { runs, summary: summarise(runs) };
  };
  const cautious = run('cautious');
  const balanced = run('balanced');
  const spender = run('spender');

  it('every season is played, whatever the style', () => {
    for (const { runs } of [cautious, balanced, spender]) {
      for (const r of runs) expect(r.outcomes.every((o) => o !== 'not played')).toBe(true);
    }
  });

  it('sensible play never goes bankrupt: the league never has to step in for the cautious or balanced manager', () => {
    for (const { summary } of [cautious, balanced]) {
      expect(summary.reduce((sum, y) => sum + y.bailouts, 0)).toBe(0);
      for (const y of summary) expect(y.lowestCash).toBeGreaterThanOrEqual(0);
    }
  });

  it('the cautious manager is hardly ever forced to sell', () => {
    const forced = cautious.summary.reduce((sum, y) => sum + y.fireSales, 0);
    expect(forced).toBeLessThanOrEqual(seeds * years * 0.02);
  });

  it('nobody ends with a pile of cash and nothing to buy: there is always more to build', () => {
    const allLevels = FACILITIES.length * MAX_FACILITY_LEVEL;
    for (const { summary } of [cautious, balanced, spender]) {
      const last = summary[summary.length - 1]!;
      expect(last.facilityLevels).toBeLessThan(allLevels);
      expect(last.cash).toBeLessThan(40_000_000);
    }
  });

  it('franchise value grows over 20 seasons for sensible managers', () => {
    for (const { summary } of [cautious, balanced]) {
      expect(summary[summary.length - 1]!.value).toBeGreaterThan(summary[0]!.value);
    }
  });

  it('spending builds more: the spender has more facilities than the cautious manager early on', () => {
    expect(spender.summary[4]!.facilityLevels).toBeGreaterThan(cautious.summary[4]!.facilityLevels);
  });

  it('the league itself stays healthy with the economy running', () => {
    for (const { summary } of [cautious, balanced, spender]) {
      for (const y of summary) {
        expect(y.illegalRosters).toBe(0);
        expect(y.overCap).toBe(0);
      }
    }
  });
});
