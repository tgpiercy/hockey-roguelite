import { describe, expect, it } from 'vitest';
import { hintFor, hintsThatApply } from '../src/game/hints';
import { checkRules } from '../src/sim/check';
import type { PowerupSpec } from '../src/sim/modifiers';
import { humanOf, humans, humansOn, partnerOf, teamInput } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createGame, createWorld, step } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const coop = (seed = 'coop'): World => createWorld(t, seed, { second: 0 });
const versus = (seed = 'versus'): World => createWorld(t, seed, { second: 1 });
const press = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

describe('two humans in the world', () => {
  it('co-op: both on team 0, each on a skater of his own', () => {
    const world = coop();
    expect(humans(world)).toHaveLength(2);
    expect(humansOn(world, 0)).toHaveLength(2);
    expect(world.human!.controlled).not.toBe(world.human2!.controlled);
    expect(player(world, world.human!.controlled).slot).toBe(0);
    expect(player(world, world.human2!.controlled).team).toBe(0);
    expect(partnerOf(world, world.human!)).toBe(world.human2);
    expect(humanOf(world, world.human2!.controlled)).toBe(world.human2);
  });

  it('versus: one human a side, each on his centre, and no partners', () => {
    const world = versus();
    expect(world.human!.team).toBe(0);
    expect(world.human2!.team).toBe(1);
    expect(player(world, world.human2!.controlled).team).toBe(1);
    expect(player(world, world.human2!.controlled).slot).toBe(0);
    expect(partnerOf(world, world.human!)).toBeNull();
  });

  it('one human, as before, has no second', () => {
    const world = createWorld(t, 'solo');
    expect(world.human2).toBeNull();
    expect(humans(world)).toHaveLength(1);
    expect(humans(createWorld(t, 'ai', { human: false }))).toEqual([]);
  });
});

describe('each input moves only its own skater', () => {
  it('co-op', () => {
    const world = coop();
    const a = world.human!.controlled;
    const b = world.human2!.controlled;
    clearIce(world, [a, b]);
    place(world, a, -5, -4, 0);
    place(world, b, -5, 4, 0);
    world.puck.pos = { x: 20, y: 0 };
    for (let i = 0; i < 20; i++) step(world, press({ moveX: 1 }), t, press({ moveY: -1 }));
    expect(world.human!.controlled).toBe(a);
    expect(world.human2!.controlled).toBe(b);
    expect(player(world, a).vel.x).toBeGreaterThan(1);
    expect(Math.abs(player(world, a).vel.y)).toBeLessThan(0.5);
    expect(player(world, b).vel.y).toBeLessThan(-1);
    expect(Math.abs(player(world, b).vel.x)).toBeLessThan(0.5);
  });

  it('versus', () => {
    const world = versus();
    const a = world.human!.controlled;
    const b = world.human2!.controlled;
    clearIce(world, [a, b]);
    place(world, a, -5, 0, 0);
    place(world, b, 5, 0, Math.PI);
    world.puck.pos = { x: 0, y: 11 };
    for (let i = 0; i < 20; i++) step(world, press({ moveY: 1 }), t, press({ moveY: -1 }));
    expect(player(world, a).vel.y).toBeGreaterThan(1);
    expect(player(world, b).vel.y).toBeLessThan(-1);
  });
});

describe('co-op: who controls whom', () => {
  it('switch takes the free skater, never your partner\'s', () => {
    const world = coop();
    const mine = world.human2!.controlled;
    const partner = world.human!.controlled;
    world.puck.pos = { x: 20, y: 10 };
    step(world, NO_INPUT, t, press({ switchPlayer: true }));
    const now = world.human2!.controlled;
    expect(now).not.toBe(partner);
    expect(now).not.toBe(mine);
    expect(player(world, now).team).toBe(0);
    // Again: back to the first, still never the partner's.
    step(world, NO_INPUT, t, NO_INPUT);
    step(world, NO_INPUT, t, press({ switchPlayer: true }));
    expect(world.human2!.controlled).toBe(mine);
    expect(world.human!.controlled).toBe(partner);
  });

  /** Player one's skater has the puck at centre ice, facing a teammate straight ahead. */
  const passTo = (world: World, targetId: number): SimEvent[] => {
    const carrier = world.human!.controlled;
    const others = [0, 1, 2].filter((id) => id !== carrier && id !== targetId);
    clearIce(world, [carrier, targetId, ...others]);
    place(world, carrier, 0, 0, 0);
    place(world, targetId, 7, 0, Math.PI);
    for (const id of others) place(world, id, -8, 9, 0);
    giveTo(world, carrier);
    const events = [...step(world, press({ pass: true, moveX: 1 }), t, NO_INPUT), ...step(world, press({ moveX: 1 }), t, NO_INPUT)];
    return events;
  };

  it('a pass to your partner\'s skater stays with him', () => {
    const world = coop();
    const one = world.human!.controlled;
    const two = world.human2!.controlled;
    const events = passTo(world, two);
    expect(events.find((e) => e.type === 'pass')).toMatchObject({ player: one, target: two });
    expect(world.human!.controlled).toBe(one);
    expect(world.human2!.controlled).toBe(two);
  });

  it('a pass of yours to the free skater takes you with it', () => {
    const world = coop();
    const one = world.human!.controlled;
    const two = world.human2!.controlled;
    const free = [0, 1, 2].find((id) => id !== one && id !== two)!;
    const events = passTo(world, free);
    expect(events.find((e) => e.type === 'pass')).toMatchObject({ player: one, target: free });
    expect(world.human!.controlled).toBe(free);
    expect(world.human2!.controlled).toBe(two);
  });

  it('when the free skater picks the puck up, nobody is pulled onto him', () => {
    const world = coop();
    const one = world.human!.controlled;
    const two = world.human2!.controlled;
    const free = [0, 1, 2].find((id) => id !== one && id !== two)!;
    clearIce(world, [one, two, free]);
    place(world, one, -10, -6, 0);
    place(world, two, -10, 6, 0);
    place(world, free, 3, 0, 0);
    world.puck.pos = { x: 3.4, y: 0 };
    world.puck.vel = { x: 0, y: 0 };
    for (let i = 0; i < 5; i++) step(world, NO_INPUT, t, NO_INPUT);
    expect(world.puck.carrier).toBe(free);
    expect(world.human!.controlled).toBe(one);
    expect(world.human2!.controlled).toBe(two);
    // Playing alone, control follows the puck as it always has.
    const solo = createWorld(t, 'solo-pickup');
    clearIce(solo, [0, 2]);
    solo.human!.controlled = 0;
    place(solo, 0, -10, -6, 0);
    place(solo, 2, 3, 0, 0);
    solo.puck.pos = { x: 3.4, y: 0 };
    solo.puck.vel = { x: 0, y: 0 };
    for (let i = 0; i < 5; i++) step(solo, NO_INPUT, t);
    expect(solo.human!.controlled).toBe(2);
  });

  it('both get the help a human gets: check assist for each', () => {
    const world = coop();
    const a = checkRules(world, player(world, world.human!.controlled), t);
    const b = checkRules(world, player(world, world.human2!.controlled), t);
    const free = [0, 1, 2].find((id) => id !== world.human!.controlled && id !== world.human2!.controlled)!;
    const ai = checkRules(world, player(world, free), t);
    expect(a.pokeConeDegrees).toBe(t.checkAssist.pokeConeDegrees);
    expect(b.pokeConeDegrees).toBe(t.checkAssist.pokeConeDegrees);
    expect(ai.pokeConeDegrees).toBe(t.check.pokeConeDegrees);
  });
});

describe('the bench listens to either player', () => {
  it('either may call a line change or pull the goalie; a team with no human has no say', () => {
    const world = coop();
    expect(teamInput(world, 0, press({ lineChange: true }), NO_INPUT)?.lineChange).toBe(true);
    expect(teamInput(world, 0, NO_INPUT, press({ lineChange: true }))?.lineChange).toBe(true);
    expect(teamInput(world, 0, NO_INPUT, press({ pullGoalie: true }))?.pullGoalie).toBe(true);
    expect(teamInput(world, 0, NO_INPUT, NO_INPUT)?.lineChange).toBe(false);
    expect(teamInput(world, 1, press({ lineChange: true }), NO_INPUT)).toBeNull();
    const head = versus();
    expect(teamInput(head, 1, NO_INPUT, press({ lineChange: true }))?.lineChange).toBe(true);
    expect(teamInput(head, 1, press({ lineChange: true }), NO_INPUT)?.lineChange).toBe(false);
  });

  it('in a game, the second player wins a faceoff for the other team in versus', () => {
    const world = createGame(t, 'draw', { second: 1 });
    expect(world.phase).toBe('faceoff');
    let winner: number | null = null;
    for (let i = 0; i < 600 && world.phase === 'faceoff'; i++) {
      // Player two taps the draw button every other step; player one never presses.
      const events = step(world, NO_INPUT, t, press({ pass: i % 2 === 0 }));
      const drawn = events.find((e) => e.type === 'faceoff');
      if (drawn && drawn.type === 'faceoff') winner = drawn.winner;
    }
    expect(winner).toBe(1);
  });
});

describe('whole games with two humans', () => {
  const play = (world: World, steps: number): void => {
    for (let i = 0; i < steps && world.phase !== 'final'; i++) {
      const a = press({ moveX: Math.sin(i / 37), moveY: Math.cos(i / 53), shoot: i % 90 < 20, pass: i % 140 < 3, check: i % 70 < 8, switchPlayer: i % 200 === 0, sprint: i % 3 === 0 });
      const b = press({ moveX: Math.cos(i / 41), moveY: Math.sin(i / 29), shoot: i % 110 < 25, pass: i % 160 < 3, check: i % 60 < 10, switchPlayer: i % 230 === 0, lineChange: i % 900 === 0 });
      step(world, a, t, b);
      const one = world.human!;
      const two = world.human2!;
      if (one.team === two.team) expect(one.controlled).not.toBe(two.controlled);
      expect(player(world, one.controlled).team).toBe(one.team);
      expect(player(world, two.controlled).team).toBe(two.team);
    }
  };

  it('co-op: never two on one skater, through faceoffs and line changes', () => {
    const world = createGame(t, 'coop-game', { second: 0 });
    play(world, 6000);
    expect(world.tick).toBeGreaterThan(5000);
  });

  it('versus: each stays on his own team', () => {
    const world = createGame(t, 'versus-game', { second: 1 });
    play(world, 6000);
    expect(world.tick).toBeGreaterThan(5000);
  });
});

describe('co-op: powerups and hints', () => {
  const spec = (id: string): PowerupSpec => ({ id, name: id, seconds: 5, modifiers: [{ stat: 'topSpeedScale', op: 'mul', value: 1.1 }] });

  it('each player fires one powerup: player one the first, player two the second', () => {
    const world = createWorld(t, 'coop-power', { second: 0, powerups: [spec('one'), spec('two')] });
    // Player two's button does not touch the first powerup.
    let events = step(world, NO_INPUT, t, press({ powerupA: true }));
    expect(events.filter((e) => e.type === 'powerup')).toEqual([{ type: 'powerup', team: 0, slot: 1, id: 'two' }]);
    // Either of player one's buttons fires his.
    events = step(world, press({ powerupB: true }), t, NO_INPUT);
    expect(events.filter((e) => e.type === 'powerup')).toEqual([{ type: 'powerup', team: 0, slot: 0, id: 'one' }]);
  });

  it('playing alone, the two buttons fire the two powerups as before', () => {
    const world = createWorld(t, 'solo-power', { powerups: [spec('one'), spec('two')] });
    const events = step(world, press({ powerupB: true }), t);
    expect(events.filter((e) => e.type === 'powerup')).toEqual([{ type: 'powerup', team: 0, slot: 1, id: 'two' }]);
  });

  it('hints are worked out for each player from his own skater', () => {
    const world = coop();
    const one = world.human!.controlled;
    const two = world.human2!.controlled;
    clearIce(world, [one, two, ID.away1]);
    place(world, ID.away1, 0, 0, Math.PI);
    giveTo(world, ID.away1);
    place(world, one, -2.5, 0, 0);
    place(world, two, -20, 9, 0);
    expect(hintsThatApply(world, t, world.human)).toContain('poke');
    expect(hintsThatApply(world, t, world.human2)).toEqual([]);
    expect(hintFor(world, t, {}, world.human2)).toBeNull();
  });
});
