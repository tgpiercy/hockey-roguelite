import { describe, expect, it } from 'vitest';
import look from '../src/data/rinkLook.json';
import { newlyInForce, wordsFor } from '../src/game/floatWords';
import { stepConditions } from '../src/sim/conditions';
import { resolveLoosePuck } from '../src/sim/contact';
import { passPreview } from '../src/sim/pass';
import { givePuck, loosePuck } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createGame, createWorld, step } from '../src/sim/world';
import { runGame, uniformTeam } from './harness/harness';
import { clearIce, ID, place, player } from './helpers';

const t = cloneTuning();
const TEXTS = look.floatWords.texts;

describe('floating words', () => {
  it('each move worth naming gets its word, rising from the player who did it', () => {
    const events: SimEvent[] = [
      { type: 'check', player: 0, target: 7, kind: 'poke', success: true },
      { type: 'check', player: 1, target: 8, kind: 'body', success: true, big: true },
      { type: 'check', player: 2, target: 9, kind: 'poke', success: true, windUp: true },
      { type: 'check', player: 7, target: 0, kind: 'poke', success: false, evaded: true },
      { type: 'block', player: 3 },
      { type: 'shot', player: 4, speed: 20, oneTimer: true } as SimEvent,
    ];
    expect(wordsFor(events)).toEqual([
      { text: TEXTS.stolen, kind: 'stolen', player: 0 },
      { text: TEXTS.bigHit, kind: 'bigHit', player: 1 },
      { text: TEXTS.denied, kind: 'denied', player: 2 },
      { text: TEXTS.deked, kind: 'deked', player: 0 },
      { text: TEXTS.blocked, kind: 'blocked', player: 3 },
      { text: TEXTS.oneTimer, kind: 'oneTimer', player: 4 },
    ]);
  });

  it('ordinary play gets none', () => {
    const events: SimEvent[] = [
      { type: 'check', player: 0, target: 7, kind: 'poke', success: false },
      { type: 'check', player: 0, target: 7, kind: 'body', success: true },
      { type: 'pickup', player: 1 },
      { type: 'save', goalie: 6, frozen: true },
      { type: 'shot', player: 4, speed: 20 } as SimEvent,
    ];
    expect(wordsFor(events)).toEqual([]);
  });

  it('an artifact coming into force is named once, when it starts', () => {
    const world = createGame(t, 'force', {
      human: false,
      teams: [{ ...uniformTeam(70), modifiers: [{ stat: 'topSpeedScale', op: 'mul', value: 1.1, when: 'trailing', label: 'Comeback kings' }] }, uniformTeam(70)],
    });
    let noted = newlyInForce(world, 0, new Set());
    expect(noted.fresh).toEqual([]);
    world.score = [0, 1];
    stepConditions(world, [], t.period.count);
    noted = newlyInForce(world, 0, noted.now);
    expect(noted.fresh).toEqual(['Comeback kings']);
    noted = newlyInForce(world, 0, noted.now);
    expect(noted.fresh).toEqual([]);
    // A timed boost from a trigger is named too; a powerup's boost is not.
    world.teams[0].boosts = [
      { id: 'when/save/Springboard', name: 'Springboard', secondsLeft: 5, modifiers: [] },
      { id: 'speed-burst', name: 'Speed burst', secondsLeft: 5, modifiers: [] },
    ];
    expect(newlyInForce(world, 0, noted.now).fresh).toEqual(['Springboard']);
  });
});

describe('the pass mark', () => {
  const setUp = (): World => {
    const world = createWorld(t, 'mark');
    clearIce(world, [ID.home1, ID.home2, ID.home3]);
    place(world, ID.home1, 0, 0, 0);
    place(world, ID.home2, 8, 6, 0);
    place(world, ID.home3, 8, -6, 0);
    return world;
  };

  it('is the team-mate the stick points at, and nobody when he has not got the puck', () => {
    const world = setUp();
    const me = player(world, ID.home1);
    expect(passPreview(world, me, NO_INPUT, t)).toBeNull();
    givePuck(world, me);
    expect(passPreview(world, me, { ...NO_INPUT, moveX: 0.7, moveY: 0.7 }, t)?.id).toBe(ID.home2);
    expect(passPreview(world, me, { ...NO_INPUT, moveX: 0.7, moveY: -0.7 }, t)?.id).toBe(ID.home3);
    // With the stick centred it is whoever is most open: somebody, always.
    expect(passPreview(world, me, NO_INPUT, t)).not.toBeNull();
  });
});
