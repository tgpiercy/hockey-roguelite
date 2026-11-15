import { describe, expect, it } from 'vitest';
import { generateLeague, generatePlayer } from '../src/core/generate';
import { teamOf, userTeam } from '../src/core/league';
import { dress } from '../src/core/matchup';
import { createNameMaker } from '../src/core/names';
import { alwaysOnModifiers, kindOf, kindsFor, rollKind, talentChance, talentInfo, talentOf } from '../src/core/playerKind';
import { createRng } from '../src/core/rng';
import data from '../src/data/playerKinds.json';
import talents from '../src/data/talents.json';
import { goalieEffects, skaterEffects } from '../src/sim/ratings';
import { shotSpeed } from '../src/sim/shot';
import { cloneTuning } from '../src/sim/tuning';

const even = { shooting: 70, passing: 70, speed: 70, checking: 70, puckControl: 70, stamina: 70 };

describe('what a rating point is worth', () => {
  const t = cloneTuning();
  const pct = (a: number, b: number): number => (b / a - 1) * 100;

  it('ten points of shooting is a few percent of shot speed, not one', () => {
    const at = (rating: number): number => shotSpeed(t.shot.chargeTime, skaterEffects({ ...even, shooting: rating }).shotPower, t);
    expect(pct(at(70), at(80))).toBeGreaterThan(2);
    expect(pct(at(70), at(80))).toBeLessThan(8);
  });

  it('ten points of speed is a couple of percent of skating', () => {
    const at = (rating: number): number => skaterEffects({ ...even, speed: rating }).topSpeedScale;
    expect(pct(at(70), at(80))).toBeGreaterThan(1.5);
    expect(pct(at(70), at(80))).toBeLessThan(5);
  });

  it('ten points of checking against even puck control moves the odds by several points', () => {
    const edge = skaterEffects({ ...even, checking: 80 }).checkStrength - skaterEffects(even).puckSecurity;
    expect(edge * t.check.ratingSwing * 100).toBeGreaterThan(2.5);
  });

  it('accuracy stays a share between 0 and 1 across every rating', () => {
    for (const rating of [30, 50, 70, 99]) {
      const a = skaterEffects({ ...even, shooting: rating }).accuracy;
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('a goalie with more stamina tires more slowly; 70 is the plain rate', () => {
    const g = (stamina: number): number => goalieEffects({ reflexes: 70, positioning: 70, reboundControl: 70, stamina }).drainScale;
    expect(g(70)).toBeCloseTo(1);
    expect(g(90)).toBeLessThan(g(70));
    expect(g(50)).toBeGreaterThan(g(70));
  });
});

describe('player kinds', () => {
  it('ratings decide the kind: the rating that stands out, or two-way when none does', () => {
    expect(kindOf('F', even).id).toBe('twoWay');
    expect(kindOf('F', { ...even, shooting: 88 }).id).toBe('sniper');
    expect(kindOf('F', { ...even, passing: 88 }).id).toBe('playmaker');
    expect(kindOf('D', { ...even, checking: 88 }).id).toBe('enforcer');
    expect(kindOf('F', { ...even, speed: 88 }).id).toBe('speedster');
    // Standing out by less than the threshold is not enough.
    expect(kindOf('F', { ...even, shooting: 70 + data.standout - 2 }).id).toBe('twoWay');
    // The furthest out wins.
    expect(kindOf('F', { ...even, shooting: 84, speed: 92 }).id).toBe('speedster');
    expect(kindOf('G', { reflexes: 84, positioning: 66, reboundControl: 72, stamina: 72 }).id).toBe('reflex');
    expect(kindOf('G', { reflexes: 70, positioning: 70, reboundControl: 70, stamina: 70 }).id).toBe('steady');
  });

  it('every kind names a rating its position has and a talent that exists', () => {
    for (const position of ['F', 'G'] as const) {
      for (const kind of kindsFor(position)) {
        if (kind.rating !== null) expect(Object.keys(position === 'G' ? { reflexes: 0, positioning: 0, reboundControl: 0, stamina: 0 } : even)).toContain(kind.rating);
        if (kind.talent !== null) expect(talents.talents.map((x) => x.id)).toContain(kind.talent);
        expect(kind.tag.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('a new player is made as some kind, and the league has every kind of skater', () => {
    const rng = createRng('kinds');
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rollKind(rng, 'F').id);
    expect([...seen].sort()).toEqual(kindsFor('F').map((k) => k.id).sort());

    const league = generateLeague('kinds');
    const kinds = new Set(Object.values(league.players).filter((p) => p.position !== 'G').map((p) => kindOf(p.position, p.ratings).id));
    expect(kinds.size).toBe(kindsFor('F').length);
  });

  it('a made sniper really does shoot well above his overall', () => {
    const rng = createRng('lean');
    const names = createNameMaker(rng.fork('names'));
    let snipers = 0;
    let gap = 0;
    for (let i = 0; i < 300; i++) {
      const p = generatePlayer(rng, names, `x-${i}`, 'F', 75);
      expect(Math.abs(p.overall - 75)).toBeLessThanOrEqual(1);
      if (kindOf('F', p.ratings).id !== 'sniper') continue;
      snipers++;
      gap += (p.ratings as typeof even).shooting - p.overall;
    }
    expect(snipers).toBeGreaterThan(30);
    expect(gap / snipers).toBeGreaterThan(8);
  });
});

describe('talents', () => {
  it('better players are likelier to have one, and the worst never do', () => {
    expect(talentChance('S')).toBeGreaterThan(talentChance('B'));
    expect(talentChance('B')).toBeGreaterThan(talentChance('C'));
    expect(talentChance('D')).toBe(0);
    const league = generateLeague('talents');
    const all = Object.values(league.players);
    const share = (min: number, max: number): number => {
      const group = all.filter((p) => p.overall >= min && p.overall <= max && p.position !== 'G');
      return group.filter((p) => p.talent).length / Math.max(1, group.length);
    };
    expect(share(78, 99)).toBeGreaterThan(share(30, 68));
    expect(all.filter((p) => p.position === 'G' && p.talent)).toEqual([]);
    for (const p of all) if (p.talent) expect(talentInfo(p.talent)).not.toBeNull();
  });

  it('a dressed team carries its players\' talents onto the ice', () => {
    const league = generateLeague('talents');
    const team = teamOf(league, 't-12');
    const dressed = dress(league, team)!;
    const skaters = dressed.players.filter((p) => p.position !== 'G');
    expect(skaters.some((p) => p.talent)).toBe(true);
    skaters.forEach((p, i) => {
      expect(dressed.setup.skaterTalents?.[i]).toEqual(p.talent ? [p.talent] : []);
      // One that is simply always on travels as his own modifiers.
      for (const m of alwaysOnModifiers(talentOf(p))) expect(dressed.setup.skaterModifiers?.[i]).toContainEqual(m);
    });
    expect(dress(league, userTeam(league))!.setup.skaterTalents?.length).toBe(6);
  });

  it('a player with no talent, or one that no longer exists, has none', () => {
    expect(talentOf({})).toBeNull();
    expect(talentOf({ talent: 'gone' })).toBeNull();
    expect(alwaysOnModifiers(null)).toEqual([]);
  });
});
