import { clearAhead, dist } from '../../src/sim/team';
import { cloneTuning, type Tuning } from '../../src/sim/tuning';
import type { World } from '../../src/sim/types';
import { createGame, step, STEPS_PER_SECOND } from '../../src/sim/world';
import { standIn, type Stand } from './bot';
import { uniformTeam } from './harness';

/** What a person's team gives up, a game: every figure is an average over the games played. */
export interface DefenceReport {
  games: number;
  wins: number;
  goalsFor: number;
  goalsAgainst: number;
  /** The other team's shots, and how many were taken with none of your skaters nearer your net than the shooter. */
  shotsAgainst: number;
  clearPathShots: number;
  clearPathGoals: number;
  /** Their shots taken with none of your skaters within `closeMetres` of the shooter: nobody was on him. */
  unpressedShots: number;
  unpressedGoals: number;
  /** Checks thrown by your AI team-mates, and the share that landed. */
  mateChecks: number;
  mateChecksLanded: number;
}

/**
 * Plays whole games with a person's seat on team 0 and counts what the other team was allowed to do.
 * `who` is the stand-in for the person: the script, which defends tirelessly, or nobody at all (the
 * controls never touched), which is the far end of a newcomer who does not defend.
 */
export function measureDefence(n: number, level: number, who: Stand, seed: string, closeMetres = 3, tuning?: Tuning): DefenceReport {
  const t = tuning ?? cloneTuning();
  const sum = { wins: 0, goalsFor: 0, goalsAgainst: 0, shotsAgainst: 0, clearPathShots: 0, clearPathGoals: 0, unpressedShots: 0, unpressedGoals: 0, mateChecks: 0, mateChecksLanded: 0 };
  for (let i = 0; i < n; i++) {
    const world: World = createGame(t, `${seed}-${i}`, { teams: [uniformTeam(67), uniformTeam(70)], levels: [null, level], overtimeLimit: 300 });
    const bot = standIn(who, t, `${seed}-${i}`);
    let last: { clear: boolean; unpressed: boolean } | null = null;
    for (let s = 0; s < 30 * 60 * STEPS_PER_SECOND && world.phase !== 'final'; s++) {
      for (const e of step(world, bot(world), t)) {
        if (e.type === 'shot') {
          const p = world.players[e.player]!;
          if (p.team === 1) {
            const mine = world.players.filter((o) => o.team === 0 && o.role === 'skater' && o.onIce);
            last = { clear: clearAhead(world, p), unpressed: !mine.some((o) => dist(o.pos, p.pos) <= closeMetres) };
            sum.shotsAgainst++;
            if (last.clear) sum.clearPathShots++;
            if (last.unpressed) sum.unpressedShots++;
          } else last = null;
        } else if (e.type === 'check') {
          const p = world.players[e.player]!;
          if (p.team === 0 && world.human?.controlled !== p.id) {
            sum.mateChecks++;
            if (e.success) sum.mateChecksLanded++;
          }
        } else if (e.type === 'goal') {
          if (e.team === 0) sum.goalsFor++;
          else {
            sum.goalsAgainst++;
            if (last?.clear) sum.clearPathGoals++;
            if (last?.unpressed) sum.unpressedGoals++;
          }
          last = null;
        }
      }
    }
    if (world.score[0] > world.score[1]) sum.wins++;
  }
  const per = (v: number): number => v / n;
  return {
    games: n,
    wins: sum.wins,
    goalsFor: per(sum.goalsFor),
    goalsAgainst: per(sum.goalsAgainst),
    shotsAgainst: per(sum.shotsAgainst),
    clearPathShots: per(sum.clearPathShots),
    clearPathGoals: per(sum.clearPathGoals),
    unpressedShots: per(sum.unpressedShots),
    unpressedGoals: per(sum.unpressedGoals),
    mateChecks: per(sum.mateChecks),
    mateChecksLanded: sum.mateChecks > 0 ? sum.mateChecksLanded / sum.mateChecks : 0,
  };
}

/** One line of a report, for a table. */
export function defenceLine(label: string, r: DefenceReport): string {
  const f = (v: number): string => v.toFixed(2);
  return `${label}: wins ${r.wins}/${r.games} | for ${f(r.goalsFor)} against ${f(r.goalsAgainst)} | shots against ${f(r.shotsAgainst)}: clear path ${f(r.clearPathShots)} (${f(r.clearPathGoals)} goals), nobody on him ${f(r.unpressedShots)} (${f(r.unpressedGoals)} goals) | mates' checks ${f(r.mateChecks)}, ${Math.round(r.mateChecksLanded * 100)}% land`;
}
