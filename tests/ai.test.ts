import { describe, expect, it } from 'vitest';
import { aiInput, aiLevel, chooseState, inZone, laneClear, postsFor, postSpot, think } from '../src/sim/ai';
import positions from '../src/data/ai.json';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);

const setUp = (seed = 'ai'): World => createWorld(t, seed, { human: false, levels: [0.5, 0.5] });
const state = (world: World, id: number) => chooseState(world, player(world, id), t);

describe('AI state machine: choosing a state', () => {
  it('attack: he has the puck', () => {
    const world = setUp();
    giveTo(world, ID.home1);
    expect(state(world, ID.home1)).toBe('attack');
  });

  it('support: a teammate has the puck', () => {
    const world = setUp();
    giveTo(world, ID.home1);
    expect(state(world, ID.home2)).toBe('support');
  });

  it('support: his own goalie is holding the puck', () => {
    const world = setUp();
    giveTo(world, ID.homeGoalie);
    expect(state(world, ID.home1)).toBe('support');
    expect(state(world, ID.home2)).toBe('support');
  });

  it('chase: the puck is loose and he is his team\'s nearest skater', () => {
    const world = setUp();
    place(world, ID.home1, 2, 0);
    place(world, ID.home2, -8, 5);
    world.puck.pos = { x: 4, y: 0 };
    expect(state(world, ID.home1)).toBe('chase');
  });

  it('the skater who is not nearest supports up ice, and defends in his own half', () => {
    const world = setUp();
    place(world, ID.home1, 2, 0);
    place(world, ID.home2, -8, 5);
    world.puck.pos = { x: 4, y: 0 };
    expect(state(world, ID.home2)).toBe('support');
    world.puck.pos = { x: -4, y: 0 };
    place(world, ID.home1, -5, 0);
    expect(state(world, ID.home2)).toBe('defend');
  });

  it('chase: a pass is on its way to him, even if a teammate is nearer the puck', () => {
    const world = setUp();
    place(world, ID.home1, 0, 0);
    place(world, ID.home2, 10, 6);
    world.puck.pos = { x: 1, y: 0.5 };
    world.puck.passTarget = ID.home2;
    expect(state(world, ID.home2)).toBe('chase');
    expect(state(world, ID.home1)).not.toBe('chase');
  });

  it('defend: the other team has the puck and he is on the goal side of it', () => {
    const world = setUp();
    place(world, ID.away1, 0, 0);
    giveTo(world, ID.away1);
    place(world, ID.home1, -6, 0);
    expect(state(world, ID.home1)).toBe('defend');
  });

  it('backcheck: the other team has the puck and he is caught up ice', () => {
    const world = setUp();
    place(world, ID.away1, 0, 0, Math.PI);
    giveTo(world, ID.away1);
    place(world, ID.home1, 12, 0);
    expect(state(world, ID.home1)).toBe('backcheck');
  });

  it('defend, not chase: their goalie is holding the puck', () => {
    const world = setUp();
    giveTo(world, ID.awayGoalie);
    place(world, ID.home1, 15, 0);
    expect(state(world, ID.home1)).toBe('defend');
  });

  it('mirrors for the team attacking the other way', () => {
    const world = setUp();
    place(world, ID.home1, 0, 0);
    giveTo(world, ID.home1);
    place(world, ID.away1, -12, 0);
    place(world, ID.away2, 8, 0);
    expect(state(world, ID.away1)).toBe('backcheck');
    expect(state(world, ID.away2)).toBe('defend');
  });
});

describe('AI state machine: transitions', () => {
  it('moves from chase to attack on picking the puck up, then to defend when it is taken', () => {
    const world = setUp();
    clearIce(world, [ID.home1]);
    place(world, ID.home1, -3, 0);
    world.puck.pos = { x: 0, y: 0 };
    const p = player(world, ID.home1);

    aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('chase');

    giveTo(world, ID.home1);
    aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('attack');

    // The puck is stripped; he keeps his old plan until his reaction time is up, then defends.
    place(world, ID.away1, 3, 0);
    giveTo(world, ID.away1);
    p.ai.shootSteps = 0;
    p.ai.passSteps = 0;
    aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('attack');
    for (let i = 0; i < STEPS_PER_SECOND; i++) aiInput(world, p, t, aiLevel(0.5));
    expect(p.ai.state).toBe('defend');
  });

  it('a harder AI reacts sooner, aims better, sees more passes and checks more', () => {
    const easy = aiLevel(0);
    const hard = aiLevel(1);
    expect(hard.reactionSeconds).toBeLessThan(easy.reactionSeconds);
    expect(hard.aimErrorDegrees).toBeLessThan(easy.aimErrorDegrees);
    expect(hard.passAwareness).toBeGreaterThan(easy.passAwareness);
    expect(hard.checkEagerness).toBeGreaterThan(easy.checkEagerness);
    expect(aiLevel(5)).toEqual(hard);
    expect(aiLevel(-1)).toEqual(easy);
  });
});

describe('AI behaviour', () => {
  const play = (world: World, seconds: number): SimEvent[] => {
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) events.push(...step(world, NO_INPUT, t));
    return events;
  };

  it('attack: with a clear look from the slot, it shoots toward the net', () => {
    const world = setUp('shoot');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, gx - 7, 1, 0);
    giveTo(world, ID.home1);
    const events = play(world, 1.5);
    const shot = events.find((e) => e.type === 'shot');
    expect(shot).toMatchObject({ type: 'shot', player: ID.home1 });
  });

  it('attack: far from the net, it carries the puck up ice', () => {
    const world = setUp('carry');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, -10, 0, 0);
    giveTo(world, ID.home1);
    play(world, 1);
    expect(player(world, ID.home1).pos.x).toBeGreaterThan(-6);
    expect(world.puck.carrier).toBe(ID.home1);
  });

  it('chase: the nearest skater goes and gets a loose puck', () => {
    const world = setUp('fetch');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, -8, 3);
    world.puck.pos = { x: 0, y: -2 };
    const events = play(world, 2.5);
    expect(events.some((e) => e.type === 'pickup' && e.player === ID.home1)).toBe(true);
  });

  it('support: the teammate without the puck gets away from the carrier, into space', () => {
    const world = setUp('open');
    clearIce(world, [ID.home1, ID.home2]);
    place(world, ID.home1, 0, 2, 0);
    place(world, ID.home2, -1, 3);
    giveTo(world, ID.home1);
    player(world, ID.home1).stagger = 2;
    play(world, 1.5);
    const mate = player(world, ID.home2);
    const carrier = player(world, ID.home1);
    expect(Math.hypot(mate.pos.x - carrier.pos.x, mate.pos.y - carrier.pos.y)).toBeGreaterThan(4);
  });

  it('defend: the nearest defender closes on the carrier and checks him', () => {
    const world = createWorld(t, 'pressure', { human: false, levels: [1, 1] });
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.away1, 2, 0, Math.PI);
    giveTo(world, ID.away1);
    player(world, ID.away1).stagger = 3;
    place(world, ID.home1, -6, 0);
    const events = play(world, 3);
    expect(events.some((e) => e.type === 'check' && e.player === ID.home1)).toBe(true);
  });

  it('backcheck: a skater caught up ice comes back toward his own net', () => {
    const world = setUp('back');
    clearIce(world, [ID.home1, ID.away1]);
    place(world, ID.away1, -5, 0, Math.PI);
    giveTo(world, ID.away1);
    player(world, ID.away1).stagger = 2;
    place(world, ID.home1, 15, 4);
    play(world, 1);
    expect(player(world, ID.home1).pos.x).toBeLessThan(10);
  });

  it('defend: with the carrier pressured, the other two defenders each mark a different man', () => {
    const world = setUp('marking');
    place(world, ID.away1, 0, 0, Math.PI);
    place(world, ID.away2, -8, 7);
    place(world, ID.away3, -8, -7);
    giveTo(world, ID.away1);
    for (const id of [ID.away1, ID.away2, ID.away3]) player(world, id).stagger = 3;
    place(world, ID.home1, -3, 0);
    place(world, ID.home2, -14, 3);
    place(world, ID.home3, -14, -3);
    play(world, 1.5);
    // Each marker has moved to his own side of the ice, toward the man there.
    expect(player(world, ID.home2).pos.y).toBeGreaterThan(3.5);
    expect(player(world, ID.home3).pos.y).toBeLessThan(-3.5);
  });

  it('support: two helpers take different jobs, one ahead in the far lane and one trailing', () => {
    const world = setUp('two-helpers');
    clearIce(world, [ID.home1, ID.home2, ID.home3]);
    place(world, ID.home1, 0, 4, 0);
    place(world, ID.home2, -2, 2);
    place(world, ID.home3, -2, 6);
    giveTo(world, ID.home1);
    player(world, ID.home1).stagger = 2;
    play(world, 1.5);
    const carrier = player(world, ID.home1);
    expect(player(world, ID.home2).pos.x).toBeGreaterThan(carrier.pos.x);
    expect(player(world, ID.home2).pos.y).toBeLessThan(0);
    expect(player(world, ID.home3).pos.x).toBeLessThan(carrier.pos.x);
  });

  it('support: a defenceman takes the trailing spot and the forward goes ahead, whatever their numbers', () => {
    const world = setUp('positions');
    clearIce(world, [ID.home1, ID.home2, ID.home3]);
    place(world, ID.home1, 0, 4, 0);
    place(world, ID.home2, -2, 2);
    place(world, ID.home3, -2, 6);
    // The lower-numbered helper would normally go ahead; as a defenceman he trails instead.
    player(world, ID.home2).position = 'D';
    giveTo(world, ID.home1);
    player(world, ID.home1).stagger = 2;
    play(world, 1.5);
    const carrier = player(world, ID.home1);
    expect(player(world, ID.home2).pos.x).toBeLessThan(carrier.pos.x);
    expect(player(world, ID.home3).pos.x).toBeGreaterThan(carrier.pos.x);
  });

  it('laneClear sees a defender standing in the way', () => {
    const world = setUp();
    clearIce(world, [ID.away1]);
    place(world, ID.away1, 5, 0.3);
    expect(laneClear(world, 0, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
    expect(laneClear(world, 0, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(true);
  });
});

describe('AI in the attacking zone: spreading out', () => {
  const P = positions.positions;
  const play = (world: World, seconds: number): SimEvent[] => {
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) events.push(...step(world, NO_INPUT, t));
    return events;
  };
  const apart = (world: World, a: number, b: number): number => {
    const p = player(world, a).pos;
    const q = player(world, b).pos;
    return Math.hypot(p.x - q.x, p.y - q.y);
  };

  it('the zone starts at the blue line, at either end', () => {
    expect(inZone(0, P.zoneLineX + 1)).toBe(true);
    expect(inZone(0, P.zoneLineX - 1)).toBe(false);
    expect(inZone(1, -P.zoneLineX - 1)).toBe(true);
    expect(inZone(1, P.zoneLineX + 1)).toBe(false);
  });

  it('a carrier out wide is the wing: the others take net-front and the point', () => {
    const world = setUp();
    const ahead = place(world, ID.home2, 16, 0);
    const behind = place(world, ID.home3, 11, 0);
    const posts = postsFor(0, { x: 15, y: P.wideY + 2 }, [ahead, behind]);
    expect(posts.get(ID.home2)).toBe('netFront');
    expect(posts.get(ID.home3)).toBe('point');
  });

  it('a carrier in the middle leaves the wing and the point', () => {
    const world = setUp();
    const ahead = place(world, ID.home2, 16, 3);
    const behind = place(world, ID.home3, 11, -3);
    const posts = postsFor(0, { x: 15, y: 1 }, [ahead, behind]);
    expect(posts.get(ID.home2)).toBe('wing');
    expect(posts.get(ID.home3)).toBe('point');
  });

  it('a defenceman takes the point even when he is the one further up ice', () => {
    const world = setUp();
    const ahead = place(world, ID.home2, 18, 0);
    const behind = place(world, ID.home3, 11, 0);
    ahead.position = 'D';
    behind.position = 'F';
    const posts = postsFor(0, { x: 15, y: 1 }, [ahead, behind]);
    expect(posts.get(ID.home2)).toBe('point');
    expect(posts.get(ID.home3)).toBe('wing');
  });

  it('the posts: net-front in the slot, the wing wide on the far side from the puck, the point inside the blue line', () => {
    const puck = { x: 15, y: 6 };
    const front = postSpot('netFront', 0, puck, t);
    const wing = postSpot('wing', 0, puck, t);
    const point = postSpot('point', 0, puck, t);
    // In front of the net, at the post away from the puck; dead centre when the puck is in the middle.
    expect(front).toEqual({ x: gx - P.netFrontDepth, y: -P.farPostY });
    expect(postSpot('netFront', 0, { x: 15, y: 0 }, t).y).toBe(0);
    expect(wing.y).toBe(-P.wingY);
    expect(wing.x).toBe(gx - P.wingDepth);
    expect(point.x).toBeGreaterThan(P.zoneLineX);
    expect(point.x).toBeLessThan(wing.x);
    // Mirrored for the team attacking the other way.
    expect(postSpot('netFront', 1, puck, t).x).toBe(-front.x);
    expect(postSpot('point', 1, puck, t).x).toBe(-point.x);
  });

  it('in play, the three attackers hold three different areas instead of crowding the net', () => {
    const world = setUp('spread');
    clearIce(world, [ID.home1, ID.home2, ID.home3]);
    // All three start bunched in front of the net; the carrier is held still on the wing.
    place(world, ID.home1, gx - 6, P.wideY + 2, 0);
    place(world, ID.home2, gx - 4, 1);
    place(world, ID.home3, gx - 5, -1);
    giveTo(world, ID.home1);
    // Looked at after a second and a half: long enough to get there, before the defenders arrive and take the puck.
    player(world, ID.home1).stagger = 3;
    play(world, 1.5);
    expect(apart(world, ID.home2, ID.home3)).toBeGreaterThan(6);
    expect(apart(world, ID.home1, ID.home2)).toBeGreaterThan(4);
    expect(apart(world, ID.home1, ID.home3)).toBeGreaterThan(4);
    // One is in front of the net and one has gone back to the point.
    const xs = [player(world, ID.home2).pos.x, player(world, ID.home3).pos.x].sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(P.zoneLineX + P.pointInset + 2);
    expect(xs[1]).toBeGreaterThan(gx - P.netFrontDepth - 3);
  });

  it('outside the zone nothing changes: one helper ahead in the far lane, one trailing', () => {
    const world = setUp('rush');
    clearIce(world, [ID.home1, ID.home2, ID.home3]);
    place(world, ID.home1, 0, 4, 0);
    place(world, ID.home2, -2, 2);
    place(world, ID.home3, -2, 6);
    giveTo(world, ID.home1);
    player(world, ID.home1).stagger = 2;
    play(world, 1.5);
    expect(player(world, ID.home2).pos.x).toBeGreaterThan(player(world, ID.home1).pos.x);
    expect(player(world, ID.home3).pos.x).toBeLessThan(player(world, ID.home1).pos.x);
  });

  describe('shots from distance', () => {
    const hard = aiLevel(1);
    /** The carrier at the point, beyond normal shooting range, thinking many times over. Returns the longest wind-up he chose. */
    const looks = (world: World): number => {
      const p = player(world, ID.home1);
      let longest = 0;
      for (let i = 0; i < 80; i++) {
        p.ai.shootSteps = 0;
        p.ai.passSteps = 0;
        think(world, p, t, hard);
        longest = Math.max(longest, p.ai.shootSteps);
      }
      return longest;
    };
    const atPoint = (seed: string): World => {
      const world = setUp(seed);
      clearIce(world, [ID.home1]);
      place(world, ID.home1, P.zoneLineX + 1, 0, 0);
      giveTo(world, ID.home1);
      return world;
    };

    it('the point is beyond normal range but inside long range for a sharp AI', () => {
      const range = gx - (P.zoneLineX + 1) - 0.9;
      expect(range).toBeGreaterThan(hard.shootRange);
      expect(range).toBeLessThan(hard.longShotRange);
      expect(aiLevel(0).longShotChance).toBeLessThan(hard.longShotChance);
    });

    it('with a clear lane he winds up and shoots', () => {
      const steps = looks(atPoint('long-clear'));
      expect(steps).toBe(2 + Math.round(hard.longShotCharge * t.shot.chargeTime * STEPS_PER_SECOND));
    });

    it('he plants his feet to wind up, instead of skating in as he charges', () => {
      const world = atPoint('long-plant');
      const p = player(world, ID.home1);
      for (let i = 0; i < 80 && p.ai.shootSteps === 0; i++) {
        p.ai.passSteps = 0;
        think(world, p, t, hard);
      }
      expect(p.ai.plant).toBe(true);
      const input = aiInput(world, p, t, hard);
      expect(input.shoot).toBe(true);
      expect(Math.hypot(input.moveX, input.moveY)).toBeCloseTo(P.plantTilt);
      // An ordinary shot from the slot is taken on the move.
      place(world, ID.home1, gx - 6, 0, 0);
      giveTo(world, ID.home1);
      p.ai.shootSteps = 0;
      think(world, p, t, hard);
      expect(p.ai.shootSteps).toBeGreaterThan(0);
      expect(p.ai.plant).toBe(false);
    });

    it('with a defender in the lane he does not', () => {
      const world = atPoint('long-blocked');
      place(world, ID.away1, gx - 6, 0);
      expect(looks(world)).toBe(0);
    });

    it('outside the zone he never tries one', () => {
      const world = setUp('long-outside');
      clearIce(world, [ID.home1]);
      place(world, ID.home1, P.zoneLineX - 3, 0, 0);
      giveTo(world, ID.home1);
      expect(looks(world)).toBe(0);
    });
  });
});
