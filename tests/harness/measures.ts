import { bossInfo } from '../../src/core/bosses';
import { rinkInfo, rinkTuning } from '../../src/core/rinks';
import ai from '../../src/data/ai.json';
import bosses from '../../src/data/bosses.json';
import rinks from '../../src/data/rinks.json';
import { gameResult } from '../../src/sim/match';
import type { Modifier } from '../../src/sim/modifiers';
import { cloneTuning } from '../../src/sim/tuning';
import { NO_INPUT } from '../../src/sim/types';
import { createGame, createWorld, step, STEPS_PER_SECOND, type TeamSetup } from '../../src/sim/world';
import { clearIce, giveTo, ID, place, player } from '../helpers';
import { createNaivePlayer } from './bot';
import { runSeries, uniformTeam } from './harness';

/**
 * Measurements that were first written as throw-away tests and are kept here so that a number in
 * docs/TUNING.md can be run again after any change: `npm run measure -- <name>`. Each returns lines of
 * text, one per row of its table.
 */

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** One AI skater alone from centre ice against a goalie of a given rating: goals in `n` tries, at each AI level. */
export function measureBreakaways(n: number): string[] {
  const t = cloneTuning();
  const lines: string[] = ['Breakaways: one AI skater in alone from centre, goals scored (no person on either team, so no goalie assist)'];
  for (const level of [0.3, 0.5, 0.65, 0.8]) {
    const cells: string[] = [];
    for (const rating of [60, 68, 76, 85]) {
      let goals = 0;
      for (let i = 0; i < n; i++) {
        const team = uniformTeam(70);
        const world = createWorld(t, `ba-${i}`, { human: false, levels: [level, level], teams: [{ ...team, goalie: { reflexes: rating, positioning: rating, reboundControl: rating, stamina: rating } }, uniformTeam(72)] });
        clearIce(world, [ID.away1]);
        place(world, ID.away1, 4, (i % 5) - 2, Math.PI);
        giveTo(world, ID.away1);
        player(world, ID.away1).vel = { x: -5, y: 0 };
        let done = false;
        for (let s = 0; s < 60 * 7 && !done; s++) {
          for (const e of step(world, NO_INPUT, t)) {
            if (e.type === 'goal') {
              goals += e.team === 1 ? 1 : 0;
              done = true;
            }
            if (e.type === 'save' && e.frozen) done = true;
          }
          if (s % 20 === 0) clearIce(world, [ID.away1]);
        }
      }
      cells.push(`goalie ${rating}: ${goals}/${n}`);
    }
    lines.push(`  level ${level}  ${cells.join('   ')}`);
  }
  return lines;
}

/** The three AI styles against each other, equal teams. */
export function measureStyles(n: number): string[] {
  const lines = ['AI styles against each other, equal teams at 70'];
  for (const [a, b] of [['rush', 'cycle'], ['rush', 'dump'], ['cycle', 'dump']] as const) {
    const r = runSeries(n, { ...uniformTeam(70), style: a }, { ...uniformTeam(70), style: b }, `styles-${a}-${b}`);
    lines.push(`  ${a} v ${b}: ${a} wins ${pct(r.winRateA)}, goals ${r.goalsPerGameA.toFixed(2)} to ${r.goalsPerGameB.toFixed(2)}, shots ${r.shotsPerGameA.toFixed(0)} to ${r.shotsPerGameB.toFixed(0)}`);
  }
  lines.push(`  (style numbers: ${Object.entries(ai.styles).map(([id, s]) => `${id} pass ${s.pass} long ${s.longShot} dump ${s.dump}`).join('; ')})`);
  return lines;
}

/** Each boss's trick on a 70 team against a plain 70 team (AI on both sides), and the scripted player's 67 team against a 73 team with the trick. */
export function measureBosses(n: number): string[] {
  const t = cloneTuning();
  const lines = ['Bosses: the trick against a plain equal team (AI v AI), and the scripted player against it'];
  for (const b of bosses) {
    const mods = bossInfo(b.id).modifiers as Modifier[];
    const r = runSeries(n, { ...uniformTeam(70), modifiers: mods }, uniformTeam(70), `boss-${b.id}`);
    let wins = 0;
    const games = Math.max(10, Math.round(n * 0.4));
    for (let i = 0; i < games; i++) {
      const world = createGame(t, `bb-${b.id}-${i}`, { teams: [uniformTeam(67), { ...uniformTeam(73), modifiers: mods }], levels: [null, 0.5], overtimeLimit: 300 });
      const bot = createNaivePlayer(t);
      for (let s = 0; s < 30 * 60 * STEPS_PER_SECOND && world.phase !== 'final'; s++) step(world, bot(world), t);
      if (gameResult(world).winner === 0) wins++;
    }
    lines.push(`  ${b.id.padEnd(14)} trick wins ${pct(r.winRateA).padStart(4)}  goals ${r.goalsPerGameA.toFixed(2)} to ${r.goalsPerGameB.toFixed(2)}   script beats it ${pct(wins / games).padStart(4)} (${games} games; a boss's mascot is not in this)`);
  }
  return lines;
}

/** All-AI games on every rink. */
export function measureRinks(n: number): string[] {
  const lines = ['Rinks: all-AI games, equal teams, level 0.5'];
  for (const rink of rinks.rinks) {
    if (rink.rules && 'firstTo' in rink.rules) {
      lines.push(`  ${rink.id.padEnd(14)} (no clock: not comparable by goals a game)`);
      continue;
    }
    const team: TeamSetup = uniformTeam(70);
    const r = runSeries(n, team, team, `rink-${rink.id}`, { tuning: rinkTuning(cloneTuning(), rinkInfo(rink.id)) });
    lines.push(`  ${rink.id.padEnd(14)} goals ${r.goalsPerGameA.toFixed(2)} and ${r.goalsPerGameB.toFixed(2)}  shots ${r.shotsPerGameA.toFixed(0)}  save ${r.savePct.toFixed(3)}  overtime ${pct(r.overtimeRate)}`);
  }
  return lines;
}
