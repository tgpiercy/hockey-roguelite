import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import {
  artifactInfo,
  bossLossEnds,
  buy,
  buySecondChance,
  buyShopArtifact,
  healPrice,
  insuranceLeft,
  matchup,
  newFranchise,
  recordGame,
  rerollPrice,
  rerollShop,
  scoutPrice,
  secondChancePrice,
  shopArtifact,
  shopArtifactPrice,
  shopPrice,
  startSeason,
  type Franchise,
} from '../src/core/season';
import powerups from '../src/data/powerups.json';
import rules from '../src/data/season.json';
import type { GameResult } from '../src/sim/match';

const started = (difficulty = 'pro', seed = 'shop'): Franchise => {
  const f = newFranchise(generateLeague(seed), difficulty);
  // Where these tests say "pro" they mean a season under the "One meeting" handicap: a boss loss ends it.
  startSeason(f, difficulty === 'rookie' ? {} : { vows: { oneMeeting: 1 } });
  return f;
};
/** Puts the franchise in a shop of the first region, with Pucks to spend. */
const inShop = (difficulty = 'pro', pucks = 1000): Franchise => {
  const f = started(difficulty);
  const shop = Object.values(f.season.map!.stops).find((s) => s.kind === 'shop' && s.region === 0)!;
  f.season.current = shop.id;
  f.season.stage = 'arrived';
  f.season.currency = pucks;
  return f;
};
const atBoss = (f: Franchise): void => {
  const boss = Object.values(f.season.map!.stops).find((s) => s.kind === 'boss' && s.region === 0)!;
  f.season.current = boss.id;
  f.season.stage = 'arrived';
};
const loss: GameResult = { score: [1, 3], winner: 1, finished: true, overtime: false, periods: 3, players: [], powerupsUsed: [] };

describe('what a shop charges', () => {
  it('a powerup costs 50 to 100; wiping a strike more than any powerup; the top shelf most of all', () => {
    const f = inShop();
    for (const p of powerups) {
      expect(p.price, p.id).toBeGreaterThanOrEqual(50);
      expect(p.price, p.id).toBeLessThanOrEqual(100);
      expect(shopPrice(f, p.id)).toBe(p.price);
    }
    const dearest = Math.max(...powerups.map((p) => p.price));
    expect(healPrice(f)).toBeGreaterThan(dearest);
    expect(secondChancePrice(f)).toBeGreaterThan(healPrice(f));
    expect(shopArtifactPrice(f)).toBeGreaterThan(secondChancePrice(f));
    expect(scoutPrice(f)).toBe(rules.scoutPrice);
  });

  it('an artifact that makes shops cheaper makes all of it cheaper', () => {
    const f = inShop();
    const before = [healPrice(f), secondChancePrice(f), shopArtifactPrice(f), rerollPrice(f)!];
    f.artifacts = ['friendly-vendor'];
    const after = [healPrice(f), secondChancePrice(f), shopArtifactPrice(f), rerollPrice(f)!];
    after.forEach((price, i) => expect(price).toBeLessThan(before[i]!));
  });
});

describe('the top shelf', () => {
  it('each shop has one artifact, the same every time you look, never one you hold, a recipe or a bargain', () => {
    const f = inShop();
    const id = shopArtifact(f);
    expect(id).not.toBeNull();
    expect(shopArtifact(f)).toBe(id);
    const info = artifactInfo(id as string);
    expect(info.recipe).toBeUndefined();
    expect(info.bargain).toBeUndefined();
    expect(f.artifacts).not.toContain(id);
    // The same season, the same shop, the same shelf.
    expect(shopArtifact(inShop())).toBe(id);
  });

  it('buying it takes the Pucks, gives the artifact and empties the shelf', () => {
    const f = inShop();
    const id = shopArtifact(f) as string;
    const price = shopArtifactPrice(f);
    const before = f.season.currency;
    expect(buyShopArtifact(f).ok).toBe(true);
    expect(f.season.currency).toBe(before - price);
    expect(f.artifacts).toContain(id);
    expect(shopArtifact(f)).toBeNull();
    expect(buyShopArtifact(f).ok).toBe(false);
  });

  it('is refused without the Pucks, and nothing changes', () => {
    const f = inShop('pro', 10);
    const out = buyShopArtifact(f);
    expect(out.ok).toBe(false);
    expect(f.season.currency).toBe(10);
    expect(f.artifacts).toEqual([]);
  });
});

describe('seeing what is in the back', () => {
  it('costs more each time in the same shop, then is no longer offered', () => {
    const f = inShop();
    const paid: number[] = [];
    for (let i = 0; i < rules.rerollPrices.length; i++) {
      const price = rerollPrice(f);
      expect(price).toBe(rules.rerollPrices[i]);
      const before = f.season.currency;
      expect(rerollShop(f).ok).toBe(true);
      paid.push(before - f.season.currency);
    }
    expect(paid).toEqual(rules.rerollPrices);
    expect(rerollPrice(f)).toBeNull();
    expect(rerollShop(f).ok).toBe(false);
  });

  it('brings new powerups and a new top shelf, and what is there can be bought', () => {
    const f = inShop();
    const stop = f.season.map!.stops[f.season.current!]!;
    const shelves = new Set<string | null>([shopArtifact(f)]);
    const stocks = new Set<string>([JSON.stringify(stop.stock)]);
    for (let i = 0; i < rules.rerollPrices.length; i++) {
      rerollShop(f);
      expect(stop.stock).toHaveLength(rules.shopItems);
      shelves.add(shopArtifact(f));
      stocks.add(JSON.stringify(stop.stock));
    }
    expect(stocks.size).toBeGreaterThan(1);
    expect(shelves.size).toBeGreaterThan(1);
    expect(buy(f, stop.stock![0]!).ok).toBe(true);
  });

  it('another shop starts at the first price again', () => {
    const f = inShop();
    rerollShop(f);
    const other = Object.values(f.season.map!.stops).find((s) => s.kind === 'shop' && s.id !== f.season.current)!;
    f.season.current = other.id;
    expect(rerollPrice(f)).toBe(rules.rerollPrices[0]);
  });
});

describe('insurance against a boss loss', () => {
  it('a second chance is sold only where a boss loss ends the season, and one at a time', () => {
    const rookie = inShop('rookie');
    expect(bossLossEnds(rookie)).toBe(false);
    expect(buySecondChance(rookie).ok).toBe(false);

    const f = inShop('pro');
    expect(insuranceLeft(f)).toBe(0);
    const before = f.season.currency;
    expect(buySecondChance(f).ok).toBe(true);
    expect(f.season.currency).toBe(before - secondChancePrice(f));
    expect(insuranceLeft(f)).toBe(1);
    expect(buySecondChance(f).ok).toBe(false);
  });

  it('insured, a boss loss is a strike and a rematch; the next one ends the season', () => {
    const f = inShop('pro');
    buySecondChance(f);
    atBoss(f);
    const first = recordGame(f, loss);
    expect(first.ok && first.message).toMatch(/insurance/);
    expect(f.season.phase).toBe('map');
    expect(f.season.strikes).toBe(1);
    expect(matchup(f)?.kind).toBe('boss');
    expect(insuranceLeft(f)).toBe(0);
    const second = recordGame(f, loss);
    expect(second.ok && second.message).toMatch(/season is over/);
    expect(f.season.phase).toBe('ended');
  });

  it('the Lucky horseshoe forgives one loss, once, and stacks with a second chance', () => {
    const f = started('pro');
    f.artifacts = ['lucky-horseshoe'];
    expect(insuranceLeft(f)).toBe(1);
    f.season.secondChance = true;
    expect(insuranceLeft(f)).toBe(2);
    atBoss(f);
    recordGame(f, loss);
    // The bought one goes first.
    expect(f.season.secondChance).toBeUndefined();
    expect(insuranceLeft(f)).toBe(1);
    recordGame(f, loss);
    expect(insuranceLeft(f)).toBe(0);
    expect(f.season.phase).toBe('map');
    recordGame(f, loss);
    expect(f.season.phase).toBe('ended');
  });

  it('insurance does not save a season that is out of strikes', () => {
    const f = started('pro');
    f.season.secondChance = true;
    f.season.strikes = rules.maxStrikes - 1;
    atBoss(f);
    recordGame(f, loss);
    expect(f.season.phase).toBe('ended');
  });

  it('on Rookie nothing changes: a boss loss is a strike and a rematch, and the horseshoe is not spent', () => {
    const f = started('rookie');
    f.artifacts = ['lucky-horseshoe'];
    atBoss(f);
    recordGame(f, loss);
    expect(f.season.phase).toBe('map');
    expect(f.season.insuranceSpent ?? 0).toBe(0);
  });
});
