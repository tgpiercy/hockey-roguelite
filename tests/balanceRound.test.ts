import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { finishSeason } from '../src/core/offseason';
import { difficultyInfo, leftoverPack, newFranchise, setDifficulty, startSeason, type Franchise } from '../src/core/season';
import { newWeekly, weekKey } from '../src/core/weekly';
import { wordsFor } from '../src/game/floatWords';
import rules from '../src/data/season.json';
import { cloneTuning } from '../src/sim/tuning';
import { createWorld, oneTimerCrowd } from '../src/sim/world';
import { clearIce, ID, place, player } from './helpers';

const t = cloneTuning();

describe('a one-timer taken with a defender on the shooter strays', () => {
  const crowdAt = (metres: number | null): number => {
    const world = createWorld(t, 'crowd', { human: false });
    clearIce(world, metres === null ? [ID.home1] : [ID.home1, ID.away1]);
    place(world, ID.home1, 10, 0);
    if (metres !== null) place(world, ID.away1, 10 + metres, 0);
    return oneTimerCrowd(world, player(world, ID.home1), t);
  };

  it('nothing with nobody near, the most with a man right on him, and part-way between', () => {
    const most = (t.shot.oneTimerCrowdDegrees * Math.PI) / 180;
    expect(crowdAt(null)).toBe(0);
    expect(crowdAt(t.shot.oneTimerCrowdRange + 0.5)).toBe(0);
    expect(crowdAt(t.shot.oneTimerCrowdFull - 0.2)).toBeCloseTo(most);
    const between = crowdAt((t.shot.oneTimerCrowdRange + t.shot.oneTimerCrowdFull) / 2);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(most);
  });

  it('his own team-mates do not crowd him', () => {
    const world = createWorld(t, 'crowd-mate', { human: false });
    clearIce(world, [ID.home1, ID.home2]);
    place(world, ID.home1, 10, 0);
    place(world, ID.home2, 10.8, 0);
    expect(oneTimerCrowd(world, player(world, ID.home1), t)).toBe(0);
  });
});

describe('Rookie is eased after the first region', () => {
  it('only Rookie has later opponents play below their ratings, and none in the first region', () => {
    const rookie = difficultyInfo('rookie');
    expect(rookie.regionRating?.[0]).toBe(0);
    expect(rookie.regionRating?.[1]).toBeLessThan(0);
    expect(rookie.regionRating?.[2]).toBeLessThanOrEqual(rookie.regionRating?.[1] ?? 0);
    expect(rookie.playoffRating).toBeLessThan(0);
    for (const id of ['semipro', 'pro', 'allstar']) {
      expect(difficultyInfo(id).regionRating, id).toBeUndefined();
      expect(difficultyInfo(id).bossHeals, id).toBeUndefined();
    }
  });

  it('and says so in words, since every other setting changes only how opponents think', () => {
    expect(difficultyInfo('rookie').description).toMatch(/below their ratings/);
    expect(difficultyInfo('rookie').description).toMatch(/wipes every strike/);
    expect(difficultyInfo('rookie').bossHeals).toBeGreaterThan(rules.maxStrikes + (difficultyInfo('rookie').extraStrikes ?? 0) - 1);
  });
});

describe('Pucks at the start and at the end of a season', () => {
  const started = (): Franchise => {
    const f = newFranchise(generateLeague('pucks'));
    setDifficulty(f, 'pro');
    expect(startSeason(f).ok).toBe(true);
    return f;
  };

  it('a season starts with enough Pucks for the cheapest thing a shop sells, and no more than a win or two is worth', () => {
    const f = started();
    expect(f.season.currency).toBe(rules.startingCurrency);
    expect(rules.startingCurrency).toBeGreaterThan(0);
    expect(rules.startingCurrency).toBeLessThanOrEqual(rules.winCurrency * 4);
  });

  it('the Pucks left over are worth a pack, a better one for more of them, and nothing for a few', () => {
    const f = started();
    const tiers = [...rules.leftoverPacks].sort((a, b) => a.from - b.from);
    f.season.currency = tiers[0]!.from - 1;
    expect(leftoverPack(f)).toBeNull();
    f.season.currency = tiers[0]!.from;
    expect(leftoverPack(f)).toBe(tiers[0]!.pack);
    f.season.currency = tiers[tiers.length - 1]!.from + 50;
    expect(leftoverPack(f)).toBe(tiers[tiers.length - 1]!.pack);
  });

  it('the pack is given when the season is closed, and the report says so', () => {
    const f = started();
    f.season.currency = rules.leftoverPacks[0]!.from;
    f.season.phase = 'ended';
    f.season.outcome = 'struckOut';
    const before = f.packs.length;
    expect(finishSeason(f).ok).toBe(true);
    expect(f.packs.length).toBe(before + 1);
    expect(f.offseason?.report?.news.some((line) => /Pucks left over/.test(line))).toBe(true);
    expect(f.season.currency).toBe(0);
  });

  it('a weekly run turns no Pucks into packs', () => {
    const f = newWeekly(weekKey(2026, 11, 17));
    f.season.currency = 999;
    expect(leftoverPack(f)).toBeNull();
  });
});

describe('a hurried one-timer says so', () => {
  it('the word over the shooter is HURRIED, not ONE-TIMER, when the shot was marked', () => {
    expect(wordsFor([{ type: 'shot', speed: 30, player: 2, oneTimer: true }])[0]).toMatchObject({ kind: 'oneTimer', player: 2 });
    expect(wordsFor([{ type: 'shot', speed: 30, player: 2, oneTimer: true, hurried: true }])[0]).toMatchObject({ kind: 'hurried', player: 2 });
    expect(wordsFor([{ type: 'shot', speed: 30, player: 2 }])).toHaveLength(0);
  });
});

