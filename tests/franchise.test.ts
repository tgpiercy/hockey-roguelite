import { describe, expect, it } from 'vitest';
import { ageOneYear, agePhase, developOffIce, retireChance } from '../src/core/aging';
import { equip, rarityTable, RARITIES, wornBy, type GearItem } from '../src/core/gear';
import { generateLeague } from '../src/core/generate';
import { goaliesOn, playerOf, rosterOf, skatersOn, teamOf, userTeam } from '../src/core/league';
import type { DressedTeam } from '../src/core/matchup';
import { decideContract, finishSeason, leagueMoves, resignCapHit } from '../src/core/offseason';
import { capHitOf, gradeOf, overallOf, type PlayerRecord } from '../src/core/player';
import { canPrestige, jerseyColour, prestige, prestigeEffects, setJersey, unlockedJerseys } from '../src/core/prestige';
import { autoOffseason, dressedStrength, leagueSnapshot, quickResult, quickSeason, winChance } from '../src/core/quickSeason';
import { createRng } from '../src/core/rng';
import { canPlay, payroll } from '../src/core/roster';
import { franchiseOf, fromSave, parseSave, SAVE_VERSION, toSave } from '../src/core/save';
import { dressUser, matchup, newFranchise, startSeason, travel, availableStops, type Franchise } from '../src/core/season';
import { evaluateTrade, trade, tradeValue } from '../src/core/trades';
import { addXp, gameXp, homeShare, placePoints, withAgeBonus, xpForLevel } from '../src/core/xp';
import aging from '../src/data/aging.json';
import leagueRules from '../src/data/league.json';
import offseasonRules from '../src/data/offseason.json';
import prestigeRules from '../src/data/prestige.json';
import seasonRules from '../src/data/season.json';
import xpRules from '../src/data/xp.json';
import type { GameResult, PlayerLine } from '../src/sim/match';
import { resolveLoosePuck } from '../src/sim/contact';
import { cloneTuning } from '../src/sim/tuning';
import { createWorld } from '../src/sim/world';
import { clearIce, ID, place, player as simPlayer } from './helpers';
import { runFranchise, summarise } from './harness/seasons';

const fresh = (seed = 'franchise-test'): Franchise => newFranchise(generateLeague(seed));
const skater = (over: Partial<PlayerRecord> = {}): PlayerRecord => ({
  id: 'p-test',
  name: 'Test Player',
  position: 'F',
  age: 24,
  ratings: { shooting: 70, passing: 70, speed: 70, checking: 70, puckControl: 70, stamina: 70 },
  potential: 85,
  overall: 70,
  grade: 'C',
  capHit: capHitOf(70),
  contractYears: 2,
  xp: 0,
  level: 1,
  ...over,
});
const goalie = (over: Partial<PlayerRecord> = {}): PlayerRecord =>
  skater({ position: 'G', ratings: { reflexes: 70, positioning: 70, reboundControl: 70, stamina: 70 }, ...over });

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
  timeOnIce: 0,
  saves: 0,
  goalsAgainst: 0,
  ...over,
});
const game = (won: boolean, players: PlayerLine[]): GameResult => ({
  score: won ? [3, 1] : [1, 3],
  winner: won ? 0 : 1,
  finished: true,
  overtime: false,
  periods: 3,
  players,
  powerupsUsed: [],
});

describe('XP from a game', () => {
  const f = fresh();
  const home = dressUser(f) as DressedTeam;
  const id = (index: number): string => home.players[index]!.id;

  it('pays skaters for ice time, goals, assists, shots, hits and blocked shots', () => {
    const xp = gameXp(game(true, [line(0, { timeOnIce: 100, goals: 2, assists: 1, shots: 5, hits: 3, blocks: 2 })]), home);
    expect(xp[id(0)]).toBeCloseTo(100 * xpRules.perSecondOnIce + 2 * xpRules.goal + xpRules.assist + 5 * xpRules.shot + 3 * xpRules.hit + 2 * xpRules.block);
  });

  it('pays goalies for saves, and a bonus for a win', () => {
    const won = gameXp(game(true, [line(6, { saves: 20 })]), home);
    const lost = gameXp(game(false, [line(6, { saves: 20 })]), home);
    expect(won[id(6)]).toBeCloseTo(20 * xpRules.save + xpRules.goalieWin);
    expect(lost[id(6)]).toBeCloseTo(20 * xpRules.save);
  });

  it('ignores the other team, and an unfinished game', () => {
    expect(gameXp(game(true, [{ ...line(0, { goals: 3 }), team: 1 }]), home)).toEqual({});
    expect(gameXp({ ...game(true, [line(0, { goals: 3 })]), finished: false }, home)).toEqual({});
  });

  it('a player who did not dress gets a share of the average dressed skater', () => {
    const earned = gameXp(game(true, [0, 1, 2, 3, 4, 5].map((i) => line(i, { timeOnIce: 100 }))), home);
    expect(homeShare(earned, home)).toBeCloseTo(100 * xpRules.perSecondOnIce * xpRules.homeShare);
  });

  it('players in their growth years earn a bonus', () => {
    expect(withAgeBonus(skater({ age: 22 }), 100)).toBeCloseTo(100 * xpRules.youngBonus);
    expect(withAgeBonus(skater({ age: 25 }), 100)).toBeCloseTo(100 * xpRules.youngBonus);
    expect(withAgeBonus(skater({ age: 26 }), 100)).toBe(100);
  });
});

describe('levels and rating points', () => {
  it('each level costs a little more XP than the last', () => {
    expect(xpForLevel(1)).toBe(xpRules.levelBase);
    expect(xpForLevel(2)).toBe(xpRules.levelBase + xpRules.levelGrowth);
    expect(xpForLevel(5)).toBeGreaterThan(xpForLevel(4));
  });

  it('XP turns into the right number of levels, and the remainder is kept', () => {
    const p = skater();
    const gained = addXp(p, xpForLevel(1) + xpForLevel(2) + 30);
    expect(gained).toBe(2);
    expect(p.level).toBe(3);
    expect(p.xp).toBeCloseTo(30);
    expect(addXp(p, 10)).toBe(0);
  });

  it('each level gives rating points, and overall and grade are worked out again while the cap hit stays', () => {
    const p = skater();
    const cap = p.capHit;
    const before = Object.values(p.ratings).reduce((s, v) => s + v, 0);
    addXp(p, xpForLevel(1));
    expect(Object.values(p.ratings).reduce((s, v) => s + v, 0)).toBe(before + xpRules.pointsPerLevel);
    expect(p.overall).toBe(overallOf(p.position, p.ratings));
    expect(p.grade).toBe(gradeOf(p.overall));
    expect(p.capHit).toBe(cap);
  });

  it('points go where the position values them: shooting for a forward, checking for a defenceman, reflexes for a goalie', () => {
    const forward = skater();
    const defence = skater({ position: 'D' });
    const keeper = goalie();
    for (const p of [forward, defence, keeper]) placePoints(p, 12);
    const f = forward.ratings as { shooting: number; checking: number };
    const d = defence.ratings as { shooting: number; checking: number };
    const g = keeper.ratings as { reflexes: number; stamina: number };
    expect(f.shooting).toBeGreaterThan(f.checking);
    expect(d.checking).toBeGreaterThan(d.shooting);
    expect(g.reflexes).toBeGreaterThan(g.stamina);
  });

  it('overall never passes the hidden potential', () => {
    const p = skater({ potential: 72 });
    const spent = placePoints(p, 200);
    expect(p.overall).toBe(72);
    expect(spent).toBeLessThan(200);
    expect(placePoints(p, 10)).toBe(0);
    const maxed = skater({ potential: 70 });
    addXp(maxed, 5000);
    expect(maxed.overall).toBe(70);
    expect(maxed.level).toBeGreaterThan(1);
  });
});

describe('aging', () => {
  const rng = () => createRng('aging');
  const sum = (p: PlayerRecord): number => Object.values(p.ratings).reduce((s, v) => s + v, 0);

  it('names the four phases of the design doc', () => {
    expect([18, 25, 26, 30, 31, 34, 35, 40].map(agePhase)).toEqual(['growth', 'growth', 'peak', 'peak', 'decline', 'decline', 'steep', 'steep']);
  });

  it('nothing declines up to 30', () => {
    for (const age of [18, 24, 27, 29]) {
      const p = skater({ age });
      const before = sum(p);
      ageOneYear(p, rng());
      expect(p.age).toBe(age + 1);
      expect(sum(p)).toBe(before);
    }
  });

  it('from 31 to 34, speed and stamina drop and nothing else does', () => {
    const r = rng();
    for (let i = 0; i < 50; i++) {
      const p = skater({ age: 30 + (i % 4) });
      ageOneYear(p, r);
      const after = p.ratings as unknown as Record<string, number>;
      expect(after.speed).toBeLessThan(70);
      expect(after.stamina).toBeLessThan(70);
      expect(after.shooting).toBe(70);
      expect(after.passing).toBe(70);
      expect(after.checking).toBe(70);
      expect(after.puckControl).toBe(70);
    }
  });

  it('from 35, every rating drops: speed and stamina most, passing least', () => {
    const r = rng();
    const drop = { speed: 0, stamina: 0, shooting: 0, passing: 0 };
    for (let i = 0; i < 200; i++) {
      const p = skater({ age: 35 });
      ageOneYear(p, r);
      const after = p.ratings as unknown as Record<string, number>;
      for (const key of Object.keys(drop) as (keyof typeof drop)[]) drop[key] += 70 - (after[key] as number);
    }
    expect(drop.speed).toBeGreaterThan(drop.shooting);
    expect(drop.stamina).toBeGreaterThan(drop.shooting);
    expect(drop.shooting).toBeGreaterThan(drop.passing);
    expect(drop.shooting).toBeGreaterThan(0);
  });

  it('a goalie loses reflexes first and positioning last', () => {
    const r = rng();
    let reflexes = 0;
    let positioning = 0;
    for (let i = 0; i < 200; i++) {
      const p = goalie({ age: 36 });
      ageOneYear(p, r);
      const after = p.ratings as unknown as Record<string, number>;
      reflexes += 70 - (after.reflexes as number);
      positioning += 70 - (after.positioning as number);
    }
    expect(reflexes).toBeGreaterThan(positioning);
  });

  it('a declining player is graded again and has no more room to grow', () => {
    const p = skater({ age: 36, potential: 90 });
    ageOneYear(p, rng());
    expect(p.overall).toBe(overallOf(p.position, p.ratings));
    expect(p.overall).toBeLessThan(70);
    expect(p.potential).toBe(p.overall);
    expect(placePoints(p, 10)).toBe(0);
  });

  it('nobody retires before 35, and it gets likelier every year after', () => {
    expect(retireChance(34)).toBe(0);
    expect(retireChance(35)).toBeGreaterThan(0);
    for (let age = 36; age <= 40; age++) expect(retireChance(age)).toBeGreaterThan(retireChance(age - 1));
    expect(retireChance(aging.retireAlways)).toBe(1);
    expect(retireChance(50)).toBe(1);
  });

  it('players outside your team develop off the ice: the young grow, veterans do not, nobody passes his potential', () => {
    const r = rng();
    const young = skater({ age: 20, potential: 90 });
    const veteran = skater({ age: 31, potential: 90 });
    const capped = skater({ age: 20, potential: 70 });
    for (let i = 0; i < 5; i++) for (const p of [young, veteran, capped]) developOffIce(p, r);
    expect(young.overall).toBeGreaterThan(70);
    expect(veteran.overall).toBe(70);
    expect(capped.overall).toBe(70);
  });
});

/** A franchise whose season has just ended, ready for the off-season. */
const seasonOver = (seed = 'offseason'): Franchise => {
  const f = fresh(seed);
  startSeason(f);
  f.season.phase = 'ended';
  f.season.outcome = 'eliminated';
  return f;
};

describe('the end of a season', () => {
  it('banks XP: players who earned it level up and improve, and the report says so', () => {
    const f = seasonOver();
    const team = userTeam(f.league);
    const star = playerOf(f.league, team.lineup.line1[0]!);
    star.age = 22;
    star.potential = 95;
    const before = star.overall;
    f.season.xp[star.id] = 2000;
    expect(finishSeason(f).ok).toBe(true);
    expect(star.level).toBeGreaterThan(5);
    expect(star.overall).toBeGreaterThan(before);
    expect(f.offseason.report?.improved.find((c) => c.id === star.id)).toMatchObject({ from: before, to: star.overall });
    expect(f.season.phase).toBe('offseason');
    expect(f.league.season).toBe(2);
    expect(f.offseason.report?.season).toBe(1);
  });

  it('everyone in the league is a year older', () => {
    const f = seasonOver();
    const ages = new Map(Object.values(f.league.players).map((p) => [p.id, p.age]));
    finishSeason(f);
    for (const p of Object.values(f.league.players)) {
      const was = ages.get(p.id);
      if (was !== undefined) expect(p.age).toBe(was + 1);
    }
  });

  it('a veteran on your team declines, and the report lists him', () => {
    const f = seasonOver();
    const team = userTeam(f.league);
    const vet = playerOf(f.league, team.lineup.line1[1]!);
    vet.age = 36;
    vet.contractYears = 3;
    const before = vet.overall;
    finishSeason(f);
    const still = f.league.players[vet.id];
    if (still) {
      expect(still.overall).toBeLessThan(before);
      expect(f.offseason.report?.declined.some((c) => c.id === vet.id)).toBe(true);
    } else {
      expect(f.offseason.report?.retired.join(' ')).toContain(vet.name);
    }
  });

  it('a retired player leaves his team for good, and his gear returns to the inventory', () => {
    const f = seasonOver();
    const team = userTeam(f.league);
    const old = playerOf(f.league, skatersOn(f.league, team)[0]!.id);
    old.age = aging.retireAlways;
    const stick: GearItem = { id: 'g1', kind: 'skater', slot: 'stick', rarity: 'common', boosts: ['shooting'], perk: null, set: null, level: 1, wornBy: null };
    f.gear.push(stick);
    equip(f, 'g1', old.id);
    finishSeason(f);
    expect(f.league.players[old.id]).toBeUndefined();
    expect(team.roster).not.toContain(old.id);
    expect(wornBy(f, old.id)).toEqual([]);
    expect(stick.wornBy).toBe(null);
    expect(f.offseason.report?.retired.join(' ')).toContain(old.name);
    expect(f.offseason.report?.leagueRetired).toBeGreaterThanOrEqual(1);
    expect([...team.lineup.line1, ...team.lineup.line2]).not.toContain(old.id);
  });

  it('contracts tick down, and yours that reach zero wait for a decision', () => {
    const f = seasonOver();
    const team = userTeam(f.league);
    const roster = rosterOf(f.league, team);
    for (const p of roster) {
      p.age = 25;
      p.contractYears = 3;
    }
    roster[0]!.contractYears = 1;
    roster[1]!.contractYears = 1;
    finishSeason(f);
    expect(f.offseason.pending.sort()).toEqual([roster[0]!.id, roster[1]!.id].sort());
    expect(roster[2]!.contractYears).toBe(2);
    expect(f.offseason.leagueMoved).toBe(false);
    expect(startSeason(f).ok).toBe(false);
  });

  it('with no contracts to decide, the league moves straight away', () => {
    const f = seasonOver();
    for (const p of rosterOf(f.league, userTeam(f.league))) {
      p.age = 25;
      p.contractYears = 3;
    }
    finishSeason(f);
    expect(f.offseason.pending).toEqual([]);
    expect(f.offseason.leagueMoved).toBe(true);
  });

  it('is refused while the season is still going', () => {
    const f = fresh();
    startSeason(f);
    expect(finishSeason(f).ok).toBe(false);
  });
});

describe('your expiring contracts', () => {
  const withExpiring = (): { f: Franchise; a: PlayerRecord; b: PlayerRecord } => {
    const f = seasonOver('contracts');
    const roster = rosterOf(f.league, userTeam(f.league));
    for (const p of roster) {
      p.age = 25;
      p.contractYears = 3;
    }
    roster[0]!.contractYears = 1;
    roster[1]!.contractYears = 1;
    finishSeason(f);
    return { f, a: playerOf(f.league, roster[0]!.id), b: playerOf(f.league, roster[1]!.id) };
  };

  it('re-signing sets the cap hit from his current grade and the years you choose', () => {
    const { f, a } = withExpiring();
    a.capHit = 800_000;
    expect(resignCapHit(a)).toBe(capHitOf(a.overall));
    expect(decideContract(f, a.id, 3)).toEqual({ ok: true });
    expect(a.capHit).toBe(capHitOf(a.overall));
    expect(a.contractYears).toBe(3);
    expect(f.offseason.pending).not.toContain(a.id);
    expect(userTeam(f.league).roster).toContain(a.id);
  });

  it('is refused if it would break the cap, or for a term outside 1 to 4 years', () => {
    const { f, a } = withExpiring();
    expect(decideContract(f, a.id, 7).ok).toBe(false);
    for (const p of rosterOf(f.league, userTeam(f.league))) if (p.id !== a.id) p.capHit = 4_950_000;
    a.capHit = 300_000;
    const refused = decideContract(f, a.id, 2);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/cap/i);
    expect(f.offseason.pending).toContain(a.id);
  });

  it('letting him go sends him to the pool, and the league moves once the last decision is made', () => {
    const { f, a, b } = withExpiring();
    expect(decideContract(f, a.id, null)).toEqual({ ok: true });
    expect(userTeam(f.league).roster).not.toContain(a.id);
    expect(f.offseason.released).toContain(a.id);
    expect(f.offseason.leagueMoved).toBe(false);
    expect(decideContract(f, b.id, 2)).toEqual({ ok: true });
    expect(f.offseason.pending).toEqual([]);
    expect(f.offseason.leagueMoved).toBe(true);
    expect(decideContract(f, b.id, 2).ok).toBe(false);
  });

  it('a good player you let go can be signed by an AI team, and the news says so', () => {
    const { f, a, b } = withExpiring();
    // Make him a star so some team wants him and can find the room.
    a.ratings = { shooting: 90, passing: 90, speed: 90, checking: 90, puckControl: 90, stamina: 90 };
    a.overall = 90;
    a.grade = 'A';
    // Open a spot on every AI team so there is somewhere for him to go.
    for (const team of f.league.teams) {
      if (team.id === f.league.userTeamId) continue;
      const worst = skatersOn(f.league, team).slice(-1)[0]!;
      team.roster = team.roster.filter((id) => id !== worst.id);
      f.league.freeAgents.push(worst.id);
    }
    decideContract(f, a.id, null);
    decideContract(f, b.id, 1);
    const owner = f.league.teams.find((team) => team.roster.includes(a.id));
    expect(owner).toBeDefined();
    expect(owner!.id).not.toBe(f.league.userTeamId);
    expect(f.offseason.report?.news.join(' ')).toContain(a.name);
  });
});

describe('the league between seasons', () => {
  it('after the league moves, every AI team has 7 skaters and a goalie, a legal lineup, and is under the cap', () => {
    for (const seed of ['lm-1', 'lm-2', 'lm-3']) {
      const f = seasonOver(seed);
      for (const p of Object.values(f.league.players)) p.contractYears = 1;
      finishSeason(f);
      for (const id of [...f.offseason.pending]) decideContract(f, id, null);
      expect(f.offseason.leagueMoved).toBe(true);
      for (const team of f.league.teams) {
        if (team.id === f.league.userTeamId) continue;
        expect(skatersOn(f.league, team)).toHaveLength(leagueRules.rosterSkaters);
        expect(goaliesOn(f.league, team)).toHaveLength(leagueRules.rosterGoalies);
        expect(payroll(f.league, team)).toBeLessThanOrEqual(leagueRules.cap);
        expect(canPlay(f.league, team)).toEqual({ ok: true });
      }
    }
  });

  it('a rookie class arrives: young, with room to grow', () => {
    const f = seasonOver('rookies');
    const known = new Set(Object.keys(f.league.players));
    for (const p of rosterOf(f.league, userTeam(f.league))) p.contractYears = 3;
    finishSeason(f);
    const rookies = f.league.freeAgents.map((id) => playerOf(f.league, id)).filter((p) => !known.has(p.id) && p.age <= offseasonRules.rookies.maxAge);
    expect(rookies.length).toBeGreaterThan(0);
    expect(rookies.some((p) => p.potential > p.overall)).toBe(true);
    expect(f.offseason.report?.news.join(' ')).toMatch(/rookies/);
  });

  it('the pool always has a goalie and skaters a team with almost no cap room can afford', () => {
    const f = seasonOver('cheap');
    for (const p of rosterOf(f.league, userTeam(f.league))) p.contractYears = 3;
    finishSeason(f);
    const pool = f.league.freeAgents.map((id) => playerOf(f.league, id));
    expect(pool.filter((p) => p.position === 'G' && p.capHit <= offseasonRules.cheapCapHit).length).toBeGreaterThanOrEqual(offseasonRules.poolMinCheapGoalies);
    expect(pool.filter((p) => p.position !== 'G' && p.capHit <= offseasonRules.cheapCapHit).length).toBeGreaterThanOrEqual(offseasonRules.poolMinCheapSkaters);
    expect(pool.length).toBeLessThanOrEqual(offseasonRules.poolTarget + offseasonRules.poolMinCheapSkaters + offseasonRules.poolMinCheapGoalies);
    for (const p of pool) expect(p.capHit).toBe(capHitOf(p.overall));
  });

  it('every free agent is on offer with a contract term, even one whose contract had run out', () => {
    const f = seasonOver('terms');
    const roster = rosterOf(f.league, userTeam(f.league));
    for (const p of roster) {
      p.age = 25;
      p.contractYears = 3;
    }
    roster[0]!.contractYears = 1;
    finishSeason(f);
    decideContract(f, roster[0]!.id, null);
    expect(f.offseason.leagueMoved).toBe(true);
    for (const id of f.league.freeAgents) expect(playerOf(f.league, id).contractYears).toBeGreaterThanOrEqual(leagueRules.minContractYears);
  });

  it('every player still belongs to exactly one team or the pool', () => {
    const f = seasonOver('whole');
    finishSeason(f);
    for (const id of [...f.offseason.pending]) decideContract(f, id, 1);
    const placed = [...f.league.teams.flatMap((t) => t.roster), ...f.league.freeAgents];
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.sort()).toEqual(Object.keys(f.league.players).sort());
  });

  it('is repeatable: the same franchise has the same off-season', () => {
    const run = (): Franchise => {
      const f = seasonOver('repeat');
      finishSeason(f);
      for (const id of [...f.offseason.pending]) decideContract(f, id, 2);
      return f;
    };
    expect(run()).toEqual(run());
    void leagueMoves;
  });
});

describe('trades', () => {
  const setUp = () => {
    const f = fresh('trades');
    const mine = userTeam(f.league);
    const theirs = teamOf(f.league, f.league.teams[5]!.id);
    return { f, mine, theirs, myBest: skatersOn(f.league, mine)[0]!, myWorst: skatersOn(f.league, mine).slice(-1)[0]!, theirBest: skatersOn(f.league, theirs)[0]!, theirWorst: skatersOn(f.league, theirs).slice(-1)[0]! };
  };

  it('a player is worth his overall, more if he has room to grow, less for each year past 30', () => {
    expect(tradeValue(skater({ overall: 70, potential: 70, age: 27 }))).toBe(70);
    expect(tradeValue(skater({ overall: 70, potential: 80, age: 22 }))).toBe(70 + 10 * offseasonRules.trade.youthCredit);
    expect(tradeValue(skater({ overall: 70, potential: 70, age: 34 }))).toBe(70 - 4 * offseasonRules.trade.agePenaltyPerYear);
  });

  it('the AI accepts a trade that favours it and refuses one that does not, saying why', () => {
    const { f, theirs, myBest, myWorst, theirBest, theirWorst } = setUp();
    myBest.overall = 90;
    myBest.potential = 90;
    myBest.age = 25;
    const good = evaluateTrade(f, myBest.id, theirs.id, theirWorst.id);
    expect(good).toEqual({ ok: true });
    const bad = evaluateTrade(f, myWorst.id, theirs.id, theirBest.id);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toContain(theirs.name);
  });

  it('carrying it out swaps the two players, repairs both lineups and returns your player\'s gear', () => {
    const { f, mine, theirs, myBest, theirWorst } = setUp();
    myBest.overall = 90;
    myBest.potential = 90;
    f.gear.push({ id: 'g1', kind: 'skater', slot: 'stick', rarity: 'common', boosts: ['shooting'], perk: null, set: null, level: 1, wornBy: null });
    equip(f, 'g1', myBest.id);
    expect(trade(f, myBest.id, theirs.id, theirWorst.id)).toEqual({ ok: true });
    expect(mine.roster).toContain(theirWorst.id);
    expect(mine.roster).not.toContain(myBest.id);
    expect(theirs.roster).toContain(myBest.id);
    expect(theirs.roster).not.toContain(theirWorst.id);
    expect(f.gear[0]!.wornBy).toBe(null);
    expect(canPlay(f.league, mine)).toEqual({ ok: true });
    expect(canPlay(f.league, theirs)).toEqual({ ok: true });
  });

  it('must be skater for skater or goalie for goalie', () => {
    const { f, mine, theirs, myBest } = setUp();
    const theirGoalie = goaliesOn(f.league, theirs)[0]!;
    expect(evaluateTrade(f, myBest.id, theirs.id, theirGoalie.id).ok).toBe(false);
    const myGoalie = goaliesOn(f.league, mine)[0]!;
    myGoalie.overall = 95;
    myGoalie.potential = 95;
    expect(evaluateTrade(f, myGoalie.id, theirs.id, theirGoalie.id)).toEqual({ ok: true });
  });

  it('both teams must stay under the cap', () => {
    const { f, theirs, myBest, theirWorst } = setUp();
    myBest.overall = 95;
    myBest.potential = 95;
    theirWorst.capHit = 30_000_000;
    const mineOver = evaluateTrade(f, myBest.id, theirs.id, theirWorst.id);
    expect(mineOver.ok).toBe(false);
    expect(!mineOver.ok && mineOver.reason).toMatch(/cap/i);
    theirWorst.capHit = 1_000_000;
    myBest.capHit = 30_000_000;
    const theirsOver = evaluateTrade(f, myBest.id, theirs.id, theirWorst.id);
    expect(theirsOver.ok).toBe(false);
    expect(!theirsOver.ok && theirsOver.reason).toMatch(/cap/i);
  });

  it('is only allowed in the off-season, and not with players who are not there', () => {
    const { f, theirs, myBest, theirWorst } = setUp();
    myBest.overall = 95;
    expect(evaluateTrade(f, 'nobody', theirs.id, theirWorst.id).ok).toBe(false);
    expect(evaluateTrade(f, myBest.id, theirs.id, 'nobody').ok).toBe(false);
    expect(evaluateTrade(f, myBest.id, f.league.userTeamId, theirWorst.id).ok).toBe(false);
    startSeason(f);
    expect(evaluateTrade(f, myBest.id, theirs.id, theirWorst.id).ok).toBe(false);
  });
});

describe('prestige', () => {
  const champion = (): Franchise => {
    const f = fresh('prestige');
    f.prestige.championAt = true;
    f.artifacts = ['big-pads', 'heavy-sticks'];
    f.tape = 55;
    f.gear.push({ id: 'g1', kind: 'skater', slot: 'stick', rarity: 'epic', boosts: ['shooting', 'passing'], perk: 'heavy-shot', set: null, level: 3, wornBy: null });
    return f;
  };

  it('is offered only in the off-season, after a championship at this level', () => {
    const f = fresh('prestige');
    expect(canPrestige(f).ok).toBe(false);
    f.prestige.championAt = true;
    expect(canPrestige(f)).toEqual({ ok: true });
    startSeason(f);
    expect(canPrestige(f).ok).toBe(false);
  });

  it('keeps the roster, contracts, gear, tape, XP and ratings, and wipes the artifacts', () => {
    const f = champion();
    const star = rosterOf(f.league, userTeam(f.league))[0]!;
    star.level = 7;
    star.xp = 40;
    const roster = JSON.stringify(rosterOf(f.league, userTeam(f.league)));
    expect(prestige(f)).toEqual({ ok: true });
    expect(f.prestige.level).toBe(1);
    expect(f.artifacts).toEqual([]);
    expect(JSON.stringify(rosterOf(f.league, userTeam(f.league)))).toBe(roster);
    expect(f.gear).toHaveLength(1);
    expect(f.tape).toBe(55);
    expect(star.level).toBe(7);
  });

  it('needs a new championship before the next level', () => {
    const f = champion();
    prestige(f);
    expect(f.prestige.championAt).toBe(false);
    expect(prestige(f).ok).toBe(false);
    expect(f.prestige.level).toBe(1);
  });

  it('winning the final sets the flag that allows it', async () => {
    const { recordGame } = await import('../src/core/season');
    const f = fresh('title');
    startSeason(f);
    f.season.phase = 'playoffs';
    f.season.playoffs = { round: seasonRules.playoffRounds - 1, wins: seasonRules.seriesWins - 1, losses: 0, opponentId: f.league.teams[3]!.id };
    recordGame(f, game(true, []));
    expect(f.season.outcome).toBe('champion');
    expect(f.prestige.championAt).toBe(true);
  });

  it('each level makes opponents better and sharper', () => {
    const at = (level: number) => {
      const f = fresh('harder');
      f.prestige.level = level;
      startSeason(f);
      travel(f, availableStops(f)[0]!.id);
      return matchup(f)!;
    };
    const base = at(0);
    const harder = at(2);
    expect(dressedStrength(harder.away)).toBeCloseTo(dressedStrength(base.away) + 2 * prestigeRules.opponentRatingPerLevel, 1);
    expect(harder.level).toBeCloseTo(base.level + 2 * prestigeRules.opponentLevelPerLevel);
    expect(dressedStrength(harder.home)).toBeCloseTo(dressedStrength(base.home));
  });

  it('each level raises the odds of Rare, Epic and Legendary, and the table still adds up to 100%', () => {
    const base = rarityTable(1);
    expect(base).toBe(RARITIES);
    for (let level = 1; level <= prestigeRules.maxLevel; level++) {
      const table = rarityTable(prestigeRules.rarityBoostPerLevel ** level, prestigeRules.minCommonChance);
      expect(table.reduce((s, r) => s + r.chance, 0)).toBeCloseTo(1, 9);
      for (let i = 1; i < table.length; i++) expect(table[i]!.chance).toBeGreaterThan(base[i]!.chance);
      expect(table[0]!.chance).toBeLessThan(base[0]!.chance);
      expect(table[0]!.chance).toBeGreaterThanOrEqual(prestigeRules.minCommonChance - 1e-9);
    }
    expect(rarityTable(100, 0.2)[0]!.chance).toBeCloseTo(0.2);
  });

  it('a jersey colour unlocks with each level, and only unlocked ones can be worn', () => {
    const f = champion();
    expect(unlockedJerseys(f)).toHaveLength(1);
    expect(setJersey(f, 1).ok).toBe(false);
    prestige(f);
    expect(unlockedJerseys(f)).toHaveLength(2);
    expect(setJersey(f, 1)).toEqual({ ok: true });
    expect(jerseyColour(f)).toBe(prestigeRules.jerseys[1]!.colour);
    expect(prestigeEffects(1).join(' ')).toMatch(/15%/);
  });

  it('stops at the top level', () => {
    const f = champion();
    f.prestige.level = prestigeRules.maxLevel;
    expect(canPrestige(f).ok).toBe(false);
  });
});

describe('blocked shots', () => {
  it('an opponent\'s shot that deflects off a skater\'s body counts as a block for him', () => {
    const t = cloneTuning();
    const world = createWorld(t, 'block', { human: false, levels: [0.5, 0.5] });
    clearIce(world, [ID.away1]);
    const blocker = place(world, ID.away1, 5, 0);
    world.puck.pos = { x: 5 - t.skater.radius - t.puck.radius + 0.05, y: 0 };
    world.puck.vel = { x: 30, y: 0 };
    world.puck.shotBy = ID.home1;
    world.puck.lastTeam = 0;
    resolveLoosePuck(world, t, []);
    expect(blocker.stats.blocks).toBe(1);
    expect(world.puck.vel.x).toBeLessThan(0);
    // A pass, or his own team's shot, is not a block.
    world.puck.pos = { x: 5 - t.skater.radius - t.puck.radius + 0.05, y: 0 };
    world.puck.vel = { x: 30, y: 0 };
    world.puck.shotBy = null;
    resolveLoosePuck(world, t, []);
    expect(simPlayer(world, ID.away1).stats.blocks).toBe(1);
  });
});

describe('quick games', () => {
  it('equal teams are a coin flip, and a 20-point edge wins about three times in four', () => {
    expect(winChance(0)).toBeCloseTo(0.5);
    expect(winChance(20)).toBeCloseTo(0.75);
    expect(winChance(-20)).toBeCloseTo(0.25);
  });

  it('gives a finished game with believable stats that add up', () => {
    const f = fresh('quick');
    const home = dressUser(f)!;
    const rng = createRng('quick');
    let wins = 0;
    for (let i = 0; i < 200; i++) {
      const result = quickResult(rng, home, home);
      expect(result.finished).toBe(true);
      expect(result.score[0]).not.toBe(result.score[1]);
      expect(result.players.reduce((s, p) => s + p.goals, 0)).toBe(result.score[0]);
      expect(result.players[6]!.goalsAgainst).toBe(result.score[1]);
      if (result.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThan(70);
    expect(wins).toBeLessThan(130);
  });
});

describe('saving the franchise loop', () => {
  it('a Phase 6 save (version 3) is brought up to date: players at level 1, no prestige, a clean off-season', () => {
    const f = fresh('v3');
    const { prestige: _p, offseason: _o, ...older } = f;
    const { xp: _x, ...oldSeason } = older.season;
    const old = JSON.parse(JSON.stringify({ schemaVersion: 3, savedAt: 'then', ...older, season: oldSeason }));
    for (const p of Object.values(old.league.players) as Record<string, unknown>[]) {
      delete p.xp;
      delete p.level;
    }
    const loaded = fromSave(old);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const back = franchiseOf(loaded.save);
    expect(loaded.save.schemaVersion).toBe(SAVE_VERSION);
    expect(Object.values(back.league.players).every((p) => p.level === 1 && p.xp === 0)).toBe(true);
    expect(back.prestige).toEqual({ level: 0, championAt: false, jersey: 0 });
    expect(back.offseason).toEqual({ report: null, pending: [], released: [], leagueMoved: true, signed: [] });
    expect(back.season.xp).toEqual({});
    expect(startSeason(back).ok).toBe(true);
  });

  it('a save in the middle of an off-season, with contracts still to decide, loads back the same', () => {
    const f = seasonOver('mid-off');
    const roster = rosterOf(f.league, userTeam(f.league));
    for (const p of roster) {
      p.age = 25;
      p.contractYears = 3;
    }
    roster[0]!.contractYears = 1;
    finishSeason(f);
    expect(f.offseason.pending).toHaveLength(1);
    const loaded = parseSave(JSON.stringify(toSave(f, 'now')));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const back = franchiseOf(loaded.save);
    expect(back).toEqual(f);
    expect(decideContract(back, back.offseason.pending[0]!, 2)).toEqual({ ok: true });
    expect(back.offseason.leagueMoved).toBe(true);
  });
});

describe('20 seasons from 20 seeds', () => {
  const runs = Array.from({ length: 20 }, (_, i) => runFranchise(`health-${i}`, 20));
  const summary = summarise(runs);

  it('every team can always field a full roster, and no team is ever over the cap', () => {
    for (const year of summary) {
      expect(year.illegalRosters).toBe(0);
      expect(year.overCap).toBe(0);
    }
  });

  it('every season is actually played', () => {
    for (const run of runs) expect(run.outcomes.every((o) => o !== 'not played')).toBe(true);
  });

  it('the average age stays in a narrow band: rookies replace retirees', () => {
    for (const year of summary) {
      expect(year.averageAge).toBeGreaterThan(26);
      expect(year.averageAge).toBeLessThan(30.5);
    }
  });

  it('grades stay spread: there are always D, C, B and A players, and nobody is squeezed out', () => {
    for (const year of summary.slice(4)) {
      const g = year.grades;
      expect((g.D ?? 0)).toBeGreaterThan(1);
      expect((g.C ?? 0) + (g['C+'] ?? 0)).toBeGreaterThan(20);
      expect((g.B ?? 0) + (g['B+'] ?? 0)).toBeGreaterThan(15);
      expect((g.A ?? 0) + (g['A+'] ?? 0) + (g.S ?? 0)).toBeGreaterThan(1);
      // No single grade swallows the league.
      for (const count of Object.values(g)) expect(count).toBeLessThan(60);
    }
  });

  it('the league does not run away: its average overall settles', () => {
    const late = summary.slice(12).map((y) => y.leagueStrength);
    expect(Math.max(...late) - Math.min(...late)).toBeLessThan(3);
    expect(summary[summary.length - 1]!.leagueStrength).toBeLessThan(82);
  });

  it('a snapshot and the automatic manager work on a single franchise', () => {
    const f = fresh('single');
    autoOffseason(f);
    const snap = leagueSnapshot(f);
    expect(snap.illegalRosters).toBe(0);
    expect(Object.values(snap.grades).reduce((s, v) => s + v, 0)).toBe(13 * 8);
    quickSeason(f, createRng('single'));
    expect(f.season.phase).toBe('offseason');
    expect(f.league.season).toBe(2);
    expect(f.offseason.report).not.toBe(null);
  });
});
