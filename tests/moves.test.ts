import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { teamOf, userTeam } from '../src/core/league';
import { dress } from '../src/core/matchup';
import { PLAY_STYLES, playStyle, styleInfo } from '../src/core/playStyle';
import positions from '../src/data/ai.json';
import { cuesFor } from '../src/game/soundMap';
import { aiLevel, styleOf, think } from '../src/sim/ai';
import { goalieTarget, makeSave } from '../src/sim/goalie';
import { goalLineX } from '../src/sim/rink';
import { shotSpeed } from '../src/sim/shot';
import { distToSegment } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';
import { uniformTeam } from './harness/harness';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);
const P = positions.positions;
type Shot = Extract<SimEvent, { type: 'shot' }>;
const shotIn = (events: SimEvent[]): Shot | undefined => events.find((e): e is Shot => e.type === 'shot');

describe('one-timer', () => {
  const shoot: InputFrame = { ...NO_INPUT, shoot: true };
  /** The human's skater in the slot with a pass a step away from his stick. */
  const passArriving = (): World => {
    const world = createWorld(t, 'one-timer');
    clearIce(world, [ID.home1]);
    place(world, ID.home1, gx - 8, 0, 0);
    world.puck.pos = { x: gx - 7.5, y: 0 };
    world.puck.vel = { x: -1, y: 0 };
    world.puck.passTarget = ID.home1;
    world.puck.lastTeam = 0;
    return world;
  };
  const power = player(createWorld(t, 'p'), ID.home1).fx.shotPower;
  const full = shotSpeed(t.shot.chargeTime, power, t) * t.shot.oneTimerPower;

  it('shoot held as the pass arrives: it goes first-touch, as hard as a full wind-up', () => {
    const world = passArriving();
    const arrive = step(world, shoot, t);
    expect(arrive.some((e) => e.type === 'pickup' && e.player === ID.home1)).toBe(true);
    expect(shotIn(arrive)).toBeUndefined();
    const shot = shotIn(step(world, shoot, t));
    expect(shot).toMatchObject({ player: ID.home1, oneTimer: true });
    expect(shot?.speed).toBeCloseTo(full);
    expect(world.puck.carrier).toBe(null);
  });

  it('shoot not held as it arrives: he just takes the pass', () => {
    const world = passArriving();
    step(world, NO_INPUT, t);
    expect(shotIn(step(world, NO_INPUT, t))).toBeUndefined();
    expect(world.puck.carrier).toBe(ID.home1);
  });

  it('a quick tap inside the window is a one-timer; after the window it is an ordinary tap', () => {
    const tap = (wait: number): Shot | undefined => {
      const world = passArriving();
      step(world, NO_INPUT, t);
      for (let i = 0; i < Math.round(wait * STEPS_PER_SECOND); i++) step(world, NO_INPUT, t);
      step(world, shoot, t);
      return shotIn(step(world, NO_INPUT, t));
    };
    const quick = tap(0.1);
    expect(quick?.oneTimer).toBe(true);
    expect(quick?.speed).toBeCloseTo(full);
    const late = tap(t.shot.oneTimerWindow + 0.2);
    expect(late?.oneTimer).toBeUndefined();
    expect(late?.speed).toBeCloseTo(shotSpeed(0, power, t));
    expect(full).toBeGreaterThan(shotSpeed(0, power, t) * 1.3);
  });

  it('the AI fires a pass it receives in the slot straight back out', () => {
    const world = createWorld(t, 'ai-one-timer', { human: false, levels: [1, 1] });
    clearIce(world, [ID.home1]);
    const p = place(world, ID.home1, gx - 7, 0, 0);
    giveTo(world, ID.home1);
    p.oneTimer = t.shot.oneTimerWindow;
    think(world, p, t, aiLevel(1));
    // No wind-up: two steps, held then let go.
    expect(p.ai.shootSteps).toBe(2);
  });
});

describe('rebounds and the goalie', () => {
  it('a shot too hard to hold comes back out in front of the net, pulled toward the slot', () => {
    const still = cloneTuning();
    still.goalie.reboundScatterDegrees = 0;
    const world = createWorld(still, 'rebound', { human: false });
    const g = player(world, ID.awayGoalie);
    // The puck reaches him from well out to the side, far too fast to freeze.
    world.puck.pos = { x: g.pos.x - 0.2, y: g.pos.y + 0.6 };
    world.puck.vel = { x: 30, y: -10 };
    world.puck.shotBy = ID.home1;
    world.puck.carrier = null;
    const events: SimEvent[] = [];
    makeSave(g, world, still, events);
    expect(events[0]).toMatchObject({ type: 'save', frozen: false });
    // Team 1's goalie: up the ice is toward negative x.
    expect(world.puck.vel.x).toBeLessThan(0);
    const out = Math.atan2(world.puck.vel.y, -world.puck.vel.x);
    const straightAway = Math.atan2(0.6, 0.2);
    expect(Math.abs(out)).toBeLessThan(Math.abs(straightAway));
  });

  it('comes out further to cut the angle on a carrier straight in front than on one out wide', () => {
    const depthFor = (y: number): number => {
      const world = createWorld(t, 'challenge', { human: false });
      clearIce(world, [ID.home1]);
      place(world, ID.home1, gx - 8, y, 0);
      giveTo(world, ID.home1);
      const g = player(world, ID.awayGoalie);
      const target = goalieTarget(g, world, t);
      return Math.hypot(target.x - gx, target.y);
    };
    expect(depthFor(0)).toBeGreaterThan(depthFor(t.goalie.challengeHalfWidth + 3) + t.goalie.challengeDepth * 0.5);
  });
});

describe('AI defence and support', () => {
  const play = (world: World, seconds: number): void => {
    for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) step(world, NO_INPUT, t);
  };

  it('with the puck in our zone, a defender who is not pressing stands between the carrier and the net', () => {
    const world = createWorld(t, 'slot-guard', { human: false, levels: [0.5, 0.5] });
    // Team 1 attacks the net at -gx. Its carrier is held still out on the wing.
    place(world, ID.away1, -gx + 9, 7, Math.PI);
    place(world, ID.away2, -2, -8);
    place(world, ID.away3, -2, 8);
    giveTo(world, ID.away1);
    for (const id of [ID.away1, ID.away2, ID.away3]) player(world, id).stagger = 3;
    place(world, ID.home1, -gx + 10, 5);
    place(world, ID.home2, -6, -4);
    place(world, ID.home3, -6, 2);
    play(world, 1.6);
    const carrier = player(world, ID.away1).pos;
    const net = { x: -gx, y: 0 };
    const guards = [ID.home2, ID.home3].map((id) => player(world, id).pos);
    const nearestToLane = Math.min(...guards.map((g) => distToSegment(g, carrier, net)));
    expect(nearestToLane).toBeLessThan(1.5);
    // And he is in front of the net, not out by the carrier.
    const guard = guards.find((g) => distToSegment(g, carrier, net) === nearestToLane);
    expect(Math.hypot((guard?.x ?? 0) - net.x, guard?.y ?? 0)).toBeLessThan(P.guardDepth + 2);
  });

  it('a teammate whose spot is covered slides to one side until the pass is on', () => {
    const lv = aiLevel(0.5);
    const targetFor = (covered: boolean): { x: number; y: number } => {
      const world = createWorld(t, 'get-open', { human: false, levels: [0.5, 0.5] });
      clearIce(world, [ID.home1, ID.home2, ID.home3]);
      // The carrier is out wide, so the others take net-front and the point.
      place(world, ID.home1, gx - 6, 8, 0);
      const front = place(world, ID.home2, gx - 5, 0);
      place(world, ID.home3, 11, 0);
      giveTo(world, ID.home1);
      if (covered) place(world, ID.away1, gx - P.netFrontDepth, -P.farPostY);
      think(world, front, t, lv);
      return { x: front.ai.targetX, y: front.ai.targetY };
    };
    const open = targetFor(false);
    const moved = targetFor(true);
    expect(open.y).toBeCloseTo(-P.farPostY);
    expect(Math.abs(moved.y - open.y)).toBeCloseTo(P.getOpenShift);
    expect(moved.x).toBeCloseTo(open.x);
  });
});

describe('team styles', () => {
  it('a team always plays the same style, and a league has all three', () => {
    expect(PLAY_STYLES.map((s) => s.id).sort()).toEqual(['cycle', 'dump', 'rush']);
    expect(playStyle('Greyport Tinkers')).toBe(playStyle('Greyport Tinkers'));
    const league = generateLeague('styles');
    const seen = new Set(league.teams.map((team) => playStyle(team.name)));
    expect(seen.size).toBe(3);
    for (const id of seen) expect(styleInfo(id)?.describe.length).toBeGreaterThan(10);
    expect(styleInfo(undefined)).toBeNull();
  });

  it('opponents are dressed with their style; your own team has no leaning', () => {
    const league = generateLeague('dress-style');
    const mine = dress(league, userTeam(league));
    const other = league.teams.find((team) => team.id !== league.userTeamId)!;
    const theirs = dress(league, teamOf(league, other.id));
    expect(mine?.setup.style).toBeUndefined();
    expect(theirs?.setup.style).toBe(playStyle(other.name));
  });

  it('the style reaches the ice, and shifts how readily a team passes and shoots from distance', () => {
    const world = createWorld(t, 'style', { human: false, teams: [{ ...uniformTeam(70), style: 'cycle' }, uniformTeam(70)] });
    expect(styleOf(world, 0).name).toBe('Cycle');
    expect(styleOf(world, 0).pass).toBeGreaterThan(1);
    expect(styleOf(world, 1)).toMatchObject({ pass: 1, longShot: 1, dump: 0 });
    expect(positions.styles.rush.pass).toBeLessThan(1);
  });

  it('dump and chase: pressured short of the zone, it fires the puck into the far corner; a rush team never does', () => {
    const dumps = (style: string): number => {
      const world = createWorld(t, `dump-${style}`, { human: false, levels: [1, 1], teams: [{ ...uniformTeam(70), style }, uniformTeam(70)] });
      clearIce(world, [ID.home1, ID.away1]);
      const p = place(world, ID.home1, P.dumpFromX + 2, 0, 0);
      giveTo(world, ID.home1);
      // A defender right on him, a little to one side.
      place(world, ID.away1, P.dumpFromX + 3.5, 1);
      let count = 0;
      for (let i = 0; i < 60; i++) {
        p.ai.shootSteps = 0;
        p.ai.passSteps = 0;
        think(world, p, t, aiLevel(1));
        // A dump is a quick shot aimed away from the net mouth, toward the corner on the side away from the defender.
        if (p.ai.shootSteps === 2 && p.ai.aimY < -0.2) count++;
      }
      return count;
    };
    expect(dumps('dump')).toBeGreaterThan(10);
    expect(dumps('rush')).toBe(0);
  });
});

describe('sounds for the new moves', () => {
  const world = createWorld(t, 'sound', { human: false });
  const gain = (e: SimEvent): number => cuesFor([e], 0, t).find((c) => c.name === 'hit')?.gain ?? 0;

  it('a big hit is louder than an ordinary one, and a deke makes a sound', () => {
    const hit: SimEvent = { type: 'check', player: 0, target: 7, kind: 'body', success: true };
    expect(gain({ ...hit, big: true })).toBeGreaterThan(gain(hit));
    expect(cuesFor([{ type: 'deke', player: 0 }], 0, t).length).toBe(1);
    expect(world.players.length).toBeGreaterThan(0);
  });
});
