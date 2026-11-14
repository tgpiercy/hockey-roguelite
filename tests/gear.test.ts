import { describe, expect, it } from 'vitest';
import {
  abilityModifiers,
  boostedRatings,
  boostPoints,
  equip,
  gearModifiers,
  generateItem,
  itemModifiers,
  itemName,
  itemSummary,
  levelCost,
  levelUp,
  perkInfo,
  playerGearModifiers,
  RARITIES,
  rarityInfo,
  releasePlayer,
  rollRarity,
  scrap,
  setCounts,
  unequip,
  wornBy,
  type GearItem,
  type RarityId,
} from '../src/core/gear';
import { generateLeague } from '../src/core/generate';
import { goaliesOn, playerOf, skatersOn, userTeam } from '../src/core/league';
import { MILESTONES } from '../src/core/milestones';
import { awardPack, openPack, packForWin, type Pack } from '../src/core/packs';
import { createRng } from '../src/core/rng';
import { franchiseOf, fromSave, parseSave, SAVE_VERSION, toSave } from '../src/core/save';
import {
  availableStops,
  currentStop,
  dressUser,
  endSeason,
  newFranchise,
  pickArtifact,
  recordGame,
  startSeason,
  travel,
  type Franchise,
} from '../src/core/season';
import gearData from '../src/data/gear.json';
import packData from '../src/data/packs.json';
import perks from '../src/data/perks.json';
import seasonRules from '../src/data/season.json';
import sets from '../src/data/sets.json';
import type { GameResult, PlayerLine } from '../src/sim/match';
import { defaultGoalieRatings, defaultSkaterRatings, goalieEffects, skaterEffects } from '../src/sim/ratings';

const fresh = (seed = 'gear-test'): Franchise => newFranchise(generateLeague(seed));
const rng = () => createRng('gear-rng');

/** A hand-made piece, for tests that need exact contents. */
const piece = (over: Partial<GearItem> = {}): GearItem => ({
  id: `t-${Math.round(Math.abs(Math.sin(JSON.stringify(over).length) * 1e6))}-${Object.keys(over).length}`,
  kind: 'skater',
  slot: 'stick',
  rarity: 'common',
  boosts: ['shooting'],
  perk: null,
  set: null,
  level: 1,
  wornBy: null,
  ...over,
});

const give = (f: Franchise, over: Partial<GearItem>, id: string): GearItem => {
  const item = piece({ ...over, id });
  f.gear.push(item);
  return item;
};

describe('generating gear', () => {
  const made = (rarity: RarityId, n = 400): GearItem[] => {
    const r = rng();
    return Array.from({ length: n }, (_, i) => generateItem(r, `x-${i}`, rarity));
  };

  it('each rarity has the number of boosts the design doc gives it', () => {
    expect(made('common').every((g) => g.boosts.length === 1)).toBe(true);
    expect(made('rare').every((g) => g.boosts.length === 2)).toBe(true);
    const epic = made('epic');
    expect(epic.every((g) => g.boosts.length === 2 || g.boosts.length === 3)).toBe(true);
    expect(new Set(epic.map((g) => g.boosts.length)).size).toBe(2);
    expect(made('legendary').every((g) => g.boosts.length === 3)).toBe(true);
  });

  it('only Epic and Legendary pieces have a perk, and the Legendary perk is the stronger one', () => {
    expect(made('common').every((g) => g.perk === null)).toBe(true);
    expect(made('rare').every((g) => g.perk === null)).toBe(true);
    expect(made('epic').every((g) => g.perk !== null)).toBe(true);
    expect(made('legendary').every((g) => g.perk !== null)).toBe(true);
    const epic = perkInfo(piece({ rarity: 'epic', perk: 'heavy-shot' }))!;
    const legendary = perkInfo(piece({ rarity: 'legendary', perk: 'heavy-shot' }))!;
    expect(legendary.modifiers[0]!.value).toBeGreaterThan(epic.modifiers[0]!.value);
  });

  it('a piece only boosts ratings its slot allows, never the same one twice, and fits its kind', () => {
    const slotRatings = gearData.slotRatings as Record<string, string[]>;
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
      for (const g of made(rarity)) {
        expect(gearData.slots[g.kind]).toContain(g.slot);
        for (const rating of g.boosts) expect(slotRatings[g.slot]).toContain(rating);
        expect(new Set(g.boosts).size).toBe(g.boosts.length);
        if (g.perk) expect(perks.find((p) => p.id === g.perk)?.kind).toBe(g.kind);
        if (g.set) expect(sets.find((s) => s.id === g.set)?.kind).toBe(g.kind);
        expect(g.level).toBe(1);
        expect(g.wornBy).toBe(null);
      }
    }
  });

  it('goalie pieces boost goalie ratings and skater pieces skater ratings', () => {
    const skaterRatings = Object.keys(defaultSkaterRatings);
    const goalieRatings = Object.keys(defaultGoalieRatings);
    const r = rng();
    for (let i = 0; i < 300; i++) {
      for (const rating of generateItem(r, 'g', 'legendary', 'goalie').boosts) expect(goalieRatings).toContain(rating);
      for (const rating of generateItem(r, 's', 'legendary', 'skater').boosts) expect(skaterRatings).toContain(rating);
    }
  });

  it('every slot can hold a Legendary: it lists at least three ratings', () => {
    for (const ratings of Object.values(gearData.slotRatings)) expect(ratings.length).toBeGreaterThanOrEqual(3);
  });

  it('about one piece in six is goalie gear', () => {
    const goalie = made('common', 6000).filter((g) => g.kind === 'goalie').length;
    expect(goalie / 6000).toBeGreaterThan(0.13);
    expect(goalie / 6000).toBeLessThan(0.2);
  });

  it('rarer and higher-level pieces give more points per boost', () => {
    expect(boostPoints(piece({ rarity: 'common' }))).toBe(2);
    expect(boostPoints(piece({ rarity: 'rare' }))).toBe(3);
    expect(boostPoints(piece({ rarity: 'epic' }))).toBe(4);
    expect(boostPoints(piece({ rarity: 'legendary' }))).toBe(5);
    expect(boostPoints(piece({ rarity: 'legendary', level: 5 }))).toBe(9);
  });

  it('names and describes a piece in words', () => {
    const item = piece({ rarity: 'epic', set: 'sniper', boosts: ['shooting', 'passing'], perk: 'heavy-shot', level: 2 });
    expect(itemName(item)).toBe('Epic Sniper stick');
    expect(itemSummary(item)).toBe('+5 Shooting, +5 Passing. Heavy shot: harder shots (level 2)');
  });
});

describe('the rarity table', () => {
  it('matches the design doc: 60, 28, 10 and 2 percent', () => {
    expect(RARITIES.map((r) => [r.id, r.chance])).toEqual([
      ['common', 0.6],
      ['rare', 0.28],
      ['epic', 0.1],
      ['legendary', 0.02],
    ]);
    expect(RARITIES.reduce((s, r) => s + r.chance, 0)).toBeCloseTo(1, 9);
  });

  it('a minimum rarity never rolls below it', () => {
    const r = rng();
    for (let i = 0; i < 3000; i++) {
      expect(rollRarity(r, 'rare')).not.toBe('common');
      expect(['epic', 'legendary']).toContain(rollRarity(r, 'epic'));
    }
  });
});

describe('100,000 packs', () => {
  const f = fresh('hundred-thousand');
  const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  // Only the slots with no guarantee are counted against the table.
  const free: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  let freeTotal = 0;
  let longestDrought = 0;
  let drought = 0;
  let guaranteesHeld = true;
  let goalie = 0;
  let total = 0;
  const order = ['common', 'rare', 'epic', 'legendary'];
  const types = ['bronze', 'silver', 'gold'] as const;

  for (let i = 0; i < 100_000; i++) {
    const type = types[i % 3]!;
    const pack = awardPack(f, type, 'test');
    f.packs.length = 0;
    const spec = packData.types[type];
    if (pack.items.length !== spec.items) guaranteesHeld = false;
    const best = Math.max(...pack.items.map((g) => order.indexOf(g.rarity)));
    if (spec.guarantee !== '' && best < order.indexOf(spec.guarantee)) guaranteesHeld = false;
    pack.items.forEach((g, slot) => {
      counts[g.rarity]! += 1;
      total += 1;
      if (g.kind === 'goalie') goalie += 1;
      if (slot > 0) {
        free[g.rarity]! += 1;
        freeTotal += 1;
      }
    });
    if (pack.items.some((g) => g.rarity === 'legendary')) drought = 0;
    else drought += 1;
    longestDrought = Math.max(longestDrought, drought);
  }

  it('slots with no guarantee come up at the table rates', () => {
    for (const r of RARITIES) {
      const observed = free[r.id]! / freeTotal;
      expect(Math.abs(observed - r.chance)).toBeLessThan(0.005);
    }
  });

  it('every Silver holds a Rare or better, every Gold an Epic or better, and every pack the right number of pieces', () => {
    expect(guaranteesHeld).toBe(true);
    // 33,334 Bronze of 3, 33,333 Silver of 4 and 33,333 Gold of 5.
    expect(total).toBe(33_334 * 3 + 33_333 * 4 + 33_333 * 5);
  });

  it('there are never 25 packs in a row without a Legendary', () => {
    expect(longestDrought).toBeLessThan(packData.pityPacks);
    expect(longestDrought).toBe(packData.pityPacks - 1);
    expect(counts.legendary).toBeGreaterThan(0);
  });

  it('about one piece in six is goalie gear', () => {
    expect(goalie / total).toBeGreaterThan(0.15);
    expect(goalie / total).toBeLessThan(0.18);
  });
});

describe('packs', () => {
  it('the pity timer: after 24 packs with no Legendary the next one has one, and the count starts again', () => {
    const f = fresh('pity');
    f.packsSinceLegendary = packData.pityPacks - 1;
    const pack = awardPack(f, 'bronze', 'test');
    expect(pack.items.some((g) => g.rarity === 'legendary')).toBe(true);
    expect(f.packsSinceLegendary).toBe(0);
    const next = awardPack(f, 'bronze', 'test');
    expect(f.packsSinceLegendary).toBe(next.items.some((g) => g.rarity === 'legendary') ? 0 : 1);
  });

  it('contents are fixed when the pack is awarded: same franchise, same pack; opening does not re-roll', () => {
    const a = fresh('fixed');
    const b = fresh('fixed');
    const packA = awardPack(a, 'gold', 'test');
    const packB = awardPack(b, 'gold', 'test');
    expect(packA).toEqual(packB);
    const snapshot: Pack = JSON.parse(JSON.stringify(packA));
    // Saving and loading in between changes nothing.
    const loaded = parseSave(JSON.stringify(toSave(a, 'now')));
    expect(loaded.ok && franchiseOf(loaded.save).packs[0]).toEqual(snapshot);
    expect(openPack(a, packA.id)).toEqual(snapshot.items);
    expect(a.packs).toEqual([]);
    expect(a.gear).toEqual(snapshot.items);
    expect(openPack(a, packA.id)).toBe(null);
  });

  it('successive packs differ, and every piece has its own id', () => {
    const f = fresh('ids');
    for (let i = 0; i < 50; i++) awardPack(f, 'gold', 'test');
    const ids = f.packs.flatMap((p) => p.items.map((g) => g.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(f.packs.map((p) => p.id)).size).toBe(50);
  });

  const result = (mine: number, theirs: number, finished = true): GameResult => ({
    score: [mine, theirs],
    winner: mine > theirs ? 0 : 1,
    finished,
    overtime: false,
    periods: 3,
    players: [],
    powerupsUsed: [],
  });

  it('a plain win earns Bronze; a shutout, a 4-goal win or a boss win earns Silver; a loss earns nothing', () => {
    expect(packForWin(result(3, 2), false)).toBe('bronze');
    expect(packForWin(result(4, 1), false)).toBe('bronze');
    expect(packForWin(result(2, 0), false)).toBe('silver');
    expect(packForWin(result(5, 1), false)).toBe('silver');
    expect(packForWin(result(3, 2), true)).toBe('silver');
    expect(packForWin(result(1, 3), false)).toBe(null);
    expect(packForWin(result(1, 3), true)).toBe(null);
    expect(packForWin(result(3, 2, false), false)).toBe(null);
  });
});

describe('sets', () => {
  const sniper = (slot: string): GearItem => piece({ set: 'sniper', slot, boosts: [], id: `sn-${slot}` });
  const has = (items: GearItem[], stat: string): boolean => gearModifiers(items).some((m) => m.stat === stat);

  it('the 2-piece bonus switches on at exactly 2 pieces and the 4-piece bonus at exactly 4', () => {
    const slots = ['stick', 'skates', 'gloves', 'helmet'];
    const worn = slots.map(sniper);
    expect(has(worn.slice(0, 1), 'shotPower')).toBe(false);
    expect(has(worn.slice(0, 2), 'shotPower')).toBe(true);
    expect(has(worn.slice(0, 3), 'chargedShotScale')).toBe(false);
    expect(has(worn.slice(0, 4), 'chargedShotScale')).toBe(true);
    expect(has(worn.slice(0, 4), 'shotPower')).toBe(true);
    expect(setCounts(worn)).toEqual({ sniper: 4 });
  });

  it('the goalie set reaches its top bonus at 3 pieces, since goalies have 3 slots', () => {
    const wall = ['mask', 'legPads', 'blocker'].map((slot) => piece({ kind: 'goalie', set: 'brick-wall', slot, boosts: [], id: `bw-${slot}` }));
    expect(has(wall.slice(0, 1), 'rating.reflexes')).toBe(false);
    expect(has(wall.slice(0, 2), 'rating.reflexes')).toBe(true);
    expect(has(wall.slice(0, 2), 'periodAutoSaves')).toBe(false);
    expect(has(wall, 'periodAutoSaves')).toBe(true);
    expect(gearData.slots.goalie).toHaveLength(3);
  });

  it('pieces of different sets do not add up together', () => {
    const mixed = [sniper('stick'), piece({ set: 'burner', slot: 'skates', boosts: [], id: 'b1' })];
    expect(gearModifiers(mixed)).toEqual([]);
  });

  it('every set and perk in the data changes a stat that something reads', () => {
    const known = new Set([
      ...Object.keys(skaterEffects(defaultSkaterRatings)),
      ...Object.keys(goalieEffects(defaultGoalieRatings)),
      ...Object.keys(defaultSkaterRatings).map((r) => `rating.${r}`),
      ...Object.keys(defaultGoalieRatings).map((r) => `rating.${r}`),
    ]);
    for (const set of sets) {
      expect(set.bonuses.map((b) => b.pieces)).toEqual(set.kind === 'goalie' ? [2, 3] : [2, 4]);
      for (const bonus of set.bonuses) for (const m of bonus.modifiers) expect(known.has(m.stat)).toBe(true);
    }
    for (const perk of perks) for (const tier of [perk.epic, perk.legendary]) for (const m of tier.modifiers) expect(known.has(m.stat)).toBe(true);
    expect(sets.map((s) => s.name).sort()).toEqual(['Brick Wall', 'Burner', 'Enforcer', 'Playmaker', 'Sniper']);
  });
});

describe('equipping', () => {
  const setUp = () => {
    const f = fresh();
    const team = userTeam(f.league);
    const skaters = skatersOn(f.league, team);
    const goalie = goaliesOn(f.league, team)[0]!;
    return { f, skater: skaters[0]!, other: skaters[1]!, goalie };
  };

  it('one piece per slot: equipping over a piece sends the old one back to the inventory', () => {
    const { f, skater } = setUp();
    const first = give(f, { slot: 'stick' }, 'a');
    const second = give(f, { slot: 'stick', rarity: 'rare', boosts: ['shooting', 'passing'] }, 'b');
    const skates = give(f, { slot: 'skates', boosts: ['speed'] }, 'c');
    expect(equip(f, first.id, skater.id).ok).toBe(true);
    expect(equip(f, skates.id, skater.id).ok).toBe(true);
    expect(equip(f, second.id, skater.id).ok).toBe(true);
    expect(first.wornBy).toBe(null);
    expect(wornBy(f, skater.id).map((g) => g.id).sort()).toEqual(['b', 'c']);
  });

  it('a piece worn by one player moves when it is put on another', () => {
    const { f, skater, other } = setUp();
    const stick = give(f, { slot: 'stick' }, 'a');
    equip(f, stick.id, skater.id);
    equip(f, stick.id, other.id);
    expect(wornBy(f, skater.id)).toEqual([]);
    expect(wornBy(f, other.id)).toEqual([stick]);
  });

  it('skater gear does not fit a goalie, nor goalie gear a skater, nor anything a player on another team', () => {
    const { f, skater, goalie } = setUp();
    const stick = give(f, { slot: 'stick' }, 'a');
    const mask = give(f, { kind: 'goalie', slot: 'mask', boosts: ['reflexes'] }, 'm');
    expect(equip(f, stick.id, goalie.id).ok).toBe(false);
    expect(equip(f, mask.id, skater.id).ok).toBe(false);
    expect(equip(f, mask.id, goalie.id).ok).toBe(true);
    expect(equip(f, stick.id, f.league.teams[3]!.roster[0]!).ok).toBe(false);
    expect(equip(f, 'nope', skater.id).ok).toBe(false);
  });

  it('gear raises the ratings the simulation gets, and never the grade or cap hit', () => {
    const { f, skater } = setUp();
    const record = { ...playerOf(f.league, skater.id) };
    const before = dressUser(f)!;
    const index = before.players.findIndex((p) => p.id === skater.id);
    const stick = give(f, { slot: 'stick', rarity: 'epic', boosts: ['shooting', 'passing'] }, 'a');
    equip(f, stick.id, skater.id);
    const after = dressUser(f)!;
    expect(after.setup.skaters[index]!.shooting).toBe(before.setup.skaters[index]!.shooting + 4);
    expect(after.setup.skaters[index]!.passing).toBe(before.setup.skaters[index]!.passing + 4);
    expect(after.setup.skaters[index]!.speed).toBe(before.setup.skaters[index]!.speed);
    const stored = playerOf(f.league, skater.id);
    expect({ overall: stored.overall, grade: stored.grade, capHit: stored.capHit, ratings: stored.ratings }).toEqual({
      overall: record.overall,
      grade: record.grade,
      capHit: record.capHit,
      ratings: record.ratings,
    });
  });

  it('a levelled piece raises them more, and boosts stop at the top of the scale', () => {
    const { f, skater } = setUp();
    const stick = give(f, { slot: 'stick', boosts: ['shooting'], level: 4 }, 'a');
    equip(f, stick.id, skater.id);
    const base = (playerOf(f.league, skater.id).ratings as { shooting: number }).shooting;
    const index = dressUser(f)!.players.findIndex((p) => p.id === skater.id);
    expect(dressUser(f)!.setup.skaters[index]!.shooting).toBe(base + 5);
    expect(boostedRatings({ ...defaultSkaterRatings, shooting: 98 }, itemModifiers(stick)).shooting).toBe(gearData.maxRating);
  });

  it('perks and set bonuses reach the ice as that player\'s own modifiers, and nobody else\'s', () => {
    const { f, skater } = setUp();
    const perk = give(f, { slot: 'skates', rarity: 'epic', boosts: ['speed', 'stamina'], perk: 'quick-feet' }, 'p');
    equip(f, perk.id, skater.id);
    const dressed = dressUser(f)!;
    const index = dressed.players.findIndex((p) => p.id === skater.id);
    expect(dressed.setup.skaterModifiers![index]).toEqual([{ stat: 'accelerationScale', op: 'mul', value: 1.04 }]);
    expect(dressed.setup.skaterModifiers!.filter((m) => m.length > 0)).toHaveLength(1);
    expect(dressed.setup.goalieModifiers).toEqual([]);
    expect(abilityModifiers(playerGearModifiers(f, skater.id))).toEqual(dressed.setup.skaterModifiers![index]);
  });

  it('taking a piece off removes its effect', () => {
    const { f, skater } = setUp();
    const stick = give(f, { slot: 'stick' }, 'a');
    equip(f, stick.id, skater.id);
    expect(playerGearModifiers(f, skater.id)).toHaveLength(1);
    expect(unequip(f, stick.id).ok).toBe(true);
    expect(playerGearModifiers(f, skater.id)).toEqual([]);
  });

  it('releasing a player sends all his gear back to the inventory', () => {
    const { f, skater } = setUp();
    const stick = give(f, { slot: 'stick' }, 'a');
    const skates = give(f, { slot: 'skates', boosts: ['speed'] }, 'b');
    equip(f, stick.id, skater.id);
    equip(f, skates.id, skater.id);
    expect(releasePlayer(f, skater.id).ok).toBe(true);
    expect(f.gear).toHaveLength(2);
    expect(f.gear.every((g) => g.wornBy === null)).toBe(true);
    expect(userTeam(f.league).roster).not.toContain(skater.id);
  });
});

describe('tape', () => {
  it('scrapping pays by rarity, and a worn piece cannot be scrapped', () => {
    const f = fresh();
    const skater = skatersOn(f.league, userTeam(f.league))[0]!;
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) give(f, { rarity }, rarity);
    equip(f, 'common', skater.id);
    expect(scrap(f, 'common').ok).toBe(false);
    unequip(f, 'common');
    let expected = 0;
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
      expect(scrap(f, rarity).ok).toBe(true);
      expected += rarityInfo(rarity).scrap;
      expect(f.tape).toBe(expected);
    }
    expect(f.gear).toEqual([]);
    expect(scrap(f, 'common').ok).toBe(false);
    expect(rarityInfo('legendary').scrap).toBeGreaterThan(rarityInfo('epic').scrap);
  });

  it('levelling costs tape, is refused without enough, and stops at level 5', () => {
    const f = fresh();
    const item = give(f, { rarity: 'rare', boosts: ['shooting', 'passing'] }, 'a');
    const first = levelCost(item)!;
    f.tape = first - 1;
    expect(levelUp(f, 'a').ok).toBe(false);
    expect(item.level).toBe(1);
    f.tape = 10_000;
    for (let level = 2; level <= gearData.maxLevel; level++) {
      const cost = levelCost(item)!;
      const before = f.tape;
      expect(levelUp(f, 'a').ok).toBe(true);
      expect(item.level).toBe(level);
      expect(f.tape).toBe(before - cost);
    }
    expect(levelCost(item)).toBe(null);
    expect(levelUp(f, 'a').ok).toBe(false);
    expect(boostPoints(item)).toBe(3 + 4);
  });
});

describe('packs and milestones in a season', () => {
  const line = (index: number, goals: number): PlayerLine => ({
    id: index,
    team: 0,
    role: index === 6 ? 'goalie' : 'skater',
    line: index >= 3 && index < 6 ? 1 : 0,
    slot: index === 6 ? 0 : index % 3,
    goals,
    assists: 0,
    shots: 0,
    hits: 0,
    blocks: 0,
    timeOnIce: 0,
    saves: 0,
    goalsAgainst: 0,
  });
  const game = (mine: number, theirs: number, scorers: [number, number][] = []): GameResult => ({
    score: [mine, theirs],
    winner: mine > theirs ? 0 : 1,
    finished: true,
    overtime: false,
    periods: 3,
    players: scorers.map(([index, goals]) => line(index, goals)),
    powerupsUsed: [],
  });
  const started = (seed = 'gear-season'): Franchise => {
    const f = fresh(seed);
    startSeason(f);
    return f;
  };
  const toGame = (f: Franchise): void => {
    for (let guard = 0; guard < 30; guard++) {
      const stop = currentStop(f);
      if (stop && (stop.kind === 'game' || stop.kind === 'boss') && f.season.stage === 'arrived') return;
      if (f.season.stage === 'reward') pickArtifact(f, f.season.offer[0]!);
      else if (!stop) {
        const options = availableStops(f);
        travel(f, (options.find((s) => s.kind === 'game' || s.kind === 'boss') ?? options[0]!).id);
      } else if (stop.kind === 'training') f.season.current && (f.season.bumps.x = 0, (f.season.current = null), (f.season.last = stop.id), (f.season.stage = 'none'));
      else {
        f.season.last = stop.id;
        f.season.current = null;
        f.season.stage = 'none';
      }
    }
  };
  const play = (f: Franchise, result: GameResult) => {
    if (f.season.phase === 'map') toGame(f);
    return recordGame(f, result);
  };

  it('a season win awards a Bronze pack, a shutout a Silver, a loss nothing', () => {
    const f = started();
    const win = play(f, game(3, 2));
    expect(win.ok && win.message).toMatch(/Bronze pack/);
    expect(f.packs.map((p) => p.type)).toEqual(['bronze']);
    play(f, game(2, 0));
    expect(f.packs.map((p) => p.type)).toEqual(['bronze', 'silver']);
    play(f, game(1, 4));
    expect(f.packs).toHaveLength(2);
    expect(f.packs[0]!.items).toHaveLength(3);
    expect(f.packs[1]!.items).toHaveLength(4);
  });

  it('a hat trick is a milestone and earns a Gold pack, once', () => {
    const f = started();
    const outcome = play(f, game(4, 3, [[0, 3], [1, 1]]));
    expect(outcome.ok && outcome.message).toMatch(/hat trick/i);
    expect(f.season.milestones).toContain('hat-trick');
    expect(f.packs.map((p) => p.type)).toEqual(['bronze', 'gold']);
    expect(f.packs[1]!.items).toHaveLength(5);
    play(f, game(4, 3, [[2, 3]]));
    expect(f.packs.filter((p) => p.type === 'gold')).toHaveLength(1);
  });

  it('goals are counted for the right player, by his place in the dressed lineup', () => {
    const f = started();
    const team = userTeam(f.league);
    play(f, game(3, 2, [[0, 2], [4, 1]]));
    expect(f.season.playerGoals[team.lineup.line1[0]!]).toBe(2);
    expect(f.season.playerGoals[team.lineup.line2[1]!]).toBe(1);
  });

  it('a 12-goal player and 3 shutouts are reached by adding up across games', () => {
    const f = started();
    for (let i = 0; i < 3; i++) {
      expect(f.season.milestones).not.toContain('shutouts-3');
      play(f, game(2, 0, [[1, 2]]));
    }
    expect(f.season.milestones).toContain('shutouts-3');
    expect(f.season.milestones).not.toContain('goals-12');
    for (let i = 0; i < 3; i++) play(f, game(2, 1, [[1, 2]]));
    expect(f.season.milestones).toContain('goals-12');
  });

  it('4, 8 and 12 wins, the playoffs and the championship each fire once, at the right moment', () => {
    const f = started();
    const golds = (): number => f.gearCount && f.season.milestones.length;
    for (let wins = 1; wins <= 9; wins++) {
      play(f, game(2, 1));
      if (f.season.stage === 'reward') pickArtifact(f, f.season.offer[0]!);
      expect(f.season.milestones.includes('wins-4')).toBe(wins >= 4);
      expect(f.season.milestones.includes('wins-8')).toBe(wins >= 8);
    }
    expect(f.season.phase).toBe('playoffs');
    expect(f.season.milestones).toContain('playoffs');
    expect(f.season.milestones).not.toContain('wins-12');
    for (let i = 0; i < 4; i++) play(f, game(2, 1));
    expect(f.season.outcome).toBe('champion');
    expect(f.season.milestones).toContain('wins-12');
    expect(f.season.milestones).toContain('champion');
    expect(new Set(f.season.milestones).size).toBe(f.season.milestones.length);
    expect(golds()).toBe(f.season.milestones.length);
    expect(f.packs.filter((p) => p.type === 'gold')).toHaveLength(f.season.milestones.length);
  });

  it('milestones start again next season; gear, packs and tape are kept', () => {
    const f = started();
    play(f, game(4, 3, [[0, 3]]));
    f.tape = 77;
    const packs = f.packs.length;
    openPack(f, f.packs[0]!.id);
    const gear = f.gear.length;
    f.season.phase = 'ended';
    endSeason(f);
    expect(f.season.milestones).toEqual([]);
    expect(f.season.hatTrick).toBe(false);
    expect(f.packs).toHaveLength(packs - 1);
    expect(f.gear).toHaveLength(gear);
    expect(f.tape).toBe(77);
  });

  it('the milestone list is the one agreed', () => {
    expect(MILESTONES.map((m) => [m.id, m.target])).toEqual([
      ['wins-4', 4],
      ['wins-8', 8],
      ['wins-12', 12],
      ['playoffs', 1],
      ['champion', 1],
      ['goals-12', 12],
      ['shutouts-3', 3],
      ['hat-trick', 3],
    ]);
    expect(seasonRules.regions * 3).toBe(9);
  });
});

describe('saving gear', () => {
  it('a Phase 5 save (version 2) is brought up to date with empty gear, and keeps its place in the season', () => {
    const f = fresh('old');
    startSeason(f);
    travel(f, availableStops(f)[0]!.id);
    const { gear: _g, packs: _p, tape: _t, packsSinceLegendary: _s, gearCount: _c, prestige: _pr, offseason: _of, ...older } = f;
    const { milestones: _m, playerGoals: _pg, shutouts: _sh, hatTrick: _h, xp: _x, ...oldSeason } = older.season;
    const old = JSON.parse(JSON.stringify({ schemaVersion: 2, savedAt: 'then', ...older, season: oldSeason }));
    const loaded = fromSave(old);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const back = franchiseOf(loaded.save);
    expect(loaded.save.schemaVersion).toBe(SAVE_VERSION);
    expect(back.gear).toEqual([]);
    expect(back.packs).toEqual([]);
    expect(back.tape).toBe(0);
    expect(back.season.current).toBe(f.season.current);
    expect(back.season.milestones).toEqual([]);
    expect(back.season.playerGoals).toEqual({});
  });

  it('a save with gear, packs and tape round-trips unchanged', () => {
    const f = fresh('round');
    awardPack(f, 'gold', 'test');
    awardPack(f, 'bronze', 'test');
    openPack(f, f.packs[0]!.id);
    equip(f, f.gear.find((g) => g.kind === 'skater')!.id, skatersOn(f.league, userTeam(f.league))[0]!.id);
    f.tape = 42;
    const loaded = parseSave(JSON.stringify(toSave(f, 'now')));
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && franchiseOf(loaded.save)).toEqual(f);
  });

  it('a save missing its gear list is refused as damaged', () => {
    const save = JSON.parse(JSON.stringify(toSave(fresh(), 'now')));
    delete save.gear;
    expect(fromSave(save).ok).toBe(false);
  });
});
