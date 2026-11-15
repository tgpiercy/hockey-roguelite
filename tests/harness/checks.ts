import { generateLeague } from '../../src/core/generate';
import { createRng } from '../../src/core/rng';
import {
  availableStops,
  buy,
  chooseEvent,
  currentStop,
  eventInfo,
  leaveShop,
  matchup,
  newFranchise,
  pickArtifact,
  pickRinger,
  recordGame,
  setDifficulty,
  setLoadout,
  shopPrice,
  startSeason,
  train,
  travel,
} from '../../src/core/season';
import { resolveCheck } from '../../src/sim/check';
import { gameResult } from '../../src/sim/match';
import { goalLineX } from '../../src/sim/rink';
import { carrierOf, dist, skatersOf } from '../../src/sim/team';
import { cloneTuning, type Tuning } from '../../src/sim/tuning';
import type { SimEvent, World } from '../../src/sim/types';
import { createGame, createWorld, step, STEPS_PER_SECOND, type TeamSetup } from '../../src/sim/world';
import { clearIce, giveTo, ID, place, player } from '../helpers';
import { createNaivePlayer } from './bot';
import { uniformTeam } from './harness';

/**
 * Measurements against the five faults players most often hold against arcade hockey roguelites:
 * the wrong skater handed to you, team-mates who stand and wait, your goalie seeming worse than theirs,
 * difficulty that feels rigged, and checks that are inconsistent. A scripted player stands in for a
 * person, so these narrow the questions; they do not settle how the game feels.
 */

export interface PlayReport {
  games: number;
  /** Times a game control moved to another skater, by why. The scripted player never passes or presses switch. */
  switchesPerGame: { followedPuck: number; lineChange: number; other: number };
  /** While the human carries the puck in the attacking zone: share of that time a linemate is open, at the net, and standing still. */
  carryShare: { mateOpen: number; mateAtNet: number; mateStill: number };
  /** Shots faced and stopped by each goalie: 0 is the human's. */
  savePct: [number, number];
  shots: [number, number];
  goals: [number, number];
  wins: number;
}

/** Plays games with the scripted player on team 0 and gathers the measurements. `hold` plays with switching on hold. */
export function measurePlay(n: number, level: number, seed: string, hold = false, home: TeamSetup = uniformTeam(70), away: TeamSetup = uniformTeam(70)): PlayReport {
  const t = cloneTuning();
  const report: PlayReport = { games: n, switchesPerGame: { followedPuck: 0, lineChange: 0, other: 0 }, carryShare: { mateOpen: 0, mateAtNet: 0, mateStill: 0 }, savePct: [0, 0], shots: [0, 0], goals: [0, 0], wins: 0 };
  let carrySteps = 0;
  const saves: [number, number] = [0, 0];
  for (let i = 0; i < n; i++) {
    const world = createGame(t, `${seed}-${i}`, { teams: [home, away], levels: [null, level], overtimeLimit: 300, ...(hold ? { holdSwitch: true } : {}) });
    const bot = createNaivePlayer(t);
    for (let s = 0; s < 30 * 60 * STEPS_PER_SECOND && world.phase !== 'final'; s++) {
      const before = world.human!.controlled;
      const wasOn = world.players[before]?.onIce && !world.players[before]?.leaving;
      const events = step(world, bot(world), t);
      const after = world.human!.controlled;
      if (after !== before && world.phase === 'play') {
        const carrier = carrierOf(world);
        if (!wasOn || !world.players[before]?.onIce || world.players[before]?.leaving) report.switchesPerGame.lineChange += 1 / n;
        else if (carrier && carrier.id === after) report.switchesPerGame.followedPuck += 1 / n;
        else report.switchesPerGame.other += 1 / n;
      }
      measureCarry(world, t, report, () => (carrySteps += 1));
      void events;
    }
    const result = gameResult(world);
    if (result.winner === 0) report.wins += 1;
    for (const p of result.players) {
      if (p.role !== 'goalie') continue;
      saves[p.team] += p.saves;
      report.goals[p.team === 0 ? 1 : 0] += p.goalsAgainst;
    }
  }
  report.shots = [saves[1] + report.goals[0], saves[0] + report.goals[1]];
  report.savePct = [saves[0] / Math.max(1, saves[0] + report.goals[1]), saves[1] / Math.max(1, saves[1] + report.goals[0])];
  for (const key of ['mateOpen', 'mateAtNet', 'mateStill'] as const) report.carryShare[key] /= Math.max(1, carrySteps);
  return report;
}

function measureCarry(world: World, t: Tuning, report: PlayReport, count: () => void): void {
  if (world.phase !== 'play' || !world.human) return;
  const me = world.players[world.human.controlled];
  if (!me || world.puck.carrier !== me.id || me.pos.x < goalLineX(t) - 14) return;
  count();
  const mates = skatersOf(world, 0).filter((p) => p.onIce && p.id !== me.id);
  const foes = skatersOf(world, 1).filter((p) => p.onIce);
  const net = { x: goalLineX(t), y: 0 };
  // Open: a linemate with at least 2.5 metres of room. At the net: one within 6 metres of the goal mouth. Still: one moving under a metre a second.
  if (mates.some((m) => foes.every((f) => dist(f.pos, m.pos) >= 2.5))) report.carryShare.mateOpen += 1;
  if (mates.some((m) => dist(m.pos, net) <= 6)) report.carryShare.mateAtNet += 1;
  if (mates.some((m) => Math.hypot(m.vel.x, m.vel.y) < 1)) report.carryShare.mateStill += 1;
}

/**
 * How often a check succeeds from one fixed set-up: a carrier standing at centre, facing the checker. `human` gives the checker the easier limits the player's own skater gets.
 */
export function checkRate(kind: 'poke' | 'body', human: boolean, trials: number, checking = 70, control = 70, gap = 2): number {
  const t = cloneTuning();
  let landed = 0;
  for (let i = 0; i < trials; i++) {
    const home = uniformTeam(70);
    const away = uniformTeam(70);
    home.skaters = home.skaters.map((s) => ({ ...s, checking }));
    away.skaters = away.skaters.map((s) => ({ ...s, puckControl: control }));
    const world = createWorld(t, `check-${kind}-${human}-${i}`, { human, teams: [home, away] });
    clearIce(world, [ID.home1, ID.away1]);
    // The carrier faces the checker: a poke from in front, at `gap` metres between the two.
    place(world, ID.away1, 0, 0, Math.PI);
    giveTo(world, ID.away1);
    const checker = place(world, ID.home1, kind === 'body' ? -0.9 : -gap, 0, 0);
    checker.vel = { x: kind === 'body' ? 4 : 0, y: 0 };
    const events: SimEvent[] = [];
    resolveCheck(world, player(world, ID.home1), kind === 'body', t, events, kind === 'body' ? 4 : 0);
    if (events.some((e) => e.type === 'check' && e.success)) landed += 1;
  }
  return landed / trials;
}

export interface SeasonReport {
  seasons: number;
  /** Share that beat the first region's boss, and share that won the title. */
  clearedFirstRegion: number;
  champions: number;
  /** Average games won and played. */
  wins: number;
  played: number;
  /** Pucks earned, spent and left over in an average season; shops reached, and those where something could be afforded. */
  pucksEarned: number;
  pucksSpent: number;
  pucksLeft: number;
  shops: number;
  shopsBoughtAt: number;
}

/**
 * Plays whole seasons with the scripted player in every game, on one difficulty, making plain choices
 * between games (random stops, first artifact, no ringer fee, buys what it can afford).
 */
export function measureSeasons(n: number, difficulty: string, seed: string): SeasonReport {
  const t = cloneTuning();
  const report: SeasonReport = { seasons: n, clearedFirstRegion: 0, champions: 0, wins: 0, played: 0, pucksEarned: 0, pucksSpent: 0, pucksLeft: 0, shops: 0, shopsBoughtAt: 0 };
  for (let i = 0; i < n; i++) {
    const f = newFranchise(generateLeague(`${seed}-${i}`), difficulty);
    setDifficulty(f, difficulty);
    const choose = createRng(`${seed}-${i}/auto`);
    startSeason(f);
    let cleared = false;
    for (let guard = 0; guard < 400 && f.season.phase !== 'ended'; guard++) {
      const game = matchup(f);
      const pucks = f.season.currency;
      if (f.season.stage === 'ringer') pickRinger(f, 0);
      else if (f.season.stage === 'reward') pickArtifact(f, f.season.offer[0] as string);
      else if (game) {
        if (f.season.powerups[0]) setLoadout(f, 0, f.season.powerups[0]);
        const boss = game.kind === 'boss' && currentStop(f)?.region === 0;
        const world = createGame(t, `${seed}-${i}/g${guard}`, { teams: [game.home.setup, game.away.setup], levels: [null, game.level], overtimeLimit: 300 });
        const bot = createNaivePlayer(t);
        for (let s = 0; s < 30 * 60 * STEPS_PER_SECOND && world.phase !== 'final'; s++) step(world, bot(world), t);
        const result = gameResult(world);
        // A game still level after the overtime limit goes to the other side, so the season always moves on.
        const settled = result.winner === null ? { ...result, winner: 1 as const, score: [result.score[0], result.score[1] + 1] as [number, number] } : result;
        recordGame(f, settled);
        if (boss && settled.winner === 0) cleared = true;
      } else if (f.season.current === null) {
        const options = availableStops(f);
        if (options.length === 0) break;
        // A plain player: an ordinary game before an elite one, otherwise whatever comes.
        const plain = options.filter((s) => !s.elite);
        travel(f, choose.pick(plain.length > 0 ? plain : options).id);
      } else {
        const stop = currentStop(f)!;
        if (stop.kind === 'training') train(f, choose.pick(f.season.dressed));
        else if (stop.kind === 'event') chooseEvent(f, choose.int(0, eventInfo(stop.eventId!).choices.length - 1));
        else {
          const affordable = (stop.stock ?? []).filter((id) => shopPrice(f, id) <= f.season.currency);
          report.shops += 1 / n;
          if (affordable.length > 0) report.shopsBoughtAt += 1 / n;
          if (affordable.length > 0) buy(f, choose.pick(affordable));
          leaveShop(f);
        }
      }
      const moved = f.season.currency - pucks;
      if (moved > 0) report.pucksEarned += moved / n;
      else report.pucksSpent -= moved / n;
    }
    report.pucksLeft += f.season.currency / n;
    if (cleared) report.clearedFirstRegion += 1 / n;
    if (f.season.outcome === 'champion') report.champions += 1 / n;
    report.wins += f.season.gamesWon / n;
    report.played += f.season.gamesPlayed / n;
  }
  return report;
}
