import { describe, expect, it } from 'vitest';
import { perkInfo, releasePlayer, type GearItem } from '../src/core/gear';
import { generateLeague } from '../src/core/generate';
import { playerOf, rosterOf, skatersOn, userTeam } from '../src/core/league';
import { balancedLine, dress } from '../src/core/matchup';
import { beginSeason, finishSeason, resignCapHit } from '../src/core/offseason';
import { capHitOf, type PlayerRecord } from '../src/core/player';
import { deadCapFor, payroll } from '../src/core/roster';
import { hiddenFreeAgents, signPlayer } from '../src/core/scouting';
import { newFranchise, type Franchise, startSeason } from '../src/core/season';
import { tradeValue } from '../src/core/trades';
import { addXp, autoSpend, canGrow, spendPoint, xpForLevel } from '../src/core/xp';
import economy from '../src/data/economy.json';
import gearData from '../src/data/gear.json';
import leagueRules from '../src/data/league.json';
import offseasonRules from '../src/data/offseason.json';
import xpRules from '../src/data/xp.json';

const fresh = (seed = 'roster-rules'): Franchise => newFranchise(generateLeague(seed));
const skater = (over: Partial<PlayerRecord> = {}): PlayerRecord => ({
  id: 'p-test',
  name: 'Test Player',
  position: 'F',
  age: 27,
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

describe('contract length', () => {
  const c = offseasonRules.contract;
  it('a longer deal costs more for a player still improving', () => {
    const young = skater({ age: c.youngMaxAge - 2, overall: 80 });
    expect(resignCapHit(young, undefined, 1)).toBe(capHitOf(80));
    expect(resignCapHit(young, undefined, 4)).toBeGreaterThan(resignCapHit(young, undefined, 2));
    expect(resignCapHit(young, undefined, 2)).toBeGreaterThan(resignCapHit(young, undefined, 1));
  });

  it('and less for one past his peak; the same for a player in his prime', () => {
    const old = skater({ age: c.oldMinAge + 1, overall: 80 });
    expect(resignCapHit(old, undefined, 4)).toBeLessThan(resignCapHit(old, undefined, 1));
    const prime = skater({ age: 28, overall: 80 });
    expect(resignCapHit(prime, undefined, 4)).toBe(resignCapHit(prime, undefined, 1));
  });
});

describe('dead cap', () => {
  it('releasing a player under contract leaves part of his pay on the cap', () => {
    const f = fresh();
    const team = userTeam(f.league);
    const victim = skatersOn(f.league, team)[0]!;
    victim.contractYears = 3;
    const before = payroll(f.league, team);
    const owed = deadCapFor(f.league, victim.id);
    expect(owed).toBe(Math.round(victim.capHit * leagueRules.deadCapShare));
    expect(releasePlayer(f, victim.id)).toEqual({ ok: true });
    expect(team.deadCap).toBe(owed);
    expect(payroll(f.league, team)).toBe(before - victim.capHit + owed);
  });

  it('a player whose contract has run out leaves nothing', () => {
    const f = fresh();
    const team = userTeam(f.league);
    const victim = skatersOn(f.league, team)[0]!;
    victim.contractYears = 0;
    expect(deadCapFor(f.league, victim.id)).toBe(0);
    releasePlayer(f, victim.id);
    expect(team.deadCap).toBeUndefined();
  });

  it('in a fire sale another club takes the contract, so nothing is owed', () => {
    const f = fresh();
    const team = userTeam(f.league);
    f.cash = -2_000_000;
    const victim = skatersOn(f.league, team)[0]!;
    victim.contractYears = 3;
    releasePlayer(f, victim.id);
    expect(team.deadCap).toBeUndefined();
    expect(f.cash).toBeGreaterThan(-2_000_000);
  });

  it('is gone when the season it counted against ends', () => {
    const f = fresh();
    const team = userTeam(f.league);
    team.deadCap = 1_000_000;
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    expect(finishSeason(f).ok).toBe(true);
    expect(team.deadCap).toBeUndefined();
  });
});

describe('trade value', () => {
  it('a player paid more than his grade is worth less; a bargain is worth more', () => {
    const fair = skater({ overall: 80, capHit: capHitOf(80), potential: 80 });
    const dear = skater({ overall: 80, capHit: capHitOf(80) + 2_000_000, potential: 80 });
    const cheap = skater({ overall: 80, capHit: capHitOf(80) - 2_000_000, potential: 80 });
    expect(tradeValue(dear)).toBeCloseTo(tradeValue(fair) - 2 * offseasonRules.trade.salaryPerMillion);
    expect(tradeValue(cheap)).toBeGreaterThan(tradeValue(fair));
  });

  it('an unproven youngster with room to grow is not worth an established player ten points better', () => {
    const prospect = skater({ overall: 66, potential: 90, age: 19, capHit: capHitOf(66) });
    const proven = skater({ overall: 80, potential: 80, age: 27, capHit: capHitOf(80) });
    expect(tradeValue(prospect)).toBeLessThan(tradeValue(proven));
  });
});

describe('balanced lines', () => {
  const p = (position: 'F' | 'D'): Pick<PlayerRecord, 'position'> => ({ position });
  it('a line needs a forward and a defenceman', () => {
    const six = [p('F'), p('F'), p('D'), p('F'), p('F'), p('F')];
    expect(balancedLine(six, 0)).toBe(true);
    expect(balancedLine(six, 1)).toBe(false);
    expect(balancedLine([p('D'), p('D'), p('D')], 0)).toBe(false);
  });

  it('the bonus goes onto the ice for the skaters of a balanced line only', () => {
    const f = fresh();
    const team = userTeam(f.league);
    const forwards = skatersOn(f.league, team).filter((x) => x.position === 'F');
    const defence = skatersOn(f.league, team).filter((x) => x.position === 'D');
    expect(forwards.length).toBeGreaterThanOrEqual(3);
    expect(defence.length).toBeGreaterThanOrEqual(3);
    team.lineup.line1 = [forwards[0]!.id, forwards[1]!.id, defence[0]!.id];
    team.lineup.line2 = [defence[1]!.id, defence[2]!.id, defence[3]?.id ?? forwards[2]!.id];
    const mixedSecond = defence.length < 4;
    const dressed = dress(f.league, team)!;
    const bonus = leagueRules.lineBonus.modifiers[0]!;
    for (const i of [0, 1, 2]) expect(dressed.setup.skaterModifiers![i]).toContainEqual(bonus);
    for (const i of [3, 4, 5]) expect(dressed.setup.skaterModifiers![i]!.some((m) => m.stat === bonus.stat)).toBe(mixedSecond);
  });
});

describe('gear levels', () => {
  const item = (level: number): GearItem => ({ id: 'g', kind: 'skater', slot: 'stick', rarity: 'epic', boosts: ['shooting'], perk: 'heavy-shot', set: null, level, wornBy: null });
  it('each level makes the perk stronger', () => {
    const one = perkInfo(item(1))!.modifiers[0]!;
    const five = perkInfo(item(5))!.modifiers[0]!;
    expect(five.stat).toBe(one.stat);
    const gain = (m: { op: string; value: number }): number => (m.op === 'mul' ? m.value - 1 : m.value);
    expect(gain(five)).toBeCloseTo(gain(one) * (1 + 4 * gearData.perkPerLevel));
  });
});

describe('skill points', () => {
  it('your level-ups bank points; other players\' go in automatically', () => {
    const mine = skater();
    const theirs = skater();
    addXp(mine, xpForLevel(1), true);
    addXp(theirs, xpForLevel(1));
    expect(mine.level).toBe(2);
    expect(mine.points).toBe(xpRules.pointsPerLevel);
    expect(mine.overall).toBe(70);
    expect(theirs.points).toBeUndefined();
    expect(Object.values(theirs.ratings).reduce((s, v) => s + v, 0)).toBe(420 + xpRules.pointsPerLevel);
  });

  it('a point goes where you put it, and can change what kind of player he is', () => {
    const p = skater({ points: 3 });
    expect(spendPoint(p, 'checking')).toEqual({ ok: true });
    expect((p.ratings as unknown as Record<string, number>).checking).toBe(71);
    expect(p.points).toBe(2);
    spendPoint(p, 'checking');
    spendPoint(p, 'checking');
    expect(p.points).toBeUndefined();
    const refused = spendPoint(p, 'checking');
    expect(refused.ok).toBe(false);
  });

  it('refuses a rating he does not have, one already at the top, and a player at his ceiling', () => {
    expect(spendPoint(skater({ points: 1 }), 'reflexes').ok).toBe(false);
    const top = skater({ points: 1 });
    (top.ratings as unknown as Record<string, number>).shooting = xpRules.maxRating;
    expect(spendPoint(top, 'shooting').ok).toBe(false);
    const capped = skater({ points: 1, potential: 70 });
    expect(canGrow(capped)).toBe(false);
    expect(spendPoint(capped, 'shooting').ok).toBe(false);
    // A player at his ceiling banks nothing new.
    addXp(capped, xpForLevel(1), true);
    expect(capped.points).toBe(1);
  });

  it('the automatic way spends them all as before', () => {
    const p = skater({ points: 6 });
    expect(autoSpend(p)).toBe(6);
    expect(p.points).toBeUndefined();
    expect(Object.values(p.ratings).reduce((s, v) => s + v, 0)).toBe(426);
    expect(autoSpend(p)).toBe(0);
  });
});

describe('the bigger roster', () => {
  it('every team starts with 8 skaters and a goalie and can dress six', () => {
    const f = fresh();
    for (const team of f.league.teams) {
      expect(rosterOf(f.league, team).filter((p) => p.position !== 'G')).toHaveLength(leagueRules.rosterSkaters);
      expect(dress(f.league, team)).not.toBeNull();
    }
  });
});

describe('first pick of the free agents', () => {
  /** A finished first season with nothing of yours expiring. */
  const offseason = (): Franchise => {
    const f = fresh('first-pick');
    for (const p of rosterOf(f.league, userTeam(f.league))) {
      p.contractYears = 3;
      p.age = 25;
    }
    for (const team of f.league.teams) if (team.id !== f.league.userTeamId) for (const id of team.roster.slice(0, 2)) playerOf(f.league, id).contractYears = 1;
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    expect(finishSeason(f).ok).toBe(true);
    return f;
  };

  it('after the season the pool is open, with rookies, and no other team has moved', () => {
    const f = offseason();
    expect(f.offseason.poolOpened).toBe(true);
    expect(f.offseason.leagueMoved).toBe(false);
    // The other teams still carry the players whose contracts ran out.
    const expired = f.league.teams.filter((t) => t.id !== f.league.userTeamId).flatMap((t) => t.roster).filter((id) => playerOf(f.league, id).contractYears <= 0);
    expect(expired.length).toBeGreaterThan(0);
    expect(f.offseason.report!.news.join(' ')).toMatch(/first pick of the free agents/);
    expect(f.offseason.report!.news.join(' ')).toMatch(/rookies/);
  });

  it('the best free agent is still there for you, and gone or signed once the league has moved', () => {
    const f = offseason();
    const hidden = hiddenFreeAgents(f);
    const best = f.league.freeAgents.filter((id) => !hidden.has(id)).map((id) => playerOf(f.league, id)).sort((a, b) => b.overall - a.overall)[0]!;
    expect(best.overall).toBeGreaterThan(70);
    expect(f.league.freeAgents).toContain(best.id);
    expect(beginSeason(f).ok).toBe(true);
    expect(f.offseason.leagueMoved).toBe(true);
    for (const team of f.league.teams) {
      expect(rosterOf(f.league, team).every((p) => p.contractYears > 0)).toBe(true);
      expect(dress(f.league, team)).not.toBeNull();
    }
  });

  it('a season cannot start until the league has moved, and beginSeason sees to it', () => {
    const f = offseason();
    const refused = startSeason(f);
    expect(refused.ok).toBe(false);
    expect(beginSeason(f).ok).toBe(true);
    expect(f.season.phase).toBe('map');
  });

  it('if your own side is not ready the league does not move yet', () => {
    const f = offseason();
    f.cash = -1;
    expect(beginSeason(f).ok).toBe(false);
    expect(f.offseason.leagueMoved).toBe(false);
  });
});
