import { generateLeague } from '../../src/core/generate';
import { autoOffseason, leagueSnapshot, quickSeason, type LeagueSnapshot } from '../../src/core/quickSeason';
import { createRng } from '../../src/core/rng';
import { newFranchise } from '../../src/core/season';

export interface FranchiseRun {
  seed: string;
  /** One snapshot per year, taken just before each season starts (rosters set, league moved). */
  years: LeagueSnapshot[];
  /** How each season ended. */
  outcomes: string[];
}

/** Runs one franchise for a number of seasons with the automatic manager and quick games. */
export function runFranchise(seed: string, seasons: number): FranchiseRun {
  const f = newFranchise(generateLeague(seed));
  const rng = createRng(`${seed}/auto-manager`);
  const run: FranchiseRun = { seed, years: [], outcomes: [] };
  for (let year = 0; year < seasons; year++) {
    autoOffseason(f);
    run.years.push(leagueSnapshot(f));
    quickSeason(f, rng);
    run.outcomes.push(f.offseason.report ? `${f.record.wins}W` : 'not played');
  }
  return run;
}

export interface YearSummary {
  year: number;
  grades: Record<string, number>;
  averageAge: number;
  illegalRosters: number;
  overCap: number;
  freeAgents: number;
  userStrength: number;
  leagueStrength: number;
}

/** Averages the yearly snapshots across several franchises. Illegal rosters and cap trouble are totals. */
export function summarise(runs: FranchiseRun[]): YearSummary[] {
  const years = Math.min(...runs.map((r) => r.years.length));
  const out: YearSummary[] = [];
  for (let y = 0; y < years; y++) {
    const snaps = runs.map((r) => r.years[y] as LeagueSnapshot);
    const mean = (pick: (s: LeagueSnapshot) => number): number => snaps.reduce((sum, s) => sum + pick(s), 0) / snaps.length;
    const grades: Record<string, number> = {};
    for (const grade of Object.keys(snaps[0]!.grades)) grades[grade] = mean((s) => s.grades[grade] ?? 0);
    out.push({
      year: y + 1,
      grades,
      averageAge: mean((s) => s.averageAge),
      illegalRosters: snaps.reduce((sum, s) => sum + s.illegalRosters, 0),
      overCap: snaps.reduce((sum, s) => sum + s.overCap, 0),
      freeAgents: mean((s) => s.freeAgents),
      userStrength: mean((s) => s.userStrength),
      leagueStrength: mean((s) => s.leagueStrength),
    });
  }
  return out;
}

/** The health report as a table of text. */
export function formatSeasons(summary: YearSummary[], franchises: number): string {
  const grades = ['S', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
  const pad = (v: string, n: number): string => v.padStart(n);
  const lines = [
    `${franchises} franchises. Players per grade are league-wide averages (104 rostered players).`,
    `year ${grades.map((g) => pad(g, 5)).join('')}  avg age  free agents  your team  league  illegal  over cap`,
  ];
  for (const s of summary) {
    lines.push(
      `${pad(String(s.year), 4)} ${grades.map((g) => pad((s.grades[g] ?? 0).toFixed(1), 5)).join('')}  ${pad(s.averageAge.toFixed(1), 7)}  ${pad(
        s.freeAgents.toFixed(0),
        11,
      )}  ${pad(s.userStrength.toFixed(1), 9)}  ${pad(s.leagueStrength.toFixed(1), 6)}  ${pad(String(s.illegalRosters), 7)}  ${pad(String(s.overCap), 8)}`,
    );
  }
  return lines.join('\n');
}
