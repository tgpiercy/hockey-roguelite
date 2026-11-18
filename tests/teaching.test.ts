import { describe, expect, it } from 'vitest';
import hintData from '../src/data/hints.json';
import lessons from '../src/data/lessons.json';
import signs from '../src/data/signs.json';
import { FAIL_WORDS, FailWatch, hintDone, hintsThatApply } from '../src/game/hints';
import { LESSON_STEPS, lessonAdvance, lessonLine, lessonOver, lessonStep, newLesson, sayFor, SECOND_STEPS, slowStep } from '../src/game/lesson';
import { resolveCheck } from '../src/sim/check';
import { stageDrill } from '../src/sim/drill';
import { targetNet } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import type { SimEvent } from '../src/sim/types';
import { createGame, createWorld } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();

describe('the first skate', () => {
  it('every step asks for something, says what and why, and starts from a situation the rink can set up', () => {
    expect(LESSON_STEPS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(LESSON_STEPS.map((s) => s.id)).size).toBe(LESSON_STEPS.length);
    for (const step of LESSON_STEPS) {
      expect(step.need).toBeGreaterThan(0);
      expect(step.say.length).toBeGreaterThan(0);
      // In capitals, apart from the names of controls, which are filled in for what is being played with.
      expect(step.say.replace(/\{\w+\}/g, '')).toBe(step.say.replace(/\{\w+\}/g, '').toUpperCase());
      expect(step.why.length).toBeGreaterThan(0);
      expect(['loose', 'attack', 'defend']).toContain(step.drill);
    }
    expect(lessons.finished.length).toBeGreaterThan(0);
  });

  it('a drill puts the puck where the step needs it', () => {
    const world = createGame(t, 'drill', { rules: { practice: true } });
    stageDrill(world, t, 'attack');
    expect(world.puck.carrier).toBe(world.human!.controlled);
    expect(player(world, world.puck.carrier!).team).toBe(0);
    stageDrill(world, t, 'defend');
    expect(player(world, world.puck.carrier!).team).toBe(1);
    expect(player(world, world.puck.carrier!).slot).toBe(0);
    // The person is on his own centre, facing the carrier.
    expect(player(world, world.human!.controlled).team).toBe(0);
    stageDrill(world, t, 'loose');
    expect(world.puck.carrier).toBeNull();
    expect(world.phase).toBe('play');
    // Loose, on the person's side of centre and nearer him than any opponent.
    const gap = (id: number): number => Math.hypot(player(world, id).pos.x - world.puck.pos.x, player(world, id).pos.y - world.puck.pos.y);
    expect(world.puck.pos.x).toBeLessThan(0);
    for (const id of [ID.away1, ID.away2, ID.away3]) expect(gap(world.human!.controlled)).toBeLessThan(gap(id));
  });

  it('counts each move of the person\'s own, moves on when enough are done, and ends', () => {
    const world = createWorld(t, 'lesson');
    const lesson = newLesson();
    const me = world.human!.controlled;
    const mate = ID.home2;
    const them = ID.away1;
    const moves: Record<string, SimEvent> = {
      shoot: { type: 'shot', speed: 20, player: me },
      pass: { type: 'pass', player: me, target: mate, saucer: false },
      oneTimer: { type: 'shot', speed: 20, player: mate, oneTimer: true },
      poke: { type: 'check', player: me, target: them, kind: 'poke', success: true },
      body: { type: 'check', player: me, target: them, kind: 'body', success: true },
    };
    // Nothing yet: he has not reached the puck.
    expect(lessonAdvance(lesson, [], me, world)).toBe('none');
    expect(lessonLine(lesson)).toContain(`1 OF ${LESSON_STEPS.length}`);
    giveTo(world, me);
    expect(lessonAdvance(lesson, [], me, world)).toBe('step');
    while (!lessonOver(lesson)) {
      const step = lessonStep(lesson)!;
      const move = moves[step.id];
      expect(move, step.id).toBeDefined();
      // Somebody else's move, or a failed one, counts for nothing.
      expect(lessonAdvance(lesson, [{ type: 'shot', speed: 20, player: them }, { type: 'check', player: me, target: them, kind: 'poke', success: false }], me, world)).toBe('none');
      for (let n = 1; n <= step.need; n++) {
        if (step.need > 1 && n > 1) expect(lessonLine(lesson)).toContain(`${n - 1}/${step.need}`);
        expect(lessonAdvance(lesson, [move!], me, world)).toBe(n < step.need ? 'progress' : 'step');
      }
    }
    expect(lessonLine(lesson)).toBe(lessons.finished);
    expect(lessonAdvance(lesson, [moves.shoot!], me, world)).toBe('none');
  });
});

describe('being told why a move missed', () => {
  it('a person\'s check with the carrier out of reach says so; the AI\'s says nothing', () => {
    const world = createWorld(t, 'whiff');
    clearIce(world, [ID.home1, ID.home2, ID.away1]);
    place(world, ID.home1, 0, 0);
    place(world, ID.home2, 0, 5);
    place(world, ID.away1, 6, 0, Math.PI);
    giveTo(world, ID.away1);
    world.human!.controlled = ID.home1;
    const mine: SimEvent[] = [];
    resolveCheck(world, player(world, ID.home1), false, t, mine);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: 'whiff', player: ID.home1 });
    const his: SimEvent[] = [];
    resolveCheck(world, player(world, ID.home2), false, t, his);
    expect(his).toEqual([]);
  });

  it('a poke from behind the carrier fails and says from behind', () => {
    const world = createWorld(t, 'behind');
    clearIce(world, [ID.home1, ID.away1]);
    // The carrier skates away from the checker, who is right at his back.
    const carrier = place(world, ID.away1, 0, 0, 0);
    carrier.vel = { x: 5, y: 0 };
    place(world, ID.home1, -0.9, 0, 0);
    giveTo(world, ID.away1);
    world.human!.controlled = ID.home1;
    const events: SimEvent[] = [];
    resolveCheck(world, player(world, ID.home1), false, t, events);
    const check = events.find((e) => e.type === 'check');
    if (check && check.type === 'check') {
      expect(check.success).toBe(false);
      expect(['behind', 'far']).toContain(check.miss);
    } else {
      expect(events[0]?.type).toBe('whiff');
    }
  });

  it('the words: too far, from behind, and a one-timer let go late; nothing for another skater', () => {
    const watch = new FailWatch();
    const me = 0;
    expect(watch.note([{ type: 'whiff', player: me, metres: hintData.whiffNear - 1 }], me, 0)).toEqual([{ text: FAIL_WORDS.far, player: me }]);
    expect(watch.note([{ type: 'whiff', player: me, metres: 1, turned: true }], me, 0)).toEqual([{ text: FAIL_WORDS.turned, player: me }]);
    // From the far end of the rink a press of check is not a check that missed.
    expect(watch.note([{ type: 'whiff', player: me, metres: hintData.whiffNear + 5 }], me, 0)).toEqual([]);
    expect(watch.note([{ type: 'check', player: me, target: 7, kind: 'poke', success: false, miss: 'behind' }], me, 0)).toEqual([{ text: FAIL_WORDS.behind, player: me }]);
    expect(watch.note([{ type: 'check', player: 1, target: 7, kind: 'poke', success: false, miss: 'behind' }], me, 0)).toEqual([]);
    // He takes a pass and shoots a moment later with no one-timer: he held shoot too late.
    expect(watch.note([{ type: 'pickup', player: me, pass: true }], me, 10)).toEqual([]);
    expect(watch.note([{ type: 'shot', speed: 20, player: me }], me, 10 + hintData.lateSeconds / 2)).toEqual([{ text: FAIL_WORDS.late, player: me }]);
    // A one-timer, a shot long after, or a shot off a loose puck is not late.
    watch.note([{ type: 'pickup', player: me, pass: true }], me, 20);
    expect(watch.note([{ type: 'shot', speed: 20, player: me, oneTimer: true }], me, 20.1)).toEqual([]);
    watch.note([{ type: 'pickup', player: me, pass: true }], me, 30);
    expect(watch.note([{ type: 'shot', speed: 20, player: me }], me, 30 + hintData.lateSeconds + 1)).toEqual([]);
    watch.note([{ type: 'pickup', player: me }], me, 40);
    expect(watch.note([{ type: 'shot', speed: 20, player: me }], me, 40.1)).toEqual([]);
  });
});

describe('hints for the basics', () => {
  it('carrying in range of the net: shoot; with a team-mate nearer the net: pass', () => {
    const world = createWorld(t, 'basics');
    clearIce(world, [ID.home1, ID.home2]);
    const net = targetNet(0, t);
    place(world, ID.home1, net.x - hintData.shootRange + 2, 0);
    place(world, ID.home2, net.x - 4, 3);
    giveTo(world, ID.home1);
    expect(hintsThatApply(world, t)).toContain('shoot');
    expect(hintsThatApply(world, t)).toContain('pass');
    // From his own end, with the team-mate behind him: neither.
    place(world, ID.home1, net.x - hintData.shootRange - 10, 0);
    place(world, ID.home2, net.x - hintData.shootRange - 20, 3);
    expect(hintsThatApply(world, t)).not.toContain('shoot');
    expect(hintsThatApply(world, t)).not.toContain('pass');
  });

  it('their carrier nearer a team-mate than the skater he has: switch', () => {
    const world = createWorld(t, 'switch');
    clearIce(world, [ID.home1, ID.home2, ID.away1]);
    place(world, ID.home1, -20, 0);
    place(world, ID.home2, 2, 0);
    place(world, ID.away1, 5, 0);
    giveTo(world, ID.away1);
    world.human!.controlled = ID.home1;
    expect(hintsThatApply(world, t)).toContain('switchTo');
    world.human!.controlled = ID.home2;
    expect(hintsThatApply(world, t)).not.toContain('switchTo');
  });

  it('a plain shot and a plain pass of his own count for them', () => {
    expect(hintDone({ type: 'shot', speed: 20, player: 0 }, 0)).toBe('shoot');
    expect(hintDone({ type: 'pass', player: 0, target: 1, saucer: false }, 0)).toBe('pass');
    expect(hintDone({ type: 'pass', player: 0, target: null, saucer: false }, 0)).toBeNull();
    expect(hintDone({ type: 'shot', speed: 20, player: 1 }, 0)).toBeNull();
  });
});

describe('the page of signs', () => {
  it('every sign has a name, a place, a meaning and a drawing of its own kind', () => {
    const kinds = ['ring', 'ring2', 'arrow', 'diamond', 'reach', 'bar', 'momentum', 'fire', 'energy', 'pips', 'word', 'heavy', 'wall', 'flash', 'lanes'];
    expect(new Set(signs.signs.map((s) => s.id)).size).toBe(signs.signs.length);
    for (const s of signs.signs) {
      expect(kinds).toContain(s.art);
      for (const words of [s.name, s.where, s.means]) expect(words.length).toBeGreaterThan(0);
    }
  });
});

describe('the second skate, and the controls by name', () => {
  it('the later moves each say what and why, and none repeats the first skate', () => {
    expect(SECOND_STEPS.length).toBeGreaterThanOrEqual(3);
    const first = new Set(LESSON_STEPS.map((s) => s.id));
    for (const step of SECOND_STEPS) {
      expect(first.has(step.id), step.id).toBe(false);
      expect(step.need).toBeGreaterThan(0);
      expect(step.why.length).toBeGreaterThan(0);
      expect(['loose', 'attack', 'defend']).toContain(step.drill);
    }
    expect(lessons.second.finished.length).toBeGreaterThan(0);
  });

  it('every control a step names has a name on a controller, a keyboard and the screen', () => {
    for (const step of [...LESSON_STEPS, ...SECOND_STEPS]) {
      for (const device of ['pad', 'keys', 'touch'] as const) {
        const said = sayFor(step.say, device);
        expect(said, step.id).not.toMatch(/[{}]/);
        expect(said).toBe(said.toUpperCase());
      }
    }
    expect(sayFor('{move}: GO', 'pad')).toBe('LEFT STICK: GO');
    expect(sayFor('{move}: GO', 'keys')).toBe('ARROW KEYS: GO');
    expect(sayFor('TAP {pass}', 'keys')).toBe('TAP Z');
    expect(lessonLine(newLesson(), 'keys')).toContain('ARROW KEYS');
  });

  it('a deke and a fake count as they happen; a give and go and a block count once, when they start', () => {
    const world = createGame(t, 'second', { rules: { practice: true } });
    const me = world.human!.controlled;
    const lesson = newLesson('second');
    expect(lessonStep(lesson)!.id).toBe('deke');
    expect(lessonAdvance(lesson, [{ type: 'deke', player: me + 1 }], me, world)).toBe('none');
    expect(lessonAdvance(lesson, [{ type: 'deke', player: me }], me, world)).toBe('progress');
    expect(lessonAdvance(lesson, [{ type: 'deke', player: me }], me, world)).toBe('step');
    expect(lessonStep(lesson)!.id).toBe('fake');
    expect(lessonAdvance(lesson, [{ type: 'fake', player: me }], me, world)).toBe('step');
    expect(lessonStep(lesson)!.id).toBe('giveGo');
    expect(lessonAdvance(lesson, [], me, world)).toBe('none');
    world.human!.giveGo = { passer: me, receiver: me + 1, left: 1 };
    expect(lessonAdvance(lesson, [], me, world)).toBe('step');
    // A saucer pass counts only held long enough to be one, and only with somebody to take it.
    expect(lessonStep(lesson)!.id).toBe('saucer');
    world.human!.giveGo = null;
    expect(lessonAdvance(lesson, [{ type: 'pass', player: me, target: me + 1, saucer: false }], me, world)).toBe('none');
    expect(lessonAdvance(lesson, [{ type: 'pass', player: me, target: null, saucer: true }], me, world)).toBe('none');
    expect(lessonAdvance(lesson, [{ type: 'pass', player: me, target: me + 1, saucer: true }], me, world)).toBe('step');
    expect(lessonStep(lesson)!.id).toBe('block');
    // Still on from the step before: it does not count as a block.
    expect(lessonAdvance(lesson, [], me, world, false)).toBe('none');
    expect(lessonAdvance(lesson, [], me, world, true)).toBe('step');
    expect(lessonOver(lesson)).toBe(true);
    expect(lessonLine(lesson)).toBe(lessons.second.finished);
  });

  it('time runs slow only on the steps that are learned that way', () => {
    const lesson = newLesson();
    const slow: string[] = [];
    while (!lessonOver(lesson)) {
      if (slowStep(lesson)) slow.push(lessonStep(lesson)!.id);
      lesson.step += 1;
    }
    expect(slow).toEqual(['oneTimer']);
    expect(lessons.slowScale).toBeGreaterThan(0);
    expect(lessons.slowScale).toBeLessThan(1);
  });
});

