import type { GameResult, GoalNote } from '../sim/match';

/** How one team's goals were scored, counted. */
export interface GoalTally {
  goals: number;
  /** Scored with no skater of the other team between the shooter and the net. */
  clear: number;
  oneTimers: number;
  /** Went in off something, with no shot of the scoring team's behind it. */
  other: number;
  /** The average distance of the shots that went in, in metres; 0 with none. */
  metres: number;
}

/** Counts how the goals of one team were scored. */
export function tallyGoals(goals: readonly GoalNote[], team: 0 | 1): GoalTally {
  const mine = goals.filter((g) => g.team === team);
  const shots = mine.filter((g) => g.metres !== null);
  return {
    goals: mine.length,
    clear: mine.filter((g) => g.clear).length,
    oneTimers: mine.filter((g) => g.oneTimer).length,
    other: mine.length - shots.length,
    metres: shots.length > 0 ? shots.reduce((sum, g) => sum + (g.metres as number), 0) / shots.length : 0,
  };
}

/** One line saying how a team's goals came, for the end of a game; empty with no goals. `whose` is "Your goals" or "Goals against". */
export function goalLine(whose: string, tally: GoalTally, uncovered: string): string {
  if (tally.goals === 0) return '';
  const parts = [
    tally.clear > 0 ? `${tally.clear} ${uncovered}` : '',
    tally.oneTimers > 0 ? `${tally.oneTimers} one-timer${tally.oneTimers === 1 ? '' : 's'}` : '',
    tally.other > 0 ? `${tally.other} off a body or a skate` : '',
    tally.metres > 0 ? `from ${Math.round(tally.metres)} m on average` : '',
  ].filter(Boolean);
  return `${whose}: ${tally.goals}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}.`;
}

/** The two lines for the end-of-game screen, from the first team's side: its own goals, then the ones it let in. */
export function goalLines(result: GameResult): string[] {
  const goals = result.goals ?? [];
  return [goalLine('Your goals', tallyGoals(goals, 0), 'with nobody in the way'), goalLine('Goals against', tallyGoals(goals, 1), 'with none of yours between the shooter and your net')].filter(Boolean);
}
