import { describe, expect, it } from 'vitest';
import { resolveCheck } from '../src/sim/check';
import { gameResult } from '../src/sim/match';
import { givePuck } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();

/** A scrimmage with every skater parked, so only what the test sets up happens. */
const setUp = (seed: string): World => {
  const world = createWorld(t, seed, { human: false, levels: [0.5, 0.5] });
  clearIce(world, []);
  for (const p of world.players) if (p.role === 'skater') p.stagger = 999;
  return world;
};

const run = (world: World, seconds: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) events.push(...step(world, NO_INPUT, t));
  return events;
};

/** Fires the puck into the empty side of the away net as if `shooter` had shot it. */
const scoreFor = (world: World, shooter: number): SimEvent[] => {
  player(world, ID.awayGoalie).pos = { x: 20, y: 10 };
  world.puck.carrier = null;
  world.puck.shotBy = shooter;
  world.puck.pos = { x: 20, y: 0.3 };
  world.puck.vel = { x: 30, y: 0 };
  return run(world, 0.2);
};

describe('goals and assists', () => {
  it('the last of the scoring team to have the puck gets the goal', () => {
    const world = setUp('goal');
    givePuck(world, player(world, ID.home1));
    const events = scoreFor(world, ID.home1);
    expect(events).toContainEqual({ type: 'goal', side: 1, team: 0, scorer: ID.home1, assists: [] });
    expect(player(world, ID.home1).stats.goals).toBe(1);
  });

  it('the two teammates who had it before him get assists, nearest first', () => {
    const world = setUp('assists');
    givePuck(world, player(world, ID.home2));
    givePuck(world, player(world, ID.home3));
    givePuck(world, player(world, ID.home1));
    const events = scoreFor(world, ID.home1);
    expect(events).toContainEqual({ type: 'goal', side: 1, team: 0, scorer: ID.home1, assists: [ID.home3, ID.home2] });
    expect(player(world, ID.home3).stats.assists).toBe(1);
    expect(player(world, ID.home2).stats.assists).toBe(1);
    expect(player(world, ID.home1).stats.assists).toBe(0);
  });

  it('assists do not reach back past the other team having the puck', () => {
    const world = setUp('reset');
    givePuck(world, player(world, ID.home2));
    givePuck(world, player(world, ID.away1));
    givePuck(world, player(world, ID.home1));
    const events = scoreFor(world, ID.home1);
    expect(events).toContainEqual({ type: 'goal', side: 1, team: 0, scorer: ID.home1, assists: [] });
  });

  it('passing back and forth does not give a player an assist on his own goal', () => {
    const world = setUp('give-and-go');
    givePuck(world, player(world, ID.home1));
    givePuck(world, player(world, ID.home2));
    givePuck(world, player(world, ID.home1));
    scoreFor(world, ID.home1);
    expect(player(world, ID.home1).stats).toMatchObject({ goals: 1, assists: 0 });
    expect(player(world, ID.home2).stats.assists).toBe(1);
  });

  it('the beaten goalie is charged with a goal against', () => {
    const world = setUp('against');
    givePuck(world, player(world, ID.home1));
    scoreFor(world, ID.home1);
    expect(player(world, ID.awayGoalie).stats.goalsAgainst).toBe(1);
    expect(player(world, ID.homeGoalie).stats.goalsAgainst).toBe(0);
  });

  it('an own goal counts on the scoreboard but nobody gets the goal', () => {
    const world = setUp('own-goal');
    givePuck(world, player(world, ID.away1));
    const events = scoreFor(world, ID.away1);
    expect(events).toContainEqual({ type: 'goal', side: 1, team: 0, scorer: null, assists: [] });
    expect(world.score).toEqual([1, 0]);
    expect(world.players.reduce((sum, p) => sum + p.stats.goals, 0)).toBe(0);
  });
});

describe('shots, saves and hits', () => {
  /** A home skater in the slot with the puck, free to act; he shoots straight at the set goalie. */
  const shooterInSlot = (seed: string): World => {
    const world = setUp(seed);
    const shooter = place(world, ID.home1, 12, 0, 0);
    shooter.stagger = 0;
    shooter.ai.thinkIn = 99;
    shooter.ai.shootSteps = 3;
    shooter.ai.aimX = 1;
    shooter.ai.aimY = 0;
    giveTo(world, ID.home1);
    return world;
  };

  it('a shot counts for the shooter, and the stop counts as a save for the goalie', () => {
    const world = shooterInSlot('shot');
    for (let i = 0; i < 60; i++) {
      world.puck.pos = { x: 12.9, y: 0.45 };
      step(world, NO_INPUT, t);
      if (world.puck.carrier === null) break;
    }
    player(world, ID.home1).stagger = 999;
    const events = run(world, 1);
    expect(player(world, ID.home1).stats.shots).toBe(1);
    expect(events.some((e) => e.type === 'save')).toBe(true);
    expect(player(world, ID.awayGoalie).stats.saves).toBe(1);
  });

  it('a loose puck or a pass that reaches the goalie is not a save', () => {
    const world = setUp('not-a-save');
    world.puck.pos = { x: 12, y: 0 };
    world.puck.vel = { x: 12, y: 0 };
    const events = run(world, 1.5);
    expect(events.some((e) => e.type === 'save')).toBe(true);
    expect(player(world, ID.awayGoalie).stats.saves).toBe(0);
  });

  it('a body check that lands is a hit; a poke check or a miss is not', () => {
    const sure = cloneTuning();
    sure.check.bodyBaseChance = 1;
    sure.check.pokeBaseChance = 1;
    sure.check.ratingSwing = 0;

    const body = setUp('hit');
    place(body, ID.away1, 0, 0);
    giveTo(body, ID.away1);
    place(body, ID.home1, -1.2, 0).vel = { x: 8, y: 0 };
    resolveCheck(body, player(body, ID.home1), true, sure, []);
    expect(player(body, ID.home1).stats.hits).toBe(1);

    const poke = setUp('poke');
    place(poke, ID.away1, 0, 0);
    giveTo(poke, ID.away1);
    place(poke, ID.home1, poke.puck.pos.x, -1.4, Math.PI / 2);
    resolveCheck(poke, player(poke, ID.home1), false, sure, []);
    expect(poke.puck.carrier).toBe(null);
    expect(player(poke, ID.home1).stats.hits).toBe(0);
  });
});

describe('time on ice and the result', () => {
  it('counts time for players on the ice and not for the bench', () => {
    const world = setUp('toi');
    run(world, 3);
    expect(player(world, ID.home1).stats.timeOnIce).toBeCloseTo(3, 5);
    expect(player(world, ID.homeGoalie).stats.timeOnIce).toBeCloseTo(3, 5);
    expect(player(world, 3).stats.timeOnIce).toBe(0);
  });

  it('the game result lists every dressed player with his stats', () => {
    const world = setUp('result');
    givePuck(world, player(world, ID.home2));
    givePuck(world, player(world, ID.home1));
    scoreFor(world, ID.home1);
    const result = gameResult(world);
    expect(result.score).toEqual([1, 0]);
    expect(result.finished).toBe(false);
    expect(result.winner).toBe(null);
    expect(result.players).toHaveLength(14);
    expect(result.players.find((p) => p.id === ID.home1)).toMatchObject({ team: 0, role: 'skater', line: 0, slot: 0, goals: 1 });
    expect(result.players.find((p) => p.id === ID.home2)).toMatchObject({ assists: 1 });
    expect(result.players.find((p) => p.id === ID.awayGoalie)).toMatchObject({ role: 'goalie', goalsAgainst: 1 });
  });
});
