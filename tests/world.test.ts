import { describe, expect, it } from 'vitest';
import { hitBoards } from '../src/sim/rink';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND } from '../src/sim/world';

const t = cloneTuning();
const FIVE_MINUTES = 5 * 60 * STEPS_PER_SECOND;

const snapshot = (w: World): string =>
  JSON.stringify({ tick: w.tick, players: w.players, puck: w.puck, score: w.score, phase: w.phase });

interface GameLog {
  world: World;
  counts: Record<SimEvent['type'], number>;
  history: string[];
  allInside: boolean;
}

/** Plays an all-AI game (3 skaters and a goalie a side) from a seed. */
const playGame = (seed: string, steps: number, keepHistory = false): GameLog => {
  const world = createWorld(t, seed, { human: false, levels: [0.5, 0.5] });
  const counts = { goal: 0, shot: 0, pass: 0, post: 0, pickup: 0, save: 0, check: 0 };
  const history: string[] = [];
  let allInside = true;
  for (let i = 0; i < steps; i++) {
    for (const event of step(world, NO_INPUT, t)) counts[event.type] += 1;
    if (keepHistory) history.push(snapshot(world));
    for (const body of [...world.players, world.puck]) {
      const copy = { x: body.pos.x, y: body.pos.y };
      hitBoards(copy, { x: 0, y: 0 }, 0, 0, t);
      if (Math.hypot(copy.x - body.pos.x, copy.y - body.pos.y) > 1e-6) allInside = false;
      if (!Number.isFinite(body.pos.x + body.pos.y + body.vel.x + body.vel.y)) allInside = false;
    }
  }
  return { world, counts, history, allInside };
};

describe('all-AI 3-on-3 game', () => {
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
  const games = seeds.map((seed) => playGame(seed, FIVE_MINUTES));

  it('both teams score over a handful of games', () => {
    const total = games.reduce((sum, g) => [sum[0]! + g.world.score[0], sum[1]! + g.world.score[1]], [0, 0]);
    console.log(
      'scores',
      games.map((g) => g.world.score.join('-')).join('  '),
      '| per game:',
      JSON.stringify(
        Object.fromEntries(
          Object.keys(games[0]!.counts).map((k) => [
            k,
            +(games.reduce((s, g) => s + g.counts[k as SimEvent['type']], 0) / games.length).toFixed(1),
          ]),
        ),
      ),
    );
    expect(total[0]).toBeGreaterThan(0);
    expect(total[1]).toBeGreaterThan(0);
  });

  it('uses every part of the game: shots, passes, saves, checks and pickups', () => {
    for (const kind of ['shot', 'pass', 'save', 'check', 'pickup'] as const) {
      expect(games.reduce((s, g) => s + g.counts[kind], 0)).toBeGreaterThan(0);
    }
  });

  it('keeps every player and the puck inside the rink, with finite numbers', () => {
    for (const game of games) expect(game.allInside).toBe(true);
  });

  it('replays exactly from the same seed, and differently from another', () => {
    const a = playGame('replay', 60 * STEPS_PER_SECOND, true);
    const b = playGame('replay', 60 * STEPS_PER_SECOND, true);
    const c = playGame('other', 60 * STEPS_PER_SECOND, true);
    expect(a.history).toEqual(b.history);
    expect(a.history[a.history.length - 1]).not.toEqual(c.history[c.history.length - 1]);
  });
});
