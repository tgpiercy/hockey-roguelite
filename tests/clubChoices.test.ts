import { describe, expect, it } from 'vitest';
import { sponsorshipMoney } from '../src/core/economy';
import { build, buildCost, freeBuilds, homeIceModifiers } from '../src/core/facilities';
import { generateLeague } from '../src/core/generate';
import { MASCOT_ID } from '../src/core/mascot';
import { finishSeason } from '../src/core/offseason';
import { prestige, prestigeEffects } from '../src/core/prestige';
import { availableStops, matchup, newFranchise, recordGame, seatMascot, startSeason, teamModifiers, travel, type Franchise } from '../src/core/season';
import { staffModifiers } from '../src/core/staff';
import facilities from '../src/data/facilities.json';
import prestigeRules from '../src/data/prestige.json';
import staffRules from '../src/data/staff.json';
import type { GameResult } from '../src/sim/match';

const fresh = (seed = 'club-choices'): Franchise => newFranchise(generateLeague(seed));
const started = (seed = 'club-choices'): Franchise => {
  const f = fresh(seed);
  expect(startSeason(f).ok).toBe(true);
  return f;
};
const won: GameResult = { score: [1, 0], winner: 0, finished: true, overtime: false, periods: 3, players: [], powerupsUsed: [] } as unknown as GameResult;

describe('home ice', () => {
  it('the arena gives your team an edge on the ice, bigger with each level, and only at home', () => {
    const f = started();
    expect(homeIceModifiers(f)).toEqual([]);
    f.facilities.arena = 3;
    const edge = homeIceModifiers(f);
    expect(edge).toContainEqual({ stat: 'topSpeedScale', op: 'mul', value: 1 + 3 * 0.006 });
    const speed = (g: Franchise): number => teamModifiers(g).filter((m) => m.stat === 'topSpeedScale').reduce((x, m) => x * m.value, 1);
    // Game 1 is at home; game 2 is on the road.
    expect(speed(f)).toBeGreaterThan(1);
    f.season.gamesPlayed = 1;
    expect(speed(f)).toBe(1);
    f.season.gamesPlayed = 2;
    expect(speed(f)).toBeGreaterThan(1);
  });
});

describe('the training centre on the ice', () => {
  it('each level makes your team shoot and pass a little straighter', () => {
    const f = started();
    const accuracy = (g: Franchise): number => teamModifiers(g).filter((m) => m.stat === 'accuracy').reduce((x, m) => x + m.value, 0);
    expect(accuracy(f)).toBe(0);
    f.facilities.training = 4;
    expect(accuracy(f)).toBeCloseTo(4 * 0.008);
    expect(facilities.facilities.find((x) => x.id === 'training')!.description).toMatch(/straighter/);
  });
});

describe('the promoter', () => {
  it('earns about half what he did, so he is no longer an automatic first hire', () => {
    const promoter = staffRules.roles.find((role) => role.id === 'promoter')!;
    const ticket = promoter.perPower.find((m) => m.stat === 'ticketRevenue')!;
    expect(ticket.value).toBeLessThanOrEqual(0.015);
    const f = fresh();
    f.staff = [{ id: 's', name: 'P', role: 'promoter', grade: 'D', salary: 300_000, contractYears: 1 }] as unknown as Franchise['staff'];
    expect(staffModifiers(f).find((m) => m.stat === 'sponsorRevenue')!.value).toBeCloseTo(1.015);
    // A D-grade promoter no longer pays for himself three times over.
    const gain = sponsorshipMoney(f) - sponsorshipMoney(fresh());
    expect(gain).toBeLessThan(2 * 300_000);
  });
});

describe('prestige gives the club something back', () => {
  const champion = (): Franchise => {
    const f = fresh();
    f.prestige.championAt = true;
    return f;
  };

  it('sponsors pay a bigger share at each level', () => {
    const f = champion();
    const before = sponsorshipMoney(f);
    expect(prestige(f).ok).toBe(true);
    expect(sponsorshipMoney(f)).toBeCloseTo(before + prestigeRules.sponsorSharePerLevel * f.value, -3);
    expect(prestigeEffects(1).join(' ')).toMatch(/Sponsors/);
  });

  it('and one facility level is free, once', () => {
    const f = champion();
    prestige(f);
    expect(freeBuilds(f)).toBe(prestigeRules.freeBuildsPerLevel);
    f.cash = 0;
    expect(build(f, 'arena')).toEqual({ ok: true });
    expect(f.facilities.arena).toBe(1);
    expect(f.cash).toBe(0);
    expect(freeBuilds(f)).toBe(0);
    const refused = build(f, 'arena');
    expect(refused.ok).toBe(false);
    f.cash = buildCost(1)!;
    expect(build(f, 'arena')).toEqual({ ok: true });
    expect(f.cash).toBe(0);
  });
});

describe('your say over the mascot', () => {
  /** A season at a game where your mascot has turned up. */
  const withMascot = (): Franchise => {
    const f = started();
    f.facilities.den = 5;
    f.mascot.costume = 5;
    for (let guard = 0; guard < 400; guard++) {
      if (f.season.current === null) travel(f, availableStops(f).find((s) => s.kind === 'game' && !s.elite)!.id);
      if (matchup(f)?.mascotOffered) return f;
      f.season.gamesPlayed += 1;
    }
    throw new Error('the mascot never came');
  };

  it('he takes a random skater\'s place unless you choose', () => {
    const f = withMascot();
    const game = matchup(f)!;
    expect(game.mascots.home).not.toBeNull();
    expect(game.home.players.filter((p) => p.id === MASCOT_ID)).toHaveLength(1);
  });

  it('you choose who sits', () => {
    const f = withMascot();
    for (const slot of [0, 3, 5]) {
      expect(seatMascot(f, slot).ok).toBe(true);
      expect(matchup(f)!.home.players.findIndex((p) => p.id === MASCOT_ID)).toBe(slot);
    }
  });

  it('or send him home and play your own six', () => {
    const f = withMascot();
    expect(seatMascot(f, null).ok).toBe(true);
    const game = matchup(f)!;
    expect(game.mascots.home).toBeNull();
    expect(game.mascotOffered).toBe(true);
    expect(game.home.players.some((p) => p.id === MASCOT_ID)).toBe(false);
  });

  it('the choice is for that game only, and refused when he has not come', () => {
    const f = withMascot();
    seatMascot(f, null);
    expect(seatMascot(f, 9).ok).toBe(false);
    recordGame(f, won);
    expect(f.season.mascotSeat?.game).not.toBe(f.season.gamesPlayed);
    const g = started();
    travel(g, availableStops(g).find((s) => s.kind === 'game' && !s.elite)!.id);
    if (!matchup(g)!.mascotOffered) expect(seatMascot(g, 0).ok).toBe(false);
  });
});

describe('the report says what the club did', () => {
  it('lists the extra XP, the aging saved, the extra money, the medical wing and home ice', () => {
    const f = started();
    f.facilities = { ...f.facilities, training: 2, medical: 2, arena: 2 };
    for (const id of f.league.teams.find((t) => t.id === f.league.userTeamId)!.roster) f.season.xp[id] = 300;
    f.ledger.tickets = 5_000_000;
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    expect(finishSeason(f).ok).toBe(true);
    const lines = f.offseason.report!.news.filter((text) => text.startsWith('Your club:'));
    const all = lines.join(' ');
    expect(all).toMatch(/more XP/);
    expect(all).toMatch(/16% off what age cost/);
    expect(all).toMatch(/brought in \$/);
    expect(all).toMatch(/medical wing/);
    expect(all).toMatch(/level 2 arena/);
  });

  it('says nothing for a club that has built nothing', () => {
    const f = started();
    f.staff = [];
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    finishSeason(f);
    expect(f.offseason.report!.news.filter((text) => text.startsWith('Your club:'))).toEqual([]);
  });
});
