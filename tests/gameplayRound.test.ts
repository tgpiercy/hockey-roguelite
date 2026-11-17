import { describe, expect, it } from 'vitest';
import { bossInfo } from '../src/core/bosses';
import ai from '../src/data/ai.json';
import { aiLevel, chooseState, lateMood, openSpot, scramble, think } from '../src/sim/ai';
import { makeSave, shieldsLeft } from '../src/sim/goalie';
import type { Modifier } from '../src/sim/modifiers';
import { goalLineX } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import type { World } from '../src/sim/types';
import { createGame, createWorld, type TeamSetup } from '../src/sim/world';
import { uniformTeam } from './harness/harness';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);
const P = ai.positions;
const lv = aiLevel(0.5);
const styled = (style: string): TeamSetup => ({ ...uniformTeam(70), style });

describe('a second man to a loose puck in front of a net', () => {
  const loose = (x: number): World => {
    const world = createWorld(t, 'scramble', { human: false, levels: [0.5, 0.5] });
    clearIce(world, [ID.home1, ID.home2, ID.home3]);
    place(world, ID.home1, x - 1, 0);
    place(world, ID.home2, x - 3, 2);
    place(world, ID.home3, x - 20, -6);
    world.puck.carrier = null;
    world.puck.pos = { x, y: 0 };
    world.puck.vel = { x: 0, y: 0 };
    return world;
  };

  it('in front of the net the nearest two go for it; the third does not', () => {
    const world = loose(gx - 4);
    expect(scramble(world.puck.pos, t)).toBe(true);
    expect(chooseState(world, player(world, ID.home1), t)).toBe('chase');
    expect(chooseState(world, player(world, ID.home2), t)).toBe('chase');
    expect(chooseState(world, player(world, ID.home3), t)).not.toBe('chase');
  });

  it('anywhere else only the nearest goes', () => {
    const world = loose(0);
    expect(scramble(world.puck.pos, t)).toBe(false);
    expect(chooseState(world, player(world, ID.home1), t)).toBe('chase');
    expect(chooseState(world, player(world, ID.home2), t)).not.toBe('chase');
  });

  it('a shot on its way to the net is not a loose puck: only the nearest reacts', () => {
    const world = loose(gx - 4);
    world.puck.shotBy = ID.away1;
    expect(chooseState(world, player(world, ID.home2), t)).not.toBe('chase');
  });

  it('a second man too far away to matter stays where he is', () => {
    const world = loose(gx - 4);
    place(world, ID.home2, gx - 4 - P.scrambleReach - 2, 0);
    expect(chooseState(world, player(world, ID.home2), t)).not.toBe('chase');
  });
});

describe('getting open for a pass', () => {
  const setUp = (): World => {
    const world = createWorld(t, 'open', { human: false, levels: [0.5, 0.5] });
    clearIce(world, [ID.home1]);
    place(world, ID.home1, gx - 6, 8);
    return world;
  };
  const from = { x: gx - 6, y: 8 };
  const spot = { x: gx - P.netFrontDepth, y: -P.farPostY };

  it('his own spot, when the pass is on there', () => {
    expect(openSpot(setUp(), 0, from, spot, t)).toEqual(spot);
  });

  it('to one side when a defender stands on it', () => {
    const world = setUp();
    place(world, ID.away1, spot.x, spot.y);
    const moved = openSpot(world, 0, from, spot, t);
    expect(moved.x).toBeCloseTo(spot.x);
    expect(Math.abs(moved.y - spot.y)).toBeCloseTo(P.getOpenShift);
  });

  it('a step out from the net when both sides are covered as well', () => {
    const world = setUp();
    place(world, ID.away1, spot.x, spot.y);
    place(world, ID.away2, spot.x, spot.y + P.getOpenShift);
    place(world, ID.away3, spot.x, spot.y - P.getOpenShift);
    const moved = openSpot(world, 0, from, spot, t);
    expect(moved.x).toBeCloseTo(spot.x - P.getOpenBack);
  });

  it("a person's man at the net does not stand behind a defender once the puck is in the zone", () => {
    const targetFor = (covered: boolean): { x: number; y: number } => {
      const world = createWorld(t, 'open-person', { levels: [0.5, 0.5] });
      clearIce(world, [ID.home1, ID.home2, ID.home3]);
      place(world, ID.home1, gx - 6, 8);
      giveTo(world, ID.home1);
      world.human!.controlled = ID.home1;
      const front = place(world, ID.home2, gx - 6, 0);
      place(world, ID.home3, 8, 0);
      if (covered) place(world, ID.away1, spot.x, spot.y);
      think(world, front, t, lv);
      return { x: front.ai.targetX, y: front.ai.targetY };
    };
    expect(targetFor(false)).toEqual(spot);
    expect(targetFor(true)).not.toEqual(spot);
  });
});

describe('the three styles play differently', () => {
  it('each says how it runs the net, holds the puck, checks and hunts', () => {
    for (const [id, s] of Object.entries(ai.styles)) {
      expect(typeof s.netRun, id).toBe('boolean');
      expect(s.carry, id).toBeGreaterThan(0);
      expect(s.check, id).toBeGreaterThan(0);
      expect(s.chasers, id).toBeGreaterThanOrEqual(1);
      expect(s.describe.length, id).toBeGreaterThan(20);
    }
    expect(ai.styles.rush.netRun).toBe(true);
    expect(ai.styles.cycle.carry).toBeGreaterThan(ai.styles.rush.carry);
    expect(ai.styles.dump.chasers).toBe(2);
    expect(ai.styles.dump.check).toBeGreaterThan(ai.styles.cycle.check);
  });

  /** Where the first man without the puck heads while his team-mate carries it up the ice, short of the zone. */
  const helperTarget = (style: string): number => {
    const world = createWorld(t, `run-${style}`, { human: false, levels: [0.5, 0.5], teams: [styled(style), uniformTeam(70)] });
    clearIce(world, [ID.home1, ID.home2, ID.home3]);
    place(world, ID.home1, P.netRunFromX + 1, 4);
    giveTo(world, ID.home1);
    const helper = place(world, ID.home2, P.netRunFromX, -4);
    place(world, ID.home3, 0, 0);
    think(world, helper, t, lv);
    return helper.ai.targetX;
  };

  it('a rushing team sends a man to the front of the net before the puck is in the zone; a cycling team does not', () => {
    expect(helperTarget('rush')).toBeCloseTo(gx - P.netFrontDepth);
    expect(helperTarget('cycle')).toBeLessThan(gx - P.netFrontDepth - 2);
  });

  /** How many of a team go straight for a carrier deep in his own end. */
  const hunters = (style: string): number => {
    const world = createWorld(t, `hunt-${style}`, { human: false, levels: [0.5, 0.5], teams: [styled(style), uniformTeam(70)] });
    place(world, ID.away1, gx - 6, 0);
    place(world, ID.away2, gx - 12, -6);
    place(world, ID.away3, gx - 12, 6);
    giveTo(world, ID.away1);
    const mine = [place(world, ID.home1, gx - 12, 0), place(world, ID.home2, gx - 16, 3), place(world, ID.home3, 0, -3)];
    for (const p of mine) think(world, p, t, lv);
    return mine.filter((p) => p.ai.follow === 'carrier').length;
  };

  it('the dullest opponents never hunt in twos', () => {
    const world = createWorld(t, 'hunt-dull', { human: false, levels: [0, 0], teams: [styled('dump'), uniformTeam(70)] });
    place(world, ID.away1, gx - 6, 0);
    giveTo(world, ID.away1);
    const mine = [place(world, ID.home1, gx - 12, 0), place(world, ID.home2, gx - 16, 3), place(world, ID.home3, 0, -3)];
    for (const p of mine) think(world, p, t, aiLevel(0));
    expect(mine.filter((p) => p.ai.follow === 'carrier').length).toBe(1);
  });

  it('dump and chase hunts in twos in the other end; the others send one', () => {
    expect(hunters('dump')).toBe(2);
    expect(hunters('rush')).toBe(1);
    expect(hunters('cycle')).toBe(1);
  });
});

describe('late in the last period the score tells a team what to do', () => {
  const late = (score: [number, number], human = false): World => {
    const world = createGame(t, 'late', { human, levels: human ? [null, 0.5] : [0.5, 0.5], teams: [uniformTeam(70), uniformTeam(70)] });
    world.phase = 'play';
    world.period = t.period.count;
    world.clock = ai.late.seconds - 1;
    world.score = score;
    return world;
  };

  it('behind it pushes, ahead it protects, level it does neither', () => {
    expect(lateMood(late([1, 2]), 0, t)).toBe('push');
    expect(lateMood(late([1, 2]), 1, t)).toBe('protect');
    expect(lateMood(late([2, 2]), 0, t)).toBeNull();
  });

  it('not before the last minute, not in an earlier period, not in overtime', () => {
    const early = late([1, 2]);
    early.clock = ai.late.seconds + 5;
    expect(lateMood(early, 0, t)).toBeNull();
    const second = late([1, 2]);
    second.period = t.period.count - 1;
    expect(lateMood(second, 0, t)).toBeNull();
    const extra = late([1, 2]);
    extra.overtime = true;
    expect(lateMood(extra, 0, t)).toBeNull();
  });

  it("a team a person plays on is never told: its tactics are the person's", () => {
    expect(lateMood(late([1, 2], true), 0, t)).toBeNull();
    expect(lateMood(late([1, 2], true), 1, t)).toBe('protect');
  });

  it('a team protecting a lead waits at its own blue line when the other side carries out of its end', () => {
    const world = late([0, 1]);
    place(world, ID.home1, -gx + 8, 0);
    giveTo(world, ID.home1);
    const waiting = place(world, ID.away1, -gx + 14, 0);
    think(world, waiting, t, lv);
    expect(waiting.ai.follow).toBe('point');
    expect(waiting.ai.targetX).toBeCloseTo(P.zoneLineX);
  });
});

describe('breaking out against a forecheck', () => {
  const helperTarget = (pressers: number, human = true): number => {
    const world = createWorld(t, `stretch-${pressers}`, human ? { levels: [0.5, 0.5] } : { human: false, levels: [0.5, 0.5] });
    clearIce(world, [ID.home1, ID.home2, ID.home3, ID.away1, ID.away2, ID.away3]);
    place(world, ID.home1, -gx + 8, 2);
    giveTo(world, ID.home1);
    const helper = place(world, ID.home2, -gx + 10, -4);
    place(world, ID.home3, -gx + 5, 0);
    [ID.away1, ID.away2, ID.away3].forEach((id, i) => place(world, id, i < pressers ? -gx + 12 : 8, (i - 1) * 5));
    think(world, helper, t, lv);
    return helper.ai.targetX;
  };

  it("on a person's team, with two of theirs in our half, the first man goes long, over centre", () => {
    expect(helperTarget(2)).toBeCloseTo(P.stretchX);
  });

  it('a team with nobody at the controls keeps its man near', () => {
    expect(helperTarget(2, false)).toBeCloseTo(-gx + 8 + P.supportAhead);
  });

  it('with one he stays a few strides ahead of the puck', () => {
    expect(helperTarget(1)).toBeCloseTo(-gx + 8 + P.supportAhead);
  });
});

describe("the Wall's shields are spent by any shot on goal", () => {
  /** A shot from the other team arriving at this goalie, slow enough to hold or fast enough to come back out. */
  const saveBy = (mods: Modifier[]): { world: World; left: () => number } => {
    const world = createWorld(t, 'shields', { human: false, teams: [uniformTeam(70), { ...uniformTeam(70), modifiers: mods }] });
    const goalie = player(world, ID.awayGoalie);
    const shoot = (): void => {
      world.puck.carrier = null;
      world.puck.pos = { x: goalie.pos.x - 0.5, y: 0 };
      world.puck.vel = { x: 20, y: 0 };
      world.puck.shotBy = ID.home1;
      makeSave(goalie, world, t, []);
    };
    shoot();
    return { world, left: () => shieldsLeft(goalie, world) };
  };

  it('a save he makes by himself uses one up', () => {
    const wall = bossInfo('the-wall').modifiers as Modifier[];
    expect(wall.some((m) => m.stat === 'shieldBurn')).toBe(true);
    expect(saveBy(wall).left()).toBe(2);
  });

  it('and they come back with the next period', () => {
    const { world, left } = saveBy(bossInfo('the-wall').modifiers as Modifier[]);
    world.period += 1;
    expect(left()).toBe(3);
  });

  it('the artifact of the same kind is not spent by a save: it waits for a shot that beats him', () => {
    expect(saveBy([{ stat: 'periodAutoSaves', op: 'add', value: 1 }]).left()).toBe(1);
  });
});
