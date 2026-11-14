import { describe, expect, it } from 'vitest';
import { gameResult } from '../src/sim/match';
import { applyModifiers, modified, type Modifier, type PowerupSpec } from '../src/sim/modifiers';
import { usePowerup } from '../src/sim/powerups';
import { defaultGoalieRatings, defaultSkaterRatings, skaterEffects } from '../src/sim/ratings';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type World } from '../src/sim/types';
import { createGame, createWorld, step, STEPS_PER_SECOND, type TeamSetup } from '../src/sim/world';
import { ID, place, player } from './helpers';

const t = cloneTuning();
const plain = (modifiers: Modifier[] = []): TeamSetup => ({
  skaters: Array.from({ length: 6 }, () => ({ ...defaultSkaterRatings })),
  goalie: { ...defaultGoalieRatings },
  modifiers,
});

describe('modifier arithmetic', () => {
  it('adds, then multiplies', () => {
    const mods: Modifier[] = [
      { stat: 'x', op: 'mul', value: 2 },
      { stat: 'x', op: 'add', value: 3 },
      { stat: 'x', op: 'add', value: 1 },
      { stat: 'y', op: 'mul', value: 10 },
    ];
    expect(modified(1, 'x', mods)).toBe((1 + 3 + 1) * 2);
    expect(modified(1, 'y', mods)).toBe(10);
    expect(modified(7, 'z', mods)).toBe(7);
  });

  it('changes only the stats that are named, and leaves the original alone', () => {
    const base = skaterEffects(defaultSkaterRatings);
    const out = applyModifiers(base, [
      { stat: 'topSpeedScale', op: 'mul', value: 1.1 },
      { stat: 'shotPower', op: 'add', value: 0.2 },
      { stat: 'reactionSeconds', op: 'mul', value: 0.5 },
      { stat: 'currencyGain', op: 'mul', value: 1.25 },
    ]);
    expect(out.topSpeedScale).toBeCloseTo(base.topSpeedScale * 1.1);
    expect(out.shotPower).toBeCloseTo(base.shotPower + 0.2);
    expect(out.accuracy).toBe(base.accuracy);
    expect(base.topSpeedScale).toBeCloseTo(1);
    expect(out).not.toHaveProperty('reactionSeconds');
    expect(out).not.toHaveProperty('currencyGain');
  });

  it('with no modifiers, hands back the same object', () => {
    const base = skaterEffects(defaultSkaterRatings);
    expect(applyModifiers(base, [])).toBe(base);
  });
});

describe('lasting team modifiers', () => {
  it('apply to that team only: skater stats to skaters, goalie stats to the goalie', () => {
    const world = createWorld(t, 'mods', {
      human: false,
      teams: [
        plain([
          { stat: 'topSpeedScale', op: 'mul', value: 1.2 },
          { stat: 'coverRadius', op: 'mul', value: 1.5 },
        ]),
        plain(),
      ],
    });
    const mine = player(world, ID.home1);
    const theirs = player(world, ID.away1);
    expect(mine.fx.topSpeedScale).toBeCloseTo(theirs.fx.topSpeedScale * 1.2);
    expect(player(world, ID.homeGoalie).goalie!.fx.coverRadius).toBeCloseTo(player(world, ID.awayGoalie).goalie!.fx.coverRadius * 1.5);
    // Bench players get them too.
    expect(player(world, 4).fx.topSpeedScale).toBeCloseTo(mine.fx.topSpeedScale);
  });

  it('a speed modifier really makes the skater faster on the ice', () => {
    const topSpeed = (modifiers: Modifier[]): number => {
      const world = createWorld(t, 'fast', { teams: [plain(modifiers), plain()] });
      for (const p of world.players) if (p.role === 'skater' && p.id !== ID.home1) p.stagger = 999;
      const p = place(world, ID.home1, -20, 6);
      world.puck.pos = { x: 20, y: -10 };
      let best = 0;
      for (let i = 0; i < 2 * STEPS_PER_SECOND; i++) {
        step(world, { ...NO_INPUT, moveX: 1 }, t);
        best = Math.max(best, Math.hypot(p.vel.x, p.vel.y));
      }
      return best;
    };
    expect(topSpeed([{ stat: 'topSpeedScale', op: 'mul', value: 1.2 }])).toBeCloseTo(topSpeed([]) * 1.2, 1);
  });
});

describe('powerups', () => {
  const burst: PowerupSpec = { id: 'burst', name: 'Speed burst', seconds: 2, modifiers: [{ stat: 'topSpeedScale', op: 'mul', value: 1.3 }] };
  const wall: PowerupSpec = { id: 'wall', name: 'Wall', seconds: 5, modifiers: [{ stat: 'coverRadius', op: 'mul', value: 1.5 }] };
  const wind: PowerupSpec = { id: 'wind', name: 'Second wind', effect: 'restoreLineEnergy' };
  const legs: PowerupSpec = { id: 'legs', name: 'Fresh legs', effect: 'restoreBenchEnergy' };

  /** A game already in play, with the given powerups loaded for the human. */
  const inPlay = (powerups: (PowerupSpec | null)[]): World => {
    const world = createGame(t, 'powerups', { powerups });
    world.phase = 'play';
    world.faceoff = null;
    for (const p of world.players) if (p.role === 'skater') p.stagger = 9999;
    return world;
  };
  const seconds = (world: World, s: number, input = NO_INPUT) => {
    const events = [];
    for (let i = 0; i < Math.round(s * STEPS_PER_SECOND); i++) events.push(...step(world, input, t));
    return events;
  };

  it('pressing the button starts the boost for the whole team, and uses the powerup up', () => {
    const world = inPlay([burst, null]);
    const before = player(world, ID.home1).fx.topSpeedScale;
    const events = seconds(world, 1 / STEPS_PER_SECOND, { ...NO_INPUT, powerupA: true });
    expect(events).toContainEqual({ type: 'powerup', team: 0, slot: 0, id: 'burst' });
    expect(player(world, ID.home1).fx.topSpeedScale).toBeCloseTo(before * 1.3);
    expect(player(world, 4).fx.topSpeedScale).toBeCloseTo(before * 1.3);
    expect(player(world, ID.away1).fx.topSpeedScale).toBeCloseTo(before);
    expect(world.teams[0].powerups).toEqual([null, null]);
    expect(world.teams[0].boosts).toHaveLength(1);
  });

  it('the boost runs out on the game clock and abilities go back to normal', () => {
    const world = inPlay([burst, null]);
    const before = player(world, ID.home1).fx.topSpeedScale;
    seconds(world, 1 / STEPS_PER_SECOND, { ...NO_INPUT, powerupA: true });
    seconds(world, 1.5);
    expect(world.teams[0].boosts[0]!.secondsLeft).toBeCloseTo(0.5, 1);
    expect(player(world, ID.home1).fx.topSpeedScale).toBeCloseTo(before * 1.3);
    seconds(world, 0.6);
    expect(world.teams[0].boosts).toEqual([]);
    expect(player(world, ID.home1).fx.topSpeedScale).toBeCloseTo(before);
  });

  it('holding the button does not fire twice, and an empty slot does nothing', () => {
    const world = inPlay([burst, null]);
    const events = seconds(world, 0.5, { ...NO_INPUT, powerupA: true, powerupB: true });
    expect(events.filter((e) => e.type === 'powerup')).toHaveLength(1);
    expect(world.teams[0].powerupsUsed).toEqual(['burst']);
  });

  it('two boosts stack and end separately; a goalie boost reaches the goalie', () => {
    const world = inPlay([burst, wall]);
    const cover = player(world, ID.homeGoalie).goalie!.fx.coverRadius;
    seconds(world, 1 / STEPS_PER_SECOND, { ...NO_INPUT, powerupA: true, powerupB: true });
    expect(world.teams[0].boosts).toHaveLength(2);
    expect(player(world, ID.homeGoalie).goalie!.fx.coverRadius).toBeCloseTo(cover * 1.5);
    seconds(world, 2.5);
    expect(world.teams[0].boosts.map((b) => b.id)).toEqual(['wall']);
    expect(player(world, ID.homeGoalie).goalie!.fx.coverRadius).toBeCloseTo(cover * 1.5);
    seconds(world, 3);
    expect(player(world, ID.homeGoalie).goalie!.fx.coverRadius).toBeCloseTo(cover);
  });

  it('an instant powerup refills the energy of the line on the ice, or of the bench', () => {
    const world = inPlay([wind, legs]);
    for (const p of world.players) if (p.team === 0 && p.role === 'skater') p.energy = 0.2;
    usePowerup(world, 0, 0, []);
    expect(player(world, ID.home1).energy).toBe(1);
    expect(player(world, 4).energy).toBe(0.2);
    usePowerup(world, 0, 1, []);
    expect(player(world, 4).energy).toBe(1);
    expect(world.teams[0].boosts).toEqual([]);
  });

  it('boosts do not count down while play is stopped', () => {
    const world = inPlay([burst, null]);
    seconds(world, 1 / STEPS_PER_SECOND, { ...NO_INPUT, powerupA: true });
    world.phase = 'break';
    world.phaseTime = 1;
    seconds(world, 0.5);
    expect(world.teams[0].boosts[0]!.secondsLeft).toBeCloseTo(2 - 1 / STEPS_PER_SECOND, 2);
  });

  it('the game result lists the powerups that were used; unused ones are not listed', () => {
    const world = inPlay([burst, wall]);
    seconds(world, 1 / STEPS_PER_SECOND, { ...NO_INPUT, powerupB: true });
    expect(gameResult(world).powerupsUsed).toEqual(['wall']);
  });

  it('an all-AI game has no powerups', () => {
    const world = createGame(t, 'ai-only', { human: false, powerups: [burst, wall] });
    expect(world.teams[0].powerups).toEqual([null, null]);
  });
});
