import { teamStrength } from './bosses';
import type { League } from './league';
import { dress } from './matchup';
import { quickResult } from './quickGame';
import { createRng } from './rng';

/**
 * An exhibition tournament: a four-team knockout that counts for nothing. You play a semi-final and,
 * if you win it, the final; the other semi-final is settled from team strength.
 */
export interface Tournament {
  /** Your semi-final opponent, and the two teams in the other semi-final. */
  semi: string;
  others: [string, string];
  /** Who won the other semi-final: the team you would meet in the final. */
  finalist: string;
  /** "semi": your semi-final is to play. "final": the final is. "won" and "out": it is over. */
  stage: 'semi' | 'final' | 'won' | 'out';
}

/**
 * A new tournament: the three AI teams nearest your own strength. You meet the weakest of them first;
 * the other two play each other, and that game is settled now, from the seed.
 */
export function newTournament(league: League, seed: string): Tournament | null {
  const mine = teamStrength(league, league.userTeamId);
  const field = league.teams
    .filter((t) => t.id !== league.userTeamId)
    .map((t) => ({ id: t.id, strength: teamStrength(league, t.id) }))
    .sort((a, b) => Math.abs(a.strength - mine) - Math.abs(b.strength - mine) || a.id.localeCompare(b.id))
    .slice(0, 3)
    .sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id));
  if (field.length < 3) return null;
  const semi = field[0] as { id: string };
  const first = field[1] as { id: string };
  const second = field[2] as { id: string };
  const home = dress(league, league.teams.find((t) => t.id === first.id)!);
  const away = dress(league, league.teams.find((t) => t.id === second.id)!);
  const firstWins = home && away ? quickResult(createRng(`${seed}/tournament`), home, away).winner === 0 : true;
  return { semi: semi.id, others: [first.id, second.id], finalist: firstWins ? first.id : second.id, stage: 'semi' };
}

/** The team you play next, or null when the tournament is over. */
export function tournamentOpponent(t: Tournament): string | null {
  return t.stage === 'semi' ? t.semi : t.stage === 'final' ? t.finalist : null;
}

/** The tournament after your game: a win moves you on (or wins it), a loss puts you out. */
export function afterTournamentGame(t: Tournament, won: boolean): Tournament {
  if (t.stage === 'semi') return { ...t, stage: won ? 'final' : 'out' };
  if (t.stage === 'final') return { ...t, stage: won ? 'won' : 'out' };
  return t;
}
