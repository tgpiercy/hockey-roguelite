import { describe, expect, it } from 'vitest';
import { bossInfo, buildBoss } from '../src/core/bosses';
import { generateLeague } from '../src/core/generate';
import bosses from '../src/data/bosses.json';
import { aiLevel, think } from '../src/sim/ai';
import { stepChecking } from '../src/sim/check';
import { resolveLoosePuck } from '../src/sim/contact';
import { mayPull } from '../src/sim/lines';
import type { Modifier } from '../src/sim/modifiers';
import { ON_FIRE, onFire, stepMomentum } from '../src/sim/momentum';
import { goalLineX } from '../src/sim/rink';
import { screened, stepTips } from '../src/sim/tips';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type InputFrame, type SimEvent, type World } from '../src/sim/types';
import { createGame, createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';
import { uniformTeam } from './harness/harness';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);
const m = t.momentum;
const withMods = (modifiers: Modifier[]) => ({ ...uniformTeam(70), modifiers });

describe('momentum', () => {
  const fresh = (): World => createWorld(t, 'momentum', { human: false });
  const feed = (world: World, events: SimEvent[]): SimEvent[] => {
    stepMomentum(world, t, events, 0);
    return events;
  };

  it('fills from a goal, a big hit, a one-timer and a save, each by its own amount', () => {
    const world = fresh();
    feed(world, [{ type: 'check', player: ID.home1, target: ID.away1, kind: 'body', success: true, big: true }]);
    expect(world.teams[0].heat).toBeCloseTo(m.bigHit);
    feed(world, [{ type: 'shot', speed: 30, player: ID.home1, oneTimer: true }]);
    expect(world.teams[0].heat).toBeCloseTo(m.bigHit + m.oneTimer);
    feed(world, [{ type: 'save', goalie: ID.homeGoalie, frozen: true }]);
    expect(world.teams[0].heat).toBeCloseTo(m.bigHit + m.oneTimer + m.save);
    // An ordinary check and an ordinary shot add nothing.
    feed(world, [
      { type: 'check', player: ID.home1, target: ID.away1, kind: 'body', success: true },
      { type: 'shot', speed: 20, player: ID.home1 },
    ]);
    expect(world.teams[0].heat).toBeCloseTo(m.bigHit + m.oneTimer + m.save);
    expect(world.teams[1].heat).toBe(0);
  });

  it('a goal adds to the scorers and cuts the other team', () => {
    const world = fresh();
    world.teams[1].heat = 0.8;
    feed(world, [{ type: 'goal', side: 1, team: 0, scorer: ID.home1, assists: [] }]);
    expect(world.teams[0].heat).toBeCloseTo(m.goal);
    expect(world.teams[1].heat).toBeCloseTo(0.8 * (1 - m.concedeLoss));
  });

  it('drains over time', () => {
    const world = fresh();
    world.teams[0].heat = 0.5;
    stepMomentum(world, t, [], 10);
    expect(world.teams[0].heat).toBeCloseTo(0.5 - m.drainPerSecond * 10);
  });

  it('a full meter sets the team on fire once, empties, and the spell ends on time', () => {
    const world = fresh();
    const base = player(world, ID.home1).fx.shotPower;
    world.teams[0].heat = 0.99;
    const events = feed(world, [{ type: 'save', goalie: ID.homeGoalie, frozen: true }]);
    expect(events.filter((e) => e.type === 'fire')).toEqual([{ type: 'fire', team: 0 }]);
    expect(onFire(world, 0)).toBe(true);
    expect(onFire(world, 1)).toBe(false);
    expect(world.teams[0].heat).toBe(0);
    expect(player(world, ID.home1).fx.shotPower).toBeCloseTo(base + m.fireShotPower);
    // Nothing builds while it burns.
    feed(world, [{ type: 'goal', side: 1, team: 0, scorer: ID.home1, assists: [] }]);
    expect(world.teams[0].heat).toBe(0);
    for (let i = 0; i < STEPS_PER_SECOND * (m.fireSeconds + 0.5); i++) step(world, NO_INPUT, t);
    expect(world.teams[0].boosts.some((b) => b.id === ON_FIRE)).toBe(false);
    expect(player(world, ID.home1).fx.shotPower).toBeCloseTo(base);
  });
});

describe('screens and tips', () => {
  it('an attacker close in front of the goalie, on the line from the puck, screens him', () => {
    const world = createWorld(t, 'screen', { human: false });
    clearIce(world, [ID.home1]);
    const g = player(world, ID.awayGoalie);
    world.puck.carrier = null;
    world.puck.pos = { x: g.pos.x - 10, y: 0 };
    place(world, ID.home1, g.pos.x - 1.5, 0);
    expect(screened(g, world, t)).toBe(true);
    // Off to the side he is in nobody's way.
    place(world, ID.home1, g.pos.x - 1.5, 4);
    expect(screened(g, world, t)).toBe(false);
    // A defender standing there does not screen his own goalie.
    place(world, ID.away1, g.pos.x - 1.5, 0);
    expect(screened(g, world, t)).toBe(false);
  });

  const shotPast = (tipper: number): { world: World; events: SimEvent[] } => {
    const world = createWorld(t, 'tip', { human: false });
    clearIce(world, [ID.home1, tipper]);
    place(world, ID.home1, gx - 12, 3);
    // The goalie is over to one side, so the open corner is the other.
    const g = player(world, ID.awayGoalie);
    g.pos = { x: g.pos.x, y: 0.8 };
    place(world, tipper, gx - 4, 0.6);
    world.puck.carrier = null;
    world.puck.pos = { x: gx - 4.5, y: 1.2 };
    world.puck.vel = { x: 25, y: -1 };
    world.puck.shotBy = ID.home1;
    world.puck.lastTeam = 0;
    world.puck.touches = [ID.home1];
    const events: SimEvent[] = [];
    stepTips(world, t, events);
    return { world, events };
  };

  it('a shot passing a teammate near the net is redirected toward the open side, and he becomes the last to touch it', () => {
    const { world, events } = shotPast(ID.home2);
    expect(events).toEqual([{ type: 'tip', player: ID.home2 }]);
    expect(world.puck.tipped).toBe(true);
    // The goalie is at positive y, so the redirect heads for negative y.
    expect(world.puck.vel.y).toBeLessThan(-1.5);
    expect(world.puck.touches[world.puck.touches.length - 1]).toBe(ID.home2);
    // Only once.
    const again: SimEvent[] = [];
    stepTips(world, t, again);
    expect(again).toEqual([]);
  });

  it('a defender does not tip it in', () => {
    const { world, events } = shotPast(ID.away1);
    expect(events).toEqual([]);
    expect(world.puck.tipped).toBe(false);
  });
});

describe('give and go', () => {
  const pass: InputFrame = { ...NO_INPUT, pass: true };
  /** The human passes from home1 to home2, who is ahead of him with a clear lane. */
  const passed = (): World => {
    const world = createWorld(t, 'give-go', { levels: [1, 1] });
    clearIce(world, [ID.home1, ID.home2]);
    place(world, ID.home1, 0, 0, 0);
    place(world, ID.home2, 7, 3);
    giveTo(world, ID.home1);
    world.human!.controlled = ID.home1;
    step(world, { ...pass, moveX: 0.9, moveY: 0.4 }, t);
    const events = step(world, { ...NO_INPUT, moveX: 0.9, moveY: 0.4 }, t);
    expect(events.some((e) => e.type === 'pass' && e.player === ID.home1 && e.target === ID.home2)).toBe(true);
    return world;
  };

  it('control goes with the pass, and an offer to get it back is open for a moment', () => {
    const world = passed();
    expect(world.human!.controlled).toBe(ID.home2);
    expect(world.human!.giveGoOffer).toMatchObject({ passer: ID.home1, receiver: ID.home2 });
    for (let i = 0; i < STEPS_PER_SECOND * (t.giveGo.windowSeconds + 0.1); i++) step(world, NO_INPUT, t);
    expect(world.human!.giveGoOffer).toBeNull();
    expect(world.human!.giveGo).toBeNull();
  });

  it('pass pressed again keeps the human on the passer, and the receiver gives the puck back', () => {
    const world = passed();
    step(world, pass, t);
    expect(world.human!.controlled).toBe(ID.home1);
    expect(world.human!.giveGo).toMatchObject({ passer: ID.home1, receiver: ID.home2 });
    let returned = false;
    for (let i = 0; i < STEPS_PER_SECOND * t.giveGo.seconds && !returned; i++) {
      step(world, NO_INPUT, t);
      // The human stays on the passer the whole time, even while the receiver carries.
      if (world.human!.giveGo) expect(world.human!.controlled).toBe(ID.home1);
      returned = world.puck.carrier === ID.home1;
    }
    expect(returned).toBe(true);
    step(world, NO_INPUT, t);
    expect(world.human!.giveGo).toBeNull();
    expect(world.human!.controlled).toBe(ID.home1);
  });

  it('shoot, check or switch calls it off at once, so the player is never left without the puck carrier', () => {
    for (const button of ['shoot', 'check', 'switchPlayer'] as const) {
      const world = passed();
      step(world, pass, t);
      expect(world.human!.giveGo).not.toBeNull();
      // Let the receiver take the pass, with a defender in the lane so it does not come straight back.
      place(world, ID.away1, 3.5, 1.5);
      player(world, ID.away1).stagger = 10;
      for (let i = 0; i < 40 && world.puck.carrier !== ID.home2; i++) step(world, NO_INPUT, t);
      expect(world.puck.carrier).toBe(ID.home2);
      expect(world.human!.controlled).toBe(ID.home1);
      step(world, { ...NO_INPUT, [button]: true }, t);
      expect(world.human!.giveGo).toBeNull();
      expect(world.human!.controlled).toBe(ID.home2);
    }
  });

  it('it ends when the time runs out, and control goes back to the carrier', () => {
    const world = passed();
    step(world, pass, t);
    // A defender in the lane, so the puck cannot come back.
    place(world, ID.away1, 3.5, 1.5);
    player(world, ID.away1).stagger = 10;
    for (let i = 0; i < STEPS_PER_SECOND * (t.giveGo.seconds + 0.3); i++) step(world, NO_INPUT, t);
    expect(world.human!.giveGo).toBeNull();
  });
});

describe('pulling the goalie', () => {
  /** A game late in the last period with team 0 behind by `deficit`, the puck with team 0 up the ice. */
  const late = (deficit: number, human = false): World => {
    const world = createGame(t, 'pull', { human, teams: [uniformTeam(70), uniformTeam(70)], levels: [0.5, 0.5] });
    world.phase = 'play';
    world.faceoff = null;
    world.period = t.period.count;
    world.clock = t.pull.seconds - 5;
    world.score = [0, deficit];
    place(world, ID.home1, 5, 0, 0);
    giveTo(world, ID.home1);
    return world;
  };
  const skaters = (world: World, team: number): number => world.players.filter((p) => p.onIce && p.team === team && p.role === 'skater').length;
  const goalieOn = (world: World, id: number): boolean => player(world, id).onIce;

  it('may only happen late in regulation, behind by a goal or two', () => {
    expect(mayPull(late(1), 0, t)).toBe(true);
    expect(mayPull(late(t.pull.maxDeficit), 0, t)).toBe(true);
    expect(mayPull(late(t.pull.maxDeficit + 1), 0, t)).toBe(false);
    expect(mayPull(late(0), 0, t)).toBe(false);
    expect(mayPull(late(1), 1, t)).toBe(false);
    const early = late(1);
    early.clock = t.pull.seconds + 10;
    expect(mayPull(early, 0, t)).toBe(false);
    const firstPeriod = late(1);
    firstPeriod.period = 1;
    expect(mayPull(firstPeriod, 0, t)).toBe(false);
  });

  it('an AI team behind late takes its goalie off for a fourth skater; the team ahead does not', () => {
    const world = late(1);
    const events = step(world, NO_INPUT, t);
    expect(events).toContainEqual({ type: 'pull', team: 0, on: true });
    expect(goalieOn(world, ID.homeGoalie)).toBe(false);
    expect(skaters(world, 0)).toBe(4);
    expect(goalieOn(world, ID.awayGoalie)).toBe(true);
    expect(skaters(world, 1)).toBe(3);
    expect(world.teams[0].pulled).toBe(true);
  });

  it('the goalie is back, and the extra skater off, at the faceoff after a goal', () => {
    const world = late(1);
    step(world, NO_INPUT, t);
    // The other team scores into the empty net.
    world.puck.carrier = null;
    world.puck.pos = { x: -gx + 0.4, y: 0 };
    world.puck.vel = { x: -20, y: 0 };
    world.puck.shotBy = ID.away1;
    world.puck.lastTeam = 1;
    let scored = false;
    for (let i = 0; i < 30 && !scored; i++) scored = step(world, NO_INPUT, t).some((e) => e.type === 'goal' && e.team === 1);
    expect(scored).toBe(true);
    for (let i = 0; i < STEPS_PER_SECOND * (t.game.goalPauseSeconds + 0.5) && world.phase !== 'faceoff'; i++) step(world, NO_INPUT, t);
    expect(world.phase).toBe('faceoff');
    expect(goalieOn(world, ID.homeGoalie)).toBe(true);
    expect(skaters(world, 0)).toBe(3);
    expect(world.teams[0].pulled).toBe(false);
  });

  it('the human pulls and returns his own goalie on the button, and never automatically', () => {
    const world = late(1, true);
    step(world, NO_INPUT, t);
    expect(goalieOn(world, ID.homeGoalie)).toBe(true);
    expect(step(world, { ...NO_INPUT, pullGoalie: true }, t)).toContainEqual({ type: 'pull', team: 0, on: true });
    expect(skaters(world, 0)).toBe(4);
    step(world, NO_INPUT, t);
    expect(step(world, { ...NO_INPUT, pullGoalie: true }, t)).toContainEqual({ type: 'pull', team: 0, on: false });
    expect(goalieOn(world, ID.homeGoalie)).toBe(true);
  });

  it('the button does nothing when it is not allowed', () => {
    const world = late(0, true);
    expect(step(world, { ...NO_INPUT, pullGoalie: true }, t).some((e) => e.type === 'pull')).toBe(false);
  });
});

describe('boss tricks', () => {
  it('every boss has a trick in words, and ordinary players have none of the abilities', () => {
    for (const boss of bosses) expect(boss.trick.length).toBeGreaterThan(30);
    const world = createWorld(t, 'plain', { human: false });
    for (const p of world.players) {
      expect(p.fx.gainBurst).toBe(0);
      expect(p.fx.alwaysKnockdown).toBe(0);
      expect(p.fx.fullPress).toBe(0);
      expect(p.fx.unstoppableCharged).toBe(0);
    }
  });

  it('the Wall: three automatic saves a period', () => {
    const world = createWorld(t, 'wall', { human: false, teams: [uniformTeam(70), withMods(bossInfo('the-wall').modifiers)] });
    expect(player(world, ID.awayGoalie).goalie!.fx.periodAutoSaves).toBe(3);
  });

  it('the Gale: winning the puck in their own end gives a burst of speed; winning it up the ice does not', () => {
    const pickup = (x: number): number => {
      const world = createWorld(t, 'gale', { human: false, teams: [uniformTeam(70), withMods(bossInfo('speed-demons').modifiers)] });
      clearIce(world, [ID.away1]);
      place(world, ID.away1, x, 0);
      world.puck.carrier = null;
      world.puck.pos = { x: x + 0.3, y: 0 };
      world.puck.vel = { x: 0, y: 0 };
      resolveLoosePuck(world, t, []);
      expect(world.puck.carrier).toBe(ID.away1);
      return player(world, ID.away1).burst;
    };
    // Team 1 defends the net at +x.
    expect(pickup(12)).toBe(2);
    expect(pickup(-12)).toBe(0);
  });

  it('the Hammers: a body check that lands is a knock-down at any speed', () => {
    const sure = cloneTuning();
    sure.check.bodyBaseChance = 1;
    sure.check.ratingSwing = 0;
    const hit = (mods: Modifier[]): boolean => {
      const world = createWorld(sure, 'hammers', { human: false, teams: [uniformTeam(70), withMods(mods)] });
      clearIce(world, [ID.home1, ID.away1]);
      place(world, ID.home1, 0, 0, 0);
      giveTo(world, ID.home1);
      const checker = place(world, ID.away1, 1.2, 0, Math.PI);
      checker.vel = { x: -(sure.check.minClosingSpeed + 0.5), y: 0 };
      const events: SimEvent[] = [];
      stepChecking(world, checker, { ...NO_INPUT, check: true }, sure, events);
      expect(events[0]).toMatchObject({ kind: 'body', success: true });
      return player(world, ID.home1).knockedDown;
    };
    expect(hit(bossInfo('bruisers').modifiers)).toBe(true);
    expect(hit([])).toBe(false);
  });

  it('the Marathon: with you carrying in your own end, a defender comes for you instead of dropping back', () => {
    const follow = (mods: Modifier[]): string => {
      const world = createWorld(t, 'press', { human: false, levels: [0.5, 0.5], teams: [uniformTeam(70), withMods(mods)] });
      clearIce(world, [ID.home1, ID.home2, ID.away1, ID.away2]);
      // Team 0 carries deep in its own end; another of its skaters is nearer the far defender, who would normally mark him.
      place(world, ID.home1, -15, 0, 0);
      place(world, ID.home2, -2, 6);
      giveTo(world, ID.home1);
      place(world, ID.away1, -12, 1);
      const far = place(world, ID.away2, 2, 6);
      think(world, far, t, aiLevel(0.5));
      return far.ai.follow;
    };
    expect(follow(bossInfo('iron-lungs').modifiers)).toBe('carrier');
    expect(follow([])).toBe('point');
  });

  it('the Marksmen: the star, and only the star, has the shot that cannot be saved', () => {
    const league = generateLeague('marksmen');
    const boss = buildBoss(league, 'snipers', 0, 'seed');
    const marked = (boss.setup.skaterModifiers ?? []).map((mods) => mods.some((mod) => mod.stat === 'unstoppableCharged'));
    expect(marked.filter(Boolean)).toHaveLength(1);
    expect(marked.indexOf(true)).toBeLessThan(3);
    for (const id of ['the-wall', 'speed-demons', 'bruisers', 'iron-lungs']) expect(buildBoss(league, id, 0, 'seed').setup.skaterModifiers).toBeUndefined();
  });

  it('the Marksmen: his full wind-up goes through the goalie; a quick shot of his is stopped like any other', () => {
    const shoot = (holdSeconds: number): { unstoppable: boolean; scored: boolean } => {
      const star: Modifier[] = [{ stat: 'unstoppableCharged', op: 'add', value: 1 }];
      const world = createWorld(t, 'laser', { teams: [{ ...uniformTeam(70), skaterModifiers: [star, [], [], [], [], []] }, uniformTeam(70)] });
      clearIce(world, [ID.home1]);
      const g = player(world, ID.awayGoalie);
      place(world, ID.home1, gx - 7, g.pos.y, 0);
      giveTo(world, ID.home1);
      world.human!.controlled = ID.home1;
      t.aimAssist.strength = 0;
      for (let i = 0; i < Math.round(holdSeconds * STEPS_PER_SECOND); i++) step(world, { ...NO_INPUT, shoot: true }, t);
      step(world, NO_INPUT, t);
      const unstoppable = world.puck.unstoppable;
      let scored = false;
      let saved = false;
      for (let i = 0; i < 40 && !scored && !saved; i++) {
        const events = step(world, NO_INPUT, t);
        scored = events.some((e) => e.type === 'goal');
        saved = events.some((e) => e.type === 'save');
      }
      t.aimAssist.strength = cloneTuning().aimAssist.strength;
      return { unstoppable, scored };
    };
    // Straight at the goalie both times.
    expect(shoot(t.shot.chargeTime + 0.1)).toEqual({ unstoppable: true, scored: true });
    expect(shoot(0.05)).toEqual({ unstoppable: false, scored: false });
  });
});
