import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { createRng } from '../src/core/rng';
import {
  availableStops,
  buy,
  chooseEvent,
  currentStop,
  endSeason,
  eventInfo,
  leaveShop,
  matchup,
  newFranchise,
  pickArtifact,
  recordGame,
  setLoadout,
  shopPrice,
  startSeason,
  train,
  travel,
  type Franchise,
} from '../src/core/season';
import rules from '../src/data/season.json';
import { gameResult } from '../src/sim/match';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT } from '../src/sim/types';
import { createGame, step, STEPS_PER_SECOND } from '../src/sim/world';

const t = cloneTuning();

/** Plays the waiting game for real, AI against AI, with the season's rosters, modifiers and AI level. */
function playWaitingGame(f: Franchise, seed: string) {
  const game = matchup(f);
  if (!game) throw new Error('no game waiting');
  const world = createGame(t, seed, { human: false, teams: [game.home.setup, game.away.setup], levels: [0.6, game.level] });
  const maxSteps = 40 * 60 * STEPS_PER_SECOND;
  for (let i = 0; i < maxSteps && world.phase !== 'final'; i++) step(world, NO_INPUT, t);
  return recordGame(f, gameResult(world));
}

/** An automatic player: random legal choices at every turn, games simulated. Returns how the season went. */
function autoSeason(seed: string) {
  const f = newFranchise(generateLeague(seed));
  const choose = createRng(`${seed}/auto`);
  const log: string[] = [];
  expect(startSeason(f).ok).toBe(true);

  for (let guard = 0; guard < 400 && f.season.phase !== 'ended'; guard++) {
    const before = JSON.stringify(f.season);
    if (f.season.phase === 'playoffs') {
      playWaitingGame(f, `${seed}/g${guard}`);
    } else if (f.season.stage === 'reward') {
      expect(pickArtifact(f, choose.pick(f.season.offer)).ok).toBe(true);
    } else if (f.season.current === null) {
      const options = availableStops(f);
      expect(options.length).toBeGreaterThan(0);
      expect(travel(f, choose.pick(options).id).ok).toBe(true);
    } else {
      const stop = currentStop(f)!;
      log.push(stop.kind);
      if (stop.kind === 'game' || stop.kind === 'boss') {
        // Load whatever is in the bag (an all-AI game cannot use it, so it stays).
        if (f.season.powerups[0]) setLoadout(f, 0, f.season.powerups[0]);
        playWaitingGame(f, `${seed}/g${guard}`);
      } else if (stop.kind === 'training') {
        expect(train(f, choose.pick(f.season.dressed)).ok).toBe(true);
      } else if (stop.kind === 'event') {
        const choices = eventInfo(stop.eventId!).choices.length;
        expect(chooseEvent(f, choose.int(0, choices - 1)).ok).toBe(true);
      } else {
        const affordable = (stop.stock ?? []).filter((id) => shopPrice(f, id) <= f.season.currency);
        if (affordable.length > 0) expect(buy(f, choose.pick(affordable)).ok).toBe(true);
        expect(leaveShop(f).ok).toBe(true);
      }
    }
    // Every turn must change something: the season can never get stuck.
    expect(JSON.stringify(f.season)).not.toBe(before);
  }
  return { f, log };
}

describe('a whole season, played automatically with real simulated games', () => {
  const seeds = ['run-1', 'run-2', 'run-3', 'run-4'];
  const runs = seeds.map(autoSeason);

  it('always reaches an end: champion, eliminated, or struck out', () => {
    for (const { f } of runs) {
      expect(f.season.phase).toBe('ended');
      expect(['champion', 'eliminated', 'struckOut']).toContain(f.season.outcome);
      expect(f.season.strikes).toBeLessThanOrEqual(rules.maxStrikes);
      expect(f.season.gamesPlayed).toBeGreaterThanOrEqual(3);
      expect(f.season.gamesPlayed).toBeLessThanOrEqual(9 + rules.maxStrikes + 6);
      expect(f.record.wins + f.record.losses + f.record.overtimeLosses).toBe(f.season.gamesPlayed);
    }
    console.log(
      'seasons:',
      runs.map(({ f }) => `${f.season.outcome} after ${f.season.gamesPlayed} games (${f.season.gamesWon} won, ${f.season.strikes} strikes, ${f.artifacts.length} artifacts)`).join(' | '),
    );
  }, 120_000);

  it('visits games, and the other kinds of stop along the way', () => {
    const kinds = new Set(runs.flatMap(({ log }) => log));
    expect(kinds.has('game')).toBe(true);
    expect([...kinds].some((k) => k === 'training' || k === 'event' || k === 'shop')).toBe(true);
  });

  it('wraps up into a fresh off-season, and the next season can start', () => {
    const { f } = runs[0]!;
    const artifacts = [...f.artifacts];
    expect(endSeason(f).ok).toBe(true);
    expect(f.season.phase).toBe('offseason');
    expect(f.artifacts).toEqual(artifacts);
    expect(f.league.season).toBe(2);
    expect(startSeason(f).ok).toBe(true);
  });

  it('is repeatable: the same seed gives the same season', () => {
    const again = autoSeason('run-1');
    const first = autoSeason('run-1');
    expect(again.f.season).toEqual(first.f.season);
    expect(again.f.record).toEqual(first.f.record);
  }, 120_000);
});
