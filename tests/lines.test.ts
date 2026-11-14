import { describe, expect, it } from 'vitest';
import { updateControl } from '../src/sim/control';
import { autoChange, benchDoor, callChange, changing, currentFx, energyScale, goalieReaction, lineEnergy, stepChanges, stepEnergy } from '../src/sim/lines';
import { skaterEffects, type SkaterRatings } from '../src/sim/ratings';
import { skatersOf } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createGame, step, STEPS_PER_SECOND } from '../src/sim/world';
import { giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const LINE2 = { home1: 3, home2: 4, home3: 5 } as const;

/** A game that is already in play: faceoff over, puck loose at centre. */
const inPlay = (seed: string, human = false): World => {
  const world = createGame(t, seed, human ? { levels: [0.5, 0.5] } : { human: false, levels: [0.5, 0.5] });
  world.phase = 'play';
  world.faceoff = null;
  return world;
};

const seconds = (world: World, s: number, each?: () => void): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(s * STEPS_PER_SECOND); i++) {
    each?.();
    events.push(...step(world, NO_INPUT, t));
  }
  return events;
};

describe('lineup', () => {
  it('dresses two lines of three and a goalie per team, with line 1 on the ice', () => {
    const world = inPlay('lineup');
    expect(world.players).toHaveLength(14);
    for (const team of [0, 1] as const) {
      const mine = world.players.filter((p) => p.team === team);
      expect(mine.filter((p) => p.role === 'skater')).toHaveLength(6);
      expect(mine.filter((p) => p.role === 'goalie')).toHaveLength(1);
      expect(skatersOf(world, team).map((p) => [p.line, p.slot])).toEqual([[0, 0], [0, 1], [0, 2]]);
    }
  });
});

describe('energy', () => {
  it('falls on the ice and refills on the bench', () => {
    const world = inPlay('energy');
    player(world, LINE2.home1).energy = 0.4;
    for (let i = 0; i < 10 * STEPS_PER_SECOND; i++) stepEnergy(world, t);
    expect(player(world, ID.home1).energy).toBeCloseTo(1 - 10 * t.energy.drainPerSecond, 5);
    expect(player(world, LINE2.home1).energy).toBeCloseTo(0.4 + 10 * t.energy.benchRecoverPerSecond, 5);
  });

  it('falls faster while sprinting', () => {
    const world = inPlay('sprint');
    player(world, ID.home1).sprinting = true;
    for (let i = 0; i < 5 * STEPS_PER_SECOND; i++) stepEnergy(world, t);
    expect(player(world, ID.home1).energy).toBeLessThan(player(world, ID.home2).energy);
  });

  it('a better stamina rating slows the fall', () => {
    const rated = (stamina: number): SkaterRatings => ({ shooting: 70, passing: 70, speed: 70, checking: 70, puckControl: 70, stamina });
    const world = inPlay('stamina');
    player(world, ID.home1).fx = skaterEffects(rated(95));
    player(world, ID.home2).fx = skaterEffects(rated(40));
    for (let i = 0; i < 10 * STEPS_PER_SECOND; i++) stepEnergy(world, t);
    expect(player(world, ID.home1).energy).toBeGreaterThan(player(world, ID.home2).energy);
  });

  it('does not fall in a scrimmage, and goalies tire only slowly', () => {
    const world = inPlay('goalie-energy');
    for (let i = 0; i < 60 * STEPS_PER_SECOND; i++) stepEnergy(world, t);
    const goalie = player(world, ID.homeGoalie);
    expect(goalie.energy).toBeLessThan(1);
    expect(goalie.energy).toBeGreaterThan(0.9);
    expect(goalieReaction(goalie, t)).toBeGreaterThan(goalie.goalie!.fx.reactionSeconds);
  });

  it('a fresh skater is at full strength; a tired one loses speed, shot power and check strength', () => {
    const world = inPlay('tired');
    const p = player(world, ID.home1);
    expect(currentFx(p, t)).toBe(p.fx);
    p.energy = t.energy.tiredBelow;
    expect(currentFx(p, t)).toBe(p.fx);

    p.energy = 0;
    const spent = currentFx(p, t);
    expect(spent.topSpeedScale).toBeCloseTo(p.fx.topSpeedScale * t.energy.minSpeedScale);
    expect(spent.accelerationScale).toBeCloseTo(p.fx.accelerationScale * t.energy.minSpeedScale);
    expect(spent.shotPower).toBeCloseTo(p.fx.shotPower * t.energy.minShotScale);
    expect(energyScale(p, t.energy.minCheckScale, t)).toBeCloseTo(t.energy.minCheckScale);

    p.energy = t.energy.tiredBelow / 2;
    expect(currentFx(p, t).topSpeedScale).toBeGreaterThan(spent.topSpeedScale);
    expect(currentFx(p, t).topSpeedScale).toBeLessThan(p.fx.topSpeedScale);
  });

  it('a tired skater really is slower on the ice', () => {
    const topSpeed = (energy: number): number => {
      const world = inPlay('slow', true);
      for (const p of world.players) if (p.id !== ID.home1 && p.role === 'skater') p.stagger = 999;
      const p = place(world, ID.home1, -20, 6);
      world.puck.pos = { x: 20, y: -10 };
      let best = 0;
      for (let i = 0; i < 2 * STEPS_PER_SECOND; i++) {
        p.energy = energy;
        step(world, { ...NO_INPUT, moveX: 1 }, t);
        best = Math.max(best, Math.hypot(p.vel.x, p.vel.y));
      }
      return best;
    };
    expect(topSpeed(0)).toBeCloseTo(topSpeed(1) * t.energy.minSpeedScale, 1);
  });
});

describe('line change', () => {
  it('sends the line on the ice to the bench door', () => {
    const world = inPlay('call');
    expect(callChange(world, 0, t)).toBe(true);
    expect(world.teams[0].line).toBe(1);
    expect(skatersOf(world, 0).every((p) => p.leaving)).toBe(true);
    expect(changing(world, 0)).toBe(true);
    // A second call while it is under way is ignored.
    expect(callChange(world, 0, t)).toBe(false);
    expect(world.teams[0].line).toBe(1);
  });

  it('each skater is replaced by his opposite number as he reaches the door', () => {
    const world = inPlay('door');
    const door = benchDoor(0, t);
    callChange(world, 0, t);
    place(world, ID.home2, door.x, door.y);
    const events: SimEvent[] = [];
    stepChanges(world, t, events);
    expect(events).toEqual([{ type: 'change', team: 0, off: ID.home2, on: LINE2.home2 }]);
    expect(player(world, ID.home2).onIce).toBe(false);
    const fresh = player(world, LINE2.home2);
    expect(fresh.onIce).toBe(true);
    expect(fresh.leaving).toBe(false);
    expect(fresh.pos).toEqual(door);
    // The other two are still on their way.
    expect(player(world, ID.home1).onIce).toBe(true);
    expect(skatersOf(world, 0)).toHaveLength(3);
  });

  it('left to itself, the whole line gets off and the new line is on within a few seconds', () => {
    const world = inPlay('whole');
    callChange(world, 0, t);
    const events = seconds(world, 8);
    expect(events.filter((e) => e.type === 'change' && e.team === 0)).toHaveLength(3);
    expect(skatersOf(world, 0).map((p) => p.line)).toEqual([1, 1, 1]);
    expect(changing(world, 0)).toBe(false);
  });

  it('the puck carrier stays on until he no longer has the puck', () => {
    const world = inPlay('carrier');
    const door = benchDoor(0, t);
    callChange(world, 0, t);
    place(world, ID.home1, door.x, door.y);
    giveTo(world, ID.home1);
    stepChanges(world, t, []);
    expect(player(world, ID.home1).onIce).toBe(true);
    world.puck.carrier = null;
    stepChanges(world, t, []);
    expect(player(world, ID.home1).onIce).toBe(false);
  });

  it('you keep control of a departing skater until a fresh one is on, then control moves to him', () => {
    const world = inPlay('control', true);
    world.puck.pos = { x: 15, y: 8 };
    world.human!.controlled = ID.home1;
    callChange(world, 0, t);
    updateControl(world, NO_INPUT);
    expect(world.human!.controlled).toBe(ID.home1);

    const door = benchDoor(0, t);
    place(world, ID.home3, door.x, door.y);
    stepChanges(world, t, []);
    updateControl(world, NO_INPUT);
    expect(world.human!.controlled).toBe(LINE2.home3);
  });

  it('the line-change button forces a change even at a bad moment', () => {
    const world = inPlay('forced', true);
    giveTo(world, ID.away1);
    place(world, ID.away1, -15, 0);
    world.puck.pos = { x: -15, y: 0 };
    step(world, { ...NO_INPUT, lineChange: true }, t);
    expect(world.teams[0].line).toBe(1);
    expect(changing(world, 0)).toBe(true);
  });
});

describe('automatic line change', () => {
  const tired = (seed: string): World => {
    const world = inPlay(seed);
    for (const p of skatersOf(world, 0)) p.energy = t.energy.changeBelow - 0.1;
    return world;
  };

  it('changes when the line is tired, the bench is fresher and the team has the puck', () => {
    const world = tired('auto-puck');
    giveTo(world, ID.home1);
    expect(autoChange(world, 0, t)).toBe(true);
    expect(world.teams[0].line).toBe(1);
  });

  it('changes when the puck is loose in the other half', () => {
    const world = tired('auto-zone');
    world.puck.pos = { x: 12, y: 0 };
    expect(autoChange(world, 0, t)).toBe(true);
  });

  it('waits while the other team has the puck, or the puck is loose in its own half', () => {
    const world = tired('auto-wait');
    giveTo(world, ID.away1);
    expect(autoChange(world, 0, t)).toBe(false);
    world.puck.carrier = null;
    world.puck.pos = { x: -12, y: 0 };
    expect(autoChange(world, 0, t)).toBe(false);
    expect(world.teams[0].line).toBe(0);
  });

  it('does not change a fresh line, or onto a bench that is no fresher', () => {
    const fresh = inPlay('auto-fresh');
    giveTo(fresh, ID.home1);
    expect(autoChange(fresh, 0, t)).toBe(false);

    const both = tired('auto-both');
    giveTo(both, ID.home1);
    for (const p of both.players) if (p.team === 0 && p.line === 1) p.energy = t.energy.changeBelow - 0.1;
    expect(autoChange(both, 0, t)).toBe(false);
  });

  it('over a period of play, both lines of both teams get ice time', () => {
    const world = createGame(t, 'shifts', { human: false, levels: [0.5, 0.5] });
    seconds(world, 100);
    for (const team of [0, 1] as const) {
      for (const line of [0, 1] as const) {
        const members = world.players.filter((p) => p.team === team && p.role === 'skater' && p.line === line);
        for (const p of members) expect(p.stats.timeOnIce).toBeGreaterThan(10);
      }
      expect(lineEnergy(world, team, 0)).toBeLessThanOrEqual(1);
    }
  });

  it('at a faceoff, the fresher line starts', () => {
    const world = inPlay('fresher');
    for (const p of skatersOf(world, 0)) p.energy = 0.3;
    // Team 1 scores, which leads to a faceoff.
    world.puck.pos = { x: -20, y: 0.3 };
    world.puck.vel = { x: -30, y: 0 };
    player(world, ID.homeGoalie).pos = { x: -20, y: 10 };
    seconds(world, t.game.goalPauseSeconds + 0.3);
    expect(world.phase).toBe('faceoff');
    expect(skatersOf(world, 0).map((p) => p.line)).toEqual([1, 1, 1]);
    expect(skatersOf(world, 1).map((p) => p.line)).toEqual([0, 0, 0]);
  });
});
