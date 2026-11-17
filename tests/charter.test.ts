import { describe, expect, it } from 'vitest';
import { CHARTERS, charterInfo, cleanVows, nextRank, opponentModifiers, setupLine, setupModifiers, STANDARD_CHARTER, vowPackLuck, vowPay, vowPoints, VOWS, weeklySetup } from '../src/core/charter';
import { clubRecords } from '../src/core/chronicle';
import { generateLeague } from '../src/core/generate';
import { beginSeason } from '../src/core/offseason';
import { fromSave, franchiseOf, toSave } from '../src/core/save';
import { rallyOffered, availableStops, canSimulate, currentStop, healPrice, healStrike, matchup, maxStrikes, newFranchise, pickArtifact, recordGame, seasonRegions, shopPrice, startSeason, teamModifiers, travel, type Franchise, pickRinger } from '../src/core/season';
import { betterResult, claimWeekly, isWeekly, newWeekly, resultLine, weekKey, weeklyOver, weeklyResult } from '../src/core/weekly';
import data from '../src/data/charters.json';
import rules from '../src/data/season.json';
import type { GameResult } from '../src/sim/match';
import { defaultGoalieRatings, defaultSkaterRatings, goalieEffects, skaterEffects } from '../src/sim/ratings';

const fresh = (seed = 'charter'): Franchise => newFranchise(generateLeague(seed));
const started = (setup: Parameters<typeof startSeason>[1] = {}, seed = 'charter'): Franchise => {
  const f = fresh(seed);
  expect(startSeason(f, setup).ok).toBe(true);
  return f;
};
const result = (won: boolean, goalsBy: number[] = []): GameResult => ({
  score: won ? [3, 1] : [1, 3],
  winner: won ? 0 : 1,
  finished: true,
  overtime: false,
  periods: 3,
  players: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: i, team: 0 as const, role: i === 6 ? ('goalie' as const) : ('skater' as const), line: (i >= 3 && i < 6 ? 1 : 0) as 0 | 1, slot: i === 6 ? 0 : i % 3, goals: goalsBy.filter((x) => x === i).length, assists: 0, shots: 0, hits: 0, blocks: 0, timeOnIce: 100, saves: 0, goalsAgainst: 0 })),
  powerupsUsed: [],
});
const toGame = (f: Franchise): void => {
  const stop = availableStops(f).find((s) => s.kind === 'game' && !s.elite)!;
  delete stop.rink;
  travel(f, stop.id);
};

describe('the data', () => {
  const simStats = new Set([...Object.keys(skaterEffects(defaultSkaterRatings)), ...Object.keys(goalieEffects(defaultGoalieRatings))]);
  const seasonStats = new Set(['currencyGain', 'shopPrice', 'opponentRating', 'opponentLevel', 'maxStrikes', 'noSimulate', 'artifactChoices', 'noRepairs', 'startingPowerups', 'bossLossEnds']);

  it('there is a standard charter and at least four others, and about eight handicaps', () => {
    expect(charterInfo(STANDARD_CHARTER).id).toBe(STANDARD_CHARTER);
    expect(charterInfo('nonsense').id).toBe(STANDARD_CHARTER);
    expect(CHARTERS.length).toBeGreaterThanOrEqual(5);
    expect(VOWS.length).toBeGreaterThanOrEqual(8);
    expect(new Set([...CHARTERS, ...VOWS].map((x) => x.id)).size).toBe(CHARTERS.length + VOWS.length);
  });

  it('every modifier names a stat something reads', () => {
    for (const c of CHARTERS) {
      expect(c.describe.length).toBeGreaterThan(20);
      for (const m of [...(c.modifiers ?? []), ...(c.opponent ?? []), ...(c.perDefenceGoal ?? [])]) expect(simStats.has(m.stat) || seasonStats.has(m.stat), `${c.id}: ${m.stat}`).toBe(true);
    }
    for (const v of VOWS) {
      expect(v.ranks).toBeGreaterThanOrEqual(1);
      expect(v.modifiers.length).toBeGreaterThan(0);
      for (const m of v.modifiers) expect(seasonStats.has(m.stat), `${v.id}: ${m.stat}`).toBe(true);
    }
  });
});

describe('handicaps', () => {
  it('points are ranks, held to what each vow allows, with anything unknown dropped', () => {
    expect(cleanVows({ tougher: 5, thinIce: 1, nonsense: 2, sharper: 0 })).toEqual({ tougher: 2, thinIce: 1 });
    expect(vowPoints({ tougher: 5, thinIce: 1 })).toBe(3);
    expect(vowPoints(undefined)).toBe(0);
  });

  it('a row steps a vow through its ranks and back to none', () => {
    let vows: Record<string, number> = {};
    vows = nextRank(vows, 'tougher');
    expect(vows).toEqual({ tougher: 1 });
    vows = nextRank(vows, 'tougher');
    expect(vows).toEqual({ tougher: 2 });
    vows = nextRank(vows, 'tougher');
    expect(vows).toEqual({});
  });

  it('each point pays: more Pucks and better pack luck', () => {
    expect(vowPay({})).toBe(1);
    expect(vowPay({ tougher: 2, thinIce: 1 })).toBeCloseTo(1 + 3 * data.reward.currencyPerPoint);
    expect(vowPackLuck({ tougher: 2 })).toBeCloseTo(1 + 2 * data.reward.packLuckPerPoint);
    expect(setupModifiers({ vows: { thinIce: 1 } })).toContainEqual({ stat: 'currencyGain', op: 'mul', value: 1 + data.reward.currencyPerPoint });
  });

  it('a standard season with none is exactly the season as it was', () => {
    const plain = started();
    const also = started({ charter: STANDARD_CHARTER, vows: {} });
    expect(also.season).toEqual(plain.season);
    expect(plain.season.charter).toBeUndefined();
    expect(maxStrikes(plain)).toBe(rules.maxStrikes);
    expect(seasonRegions(plain)).toBe(rules.regions);
    expect(setupLine({})).toBe('');
  });

  it('stronger and sharper opponents: every opponent is better and thinks faster, more with each rank', () => {
    const plain = started();
    toGame(plain);
    const one = started({ vows: { tougher: 1, sharper: 1 } });
    toGame(one);
    const two = started({ vows: { tougher: 2, sharper: 2 } });
    toGame(two);
    const shooting = (f: Franchise): number => matchup(f)!.away.setup.skaters[0]!.shooting;
    expect(shooting(one) - shooting(plain)).toBe(2);
    expect(shooting(two) - shooting(plain)).toBe(4);
    expect(matchup(one)!.level).toBeCloseTo(Math.min(1, matchup(plain)!.level + 0.08));
    expect(matchup(two)!.level).toBeGreaterThanOrEqual(matchup(one)!.level);
  });

  it('dear shops, thin ice, every game counts, no repairs, a bare cupboard', () => {
    const plain = started();
    const hard = started({ vows: { dearShops: 2, thinIce: 1, noSim: 1, noRepairs: 1, bareShelf: 1 } });
    expect(healPrice(hard)).toBe(Math.round(healPrice(plain) * 1.3 * 1.3));
    const powerup = plain.season.powerups[0]!;
    expect(shopPrice(hard, powerup)).toBeGreaterThan(shopPrice(plain, powerup));
    expect(maxStrikes(hard)).toBe(rules.maxStrikes - 1);
    expect(plain.season.powerups.length).toBe(rules.startingPowerups);
    expect(hard.season.powerups).toEqual([]);
    toGame(plain);
    toGame(hard);
    expect(canSimulate(plain)).toBe(true);
    expect(canSimulate(hard)).toBe(false);
    // In a shop, with a strike to wipe and the Pucks to pay: still refused.
    const shop = started({ vows: { noRepairs: 1 } });
    const stop = Object.values(shop.season.map!.stops).find((s) => s.kind === 'shop')!;
    shop.season.current = stop.id;
    shop.season.stage = 'arrived';
    shop.season.strikes = 1;
    shop.season.currency = 9999;
    expect(healStrike(shop).ok).toBe(false);
    expect(shop.season.strikes).toBe(1);
  });

  it('thin ice ends the season a strike sooner', () => {
    const f = started({ vows: { thinIce: 1 } });
    // One loss short of the usual limit is now the limit.
    f.season.strikes = rules.maxStrikes - 2;
    toGame(f);
    recordGame(f, result(false));
    expect(f.season.phase).toBe('ended');
    expect(f.season.strikes).toBe(rules.maxStrikes - 1);
  });

  it('a win pays more with handicap points', () => {
    const plain = started();
    toGame(plain);
    recordGame(plain, result(true));
    const hard = started({ vows: { tougher: 2, thinIce: 1 } });
    toGame(hard);
    recordGame(hard, result(true));
    expect(hard.season.currency - rules.startingCurrency).toBe(Math.round((plain.season.currency - rules.startingCurrency) * (1 + 3 * data.reward.currencyPerPoint)));
  });
});

describe('charters', () => {
  it('iron line: one line in every game, and your skaters tire more slowly', () => {
    const f = started({ charter: 'ironLine' });
    toGame(f);
    expect(matchup(f)!.rules).toMatchObject({ oneLine: true });
    expect(teamModifiers(f)).toContainEqual({ stat: 'drainScale', op: 'mul', value: 0.65 });
    const plain = started();
    toGame(plain);
    expect(matchup(plain)!.rules?.oneLine).toBeUndefined();
  });

  it('bruisers: both sides knock down with every body check', () => {
    const f = started({ charter: 'bruisers' });
    toGame(f);
    expect(teamModifiers(f)).toContainEqual({ stat: 'alwaysKnockdown', op: 'add', value: 1 });
    expect(matchup(f)!.away.setup.modifiers).toContainEqual({ stat: 'alwaysKnockdown', op: 'add', value: 1 });
    expect(opponentModifiers({})).toEqual([]);
  });

  it('blue-line club: each goal by a defenceman lifts the team, up to the cap; a forward\'s does not', () => {
    const f = started({ charter: 'blueLine' });
    toGame(f);
    const dressed = matchup(f)!.home.players;
    const defence = dressed.findIndex((p, i) => i < 6 && p.position === 'D');
    const forward = dressed.findIndex((p, i) => i < 6 && p.position === 'F');
    expect(defence).toBeGreaterThanOrEqual(0);
    recordGame(f, result(true, [forward, forward, defence]));
    expect(f.season.defenceGoals).toBe(1);
    expect(teamModifiers(f)).toContainEqual({ stat: 'topSpeedScale', op: 'mul', value: 1.01 });
    expect(setupModifiers({ charter: 'blueLine' }, 50)).toContainEqual({ stat: 'topSpeedScale', op: 'mul', value: 1.1 });
    // Without the charter the goals are not even counted for anything.
    expect(setupModifiers({}, 50)).toEqual([]);
  });

  it('short season: one region, and its boss leads to the playoffs', () => {
    const f = started({ charter: 'short' });
    expect(seasonRegions(f)).toBe(1);
    const stops = Object.values(f.season.map!.stops);
    expect(new Set(stops.map((s) => s.region))).toEqual(new Set([0]));
    expect(stops.filter((s) => s.kind === 'boss')).toHaveLength(1);
    expect(teamModifiers(f)).toContainEqual({ stat: 'currencyGain', op: 'mul', value: 0.75 });
    // Standing at the boss, having beaten him and taken the prize: the playoffs follow.
    const boss = stops.find((s) => s.kind === 'boss')!;
    f.season.current = boss.id;
    f.season.stage = 'arrived';
    recordGame(f, result(true));
    while ((f.season.stage as string) === 'reward') pickArtifact(f, f.season.offer[0]!);
    if ((f.season.stage as string) === 'ringer') pickRinger(f, null);
    expect(f.season.phase).toBe('playoffs');
  });

  it('beginSeason passes the set-up on, and it is saved with the season', () => {
    const f = fresh();
    expect(beginSeason(f, { charter: 'bruisers', vows: { thinIce: 1 } }).ok).toBe(true);
    expect(f.season.charter).toBe('bruisers');
    expect(f.season.vows).toEqual({ thinIce: 1 });
    expect(setupLine({ charter: 'bruisers', vows: { thinIce: 1 } })).toBe('Bruisers · 1 handicap point');
    const loaded = fromSave(JSON.parse(JSON.stringify(toSave(f, 'now'))));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(franchiseOf(loaded.save).season.charter).toBe('bruisers');
  });

  it('the trophy room remembers the hardest title', () => {
    const f = fresh();
    f.history = [
      { season: 1, outcome: 'champion', wins: 10, losses: 2, place: 1, points: 20, topScorer: null, awards: [], handicap: 2 },
      { season: 2, outcome: 'champion', wins: 10, losses: 2, place: 1, points: 20, topScorer: null, awards: [], handicap: 5 },
      { season: 3, outcome: 'struckOut', wins: 1, losses: 3, place: 9, points: 2, topScorer: null, awards: [], handicap: 9 },
    ];
    expect(clubRecords(f)).toContainEqual({ label: 'Hardest title', value: '5 handicap points (season 2)' });
  });
});

describe('the weekly run', () => {
  it('the week key is the ISO week of a date', () => {
    expect(weekKey(2026, 11, 15)).toBe('2026-W46');
    expect(weekKey(2026, 11, 16)).toBe('2026-W47');
    expect(weekKey(2027, 1, 1)).toBe('2026-W53');
    expect(weekKey(2026, 1, 1)).toBe('2026-W01');
    expect(weekKey(2024, 12, 30)).toBe('2025-W01');
  });

  it('the same week gives the same run; the next week a different one', () => {
    const a = newWeekly('2026-W46');
    const b = newWeekly('2026-W46');
    expect(b).toEqual(a);
    const c = newWeekly('2026-W47');
    expect(c.league.seed).not.toBe(a.league.seed);
    expect(weeklySetup('2026-W46')).toEqual(weeklySetup('2026-W46'));
  });

  it('is one region with a charter and two handicaps drawn for the week, and never the short season', () => {
    for (const key of ['2026-W01', '2026-W02', '2026-W03', '2026-W04', '2026-W05', '2026-W06']) {
      const f = newWeekly(key);
      expect(isWeekly(f)).toBe(true);
      expect(seasonRegions(f)).toBe(1);
      expect(f.season.phase).toBe('map');
      expect(f.season.charter).toBeDefined();
      expect(f.season.charter).not.toBe('short');
      expect(vowPoints(f.season.vows)).toBe(2);
    }
  });

  it('ends when its boss is beaten, with no playoffs', () => {
    const f = newWeekly('2026-W46');
    const boss = Object.values(f.season.map!.stops).find((s) => s.kind === 'boss')!;
    f.season.current = boss.id;
    f.season.stage = 'arrived';
    recordGame(f, result(true));
    while ((f.season.stage as string) === 'reward') pickArtifact(f, f.season.offer[0]!);
    if ((f.season.stage as string) === 'ringer') pickRinger(f, null);
    expect(weeklyOver(f)).toBe(true);
    expect(currentStop(f)).toBeNull();
    expect(weeklyResult(f)).toMatchObject({ week: '2026-W46', won: true, wins: 1, losses: 0 });
  });

  it('striking out ends it as a run that fell short', () => {
    const f = newWeekly('2026-W46');
    f.season.strikes = maxStrikes(f) - 1;
    toGame(f);
    recordGame(f, result(false));
    expect(weeklyOver(f)).toBe(true);
    expect(weeklyResult(f).won).toBe(false);
    expect(resultLine(weeklyResult(f))).toMatch(/^Fell short/);
  });

  it('a won run gives your franchise one Gold pack, once a week, and nothing else changes', () => {
    const main = fresh('main');
    const before = JSON.stringify({ ...main, packs: [], gearCount: 0, packsSinceLegendary: 0, weeklyClaimed: undefined });
    const win = { week: '2026-W46', won: true, wins: 4, losses: 1, strikes: 1 };
    expect(claimWeekly(main, { ...win, won: false })).toBe(false);
    expect(main.packs).toHaveLength(0);
    expect(claimWeekly(main, win)).toBe(true);
    expect(main.packs).toHaveLength(1);
    expect(main.packs[0]!.type).toBe('gold');
    expect(claimWeekly(main, win)).toBe(false);
    expect(main.packs).toHaveLength(1);
    expect(JSON.stringify({ ...main, packs: [], gearCount: 0, packsSinceLegendary: 0, weeklyClaimed: undefined })).toBe(before);
    // Next week it can be won again.
    expect(claimWeekly(main, { ...win, week: '2026-W47' })).toBe(true);
  });

  it('the best result for a week is kept: a win beats a loss, then fewer strikes', () => {
    const lost = { week: 'w', won: false, wins: 3, losses: 3, strikes: 3 };
    const won = { week: 'w', won: true, wins: 5, losses: 2, strikes: 2 };
    const clean = { week: 'w', won: true, wins: 5, losses: 0, strikes: 0 };
    expect(betterResult(null, lost)).toBe(lost);
    expect(betterResult(lost, won)).toBe(won);
    expect(betterResult(won, lost)).toBe(won);
    expect(betterResult(won, clean)).toBe(clean);
    expect(betterResult(clean, { ...lost, week: 'next' })).toMatchObject({ week: 'next' });
  });
});

describe('the town rallies after a season that ended early', () => {
  const after = (outcome: 'struckOut' | 'eliminated' | 'champion'): Franchise => {
    const f = fresh('rally');
    f.history = [{ season: 1, outcome, wins: 1, losses: 3 } as NonNullable<Franchise['history']>[number]];
    f.offseason.leagueMoved = true;
    return f;
  };

  it('is on offer only when the last season ended on strikes', () => {
    expect(rallyOffered(fresh('rally'))).toBe(false);
    expect(rallyOffered(after('struckOut'))).toBe(true);
    expect(rallyOffered(after('eliminated'))).toBe(false);
    expect(rallyOffered(after('champion'))).toBe(false);
  });

  it('taken, it is one more strike and one more powerup to start with; left, the season is the usual one', () => {
    const plain = after('struckOut');
    expect(startSeason(plain).ok).toBe(true);
    const helped = after('struckOut');
    expect(startSeason(helped, { rally: true }).ok).toBe(true);
    expect(helped.season.rally).toBe(true);
    expect(plain.season.rally).toBeUndefined();
    expect(maxStrikes(helped)).toBe(maxStrikes(plain) + 1);
    expect(helped.season.powerups.length).toBe(plain.season.powerups.length + 1);
  });

  it('cannot be taken when it is not on offer, and survives a save', () => {
    const f = after('champion');
    startSeason(f, { rally: true });
    expect(f.season.rally).toBeUndefined();
    const helped = after('struckOut');
    startSeason(helped, { rally: true });
    const loaded = fromSave(JSON.parse(JSON.stringify(toSave(helped, '2026-11-16'))));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const back = franchiseOf(loaded.save);
    expect(back.season.rally).toBe(true);
    expect(maxStrikes(back)).toBe(maxStrikes(helped));
    expect(rules.rally.modifiers.length).toBeGreaterThan(0);
  });
});

