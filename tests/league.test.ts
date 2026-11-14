import { describe, expect, it } from 'vitest';
import { generateLeague, generatePlayer } from '../src/core/generate';
import { goaliesOn, playerOf, rosterOf, skatersOn, teamOf, userTeam, type League } from '../src/core/league';
import { autoLineup, dressedSkaters, lineupProblems, LINE_SIZE, repairLineup, setLineupSlot } from '../src/core/lineup';
import { applyResult, dress } from '../src/core/matchup';
import { createNameMaker } from '../src/core/names';
import { capHitOf, gradeOf, overallOf } from '../src/core/player';
import { createRng } from '../src/core/rng';
import { canPlay, canSign, capSpace, payroll, release, sign } from '../src/core/roster';
import { emptyRecord, fromSave, parseSave, SAVE_VERSION, toSave } from '../src/core/save';
import rules from '../src/data/league.json';
import type { GameResult } from '../src/sim/match';

const fresh = (seed = 'league-test'): League => generateLeague(seed);

describe('player generator', () => {
  it('hits the overall it is asked for, in every grade and position', () => {
    const rng = createRng('players');
    const names = createNameMaker(rng.fork('names'));
    for (const position of ['F', 'D', 'G'] as const) {
      for (let target = 45; target <= 97; target += 4) {
        const p = generatePlayer(rng, names, 'p-x', position, target);
        expect(Math.abs(p.overall - target)).toBeLessThanOrEqual(1);
        expect(p.overall).toBe(overallOf(position, p.ratings));
        expect(p.grade).toBe(gradeOf(p.overall));
        expect(p.capHit).toBe(capHitOf(p.overall));
      }
    }
  });

  it('gives sensible ages, contracts, ratings and hidden potential', () => {
    const rng = createRng('ranges');
    const names = createNameMaker(rng.fork('names'));
    for (let i = 0; i < 200; i++) {
      const p = generatePlayer(rng, names, `p-${i}`, i % 3 === 0 ? 'D' : 'F', 55 + (i % 40));
      expect(p.age).toBeGreaterThanOrEqual(rules.minAge);
      expect(p.age).toBeLessThanOrEqual(rules.maxAge);
      expect(p.contractYears).toBeGreaterThanOrEqual(1);
      expect(p.contractYears).toBeLessThanOrEqual(4);
      expect(p.potential).toBeGreaterThanOrEqual(p.overall);
      expect(p.potential).toBeLessThanOrEqual(99);
      for (const value of Object.values(p.ratings)) {
        expect(value).toBeGreaterThanOrEqual(rules.ratingMin);
        expect(value).toBeLessThanOrEqual(rules.ratingMax);
      }
      expect(p.name.trim().split(' ').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('forwards shoot better than they check; defencemen the reverse, on average', () => {
    const rng = createRng('bias');
    const names = createNameMaker(rng.fork('names'));
    let forward = 0;
    let defence = 0;
    for (let i = 0; i < 200; i++) {
      const f = generatePlayer(rng, names, 'f', 'F', 72).ratings as { shooting: number; checking: number };
      const d = generatePlayer(rng, names, 'd', 'D', 72).ratings as { shooting: number; checking: number };
      forward += f.shooting - f.checking;
      defence += d.checking - d.shooting;
    }
    expect(forward).toBeGreaterThan(0);
    expect(defence).toBeGreaterThan(0);
  });

  it('older players have less room to grow', () => {
    const rng = createRng('potential');
    const names = createNameMaker(rng.fork('names'));
    let young = 0;
    let old = 0;
    for (let i = 0; i < 600; i++) {
      const p = generatePlayer(rng, names, 'p', 'F', 70);
      if (p.age <= 22) young += p.potential - p.overall;
      if (p.age >= rules.potentialPeakAge) old += p.potential - p.overall;
    }
    expect(young).toBeGreaterThan(0);
    expect(old).toBe(0);
  });
});

describe('league generator', () => {
  const league = fresh();

  it('builds the same league from the same seed, and a different one from another', () => {
    expect(fresh()).toEqual(league);
    expect(fresh('another-seed')).not.toEqual(league);
  });

  it('has your team and 12 AI teams, each with 7 skaters and a goalie', () => {
    expect(league.teams).toHaveLength(13);
    expect(league.teams.filter((t) => t.id === league.userTeamId)).toHaveLength(1);
    for (const team of league.teams) {
      expect(skatersOn(league, team)).toHaveLength(rules.rosterSkaters);
      expect(goaliesOn(league, team)).toHaveLength(rules.rosterGoalies);
      expect(skatersOn(league, team).filter((p) => p.position === 'F')).toHaveLength(rules.forwardsPerTeam);
    }
  });

  it('every team fits under the cap and has a legal lineup', () => {
    for (const team of league.teams) {
      expect(payroll(league, team)).toBeLessThanOrEqual(rules.cap);
      expect(lineupProblems(league, team)).toEqual([]);
      expect(canPlay(league, team)).toEqual({ ok: true });
    }
  });

  it('your team is mostly C grade, with cap room to improve it', () => {
    const mine = rosterOf(league, userTeam(league));
    const cGrades = mine.filter((p) => p.grade === 'C' || p.grade === 'C+');
    expect(cGrades.length).toBeGreaterThanOrEqual(6);
    expect(mine.every((p) => p.overall < 78)).toBe(true);
    expect(capSpace(league, userTeam(league))).toBeGreaterThan(8_000_000);
  });

  it('AI teams range from about your level to clearly stronger', () => {
    const strength = (id: string): number => {
      const roster = rosterOf(league, teamOf(league, id));
      return roster.reduce((s, p) => s + p.overall, 0) / roster.length;
    };
    const ai = league.teams.filter((t) => t.id !== league.userTeamId).map((t) => strength(t.id));
    expect(Math.min(...ai)).toBeLessThan(70);
    expect(Math.max(...ai)).toBeGreaterThan(74);
  });

  it('every player is on exactly one team or in the free-agent pool, with a unique id and name', () => {
    const placed = [...league.teams.flatMap((t) => t.roster), ...league.freeAgents];
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.sort()).toEqual(Object.keys(league.players).sort());
    const names = Object.values(league.players).map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(league.teams.map((t) => t.name)).size).toBe(league.teams.length);
  });

  it('the free-agent pool has skaters and goalies, from bargain D grades up to an A', () => {
    const pool = league.freeAgents.map((id) => playerOf(league, id));
    expect(pool).toHaveLength(rules.freeAgents.length);
    expect(pool.some((p) => p.position === 'G')).toBe(true);
    expect(pool.some((p) => p.grade === 'D')).toBe(true);
    expect(pool.some((p) => p.grade === 'A')).toBe(true);
  });
});

describe('roster moves', () => {
  /** A free agent of the given kind, cheapest first. */
  const freeAgent = (league: League, test: (overall: number, position: string) => boolean): string =>
    league.freeAgents
      .map((id) => playerOf(league, id))
      .filter((p) => test(p.overall, p.position))
      .sort((a, b) => a.capHit - b.capHit)[0]!.id;

  it('a full roster cannot sign: someone must be released first', () => {
    const league = fresh();
    const team = userTeam(league);
    const skater = freeAgent(league, (_, pos) => pos !== 'G');
    const refused = canSign(league, team, skater);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/full/);
    expect(sign(league, team, skater).ok).toBe(false);
    expect(team.roster).toHaveLength(8);
  });

  it('releasing frees the cap at once and sends the player to the pool', () => {
    const league = fresh();
    const team = userTeam(league);
    const victim = skatersOn(league, team)[6]!;
    const before = capSpace(league, team);
    expect(release(league, team, victim.id)).toEqual({ ok: true });
    expect(capSpace(league, team)).toBe(before + victim.capHit);
    expect(team.roster).not.toContain(victim.id);
    expect(league.freeAgents).toContain(victim.id);
    expect(release(league, team, victim.id).ok).toBe(false);
  });

  it('with a spot open, a free agent who fits under the cap can be signed', () => {
    const league = fresh();
    const team = userTeam(league);
    release(league, team, skatersOn(league, team)[6]!.id);
    const target = freeAgent(league, (overall, pos) => pos !== 'G' && overall >= 78 && overall < 83);
    const cost = playerOf(league, target).capHit;
    const before = capSpace(league, team);
    expect(sign(league, team, target)).toEqual({ ok: true });
    expect(team.roster).toContain(target);
    expect(league.freeAgents).not.toContain(target);
    expect(capSpace(league, team)).toBe(before - cost);
  });

  it('the cap is hard: a signing that would go over is refused', () => {
    const league = fresh();
    const team = userTeam(league);
    const skaters = skatersOn(league, team);
    // Make the cap tight by giving the remaining players star salaries.
    release(league, team, skaters[6]!.id);
    for (const p of skaters.slice(0, 6)) p.capHit = 5_000_000;
    const target = freeAgent(league, (overall, pos) => pos !== 'G' && overall >= 84);
    const refused = sign(league, team, target);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/cap/i);
    expect(payroll(league, team)).toBeLessThanOrEqual(rules.cap);
  });

  it('only one goalie: a second cannot be signed until the first is released', () => {
    const league = fresh();
    const team = userTeam(league);
    const keeper = freeAgent(league, (_, pos) => pos === 'G');
    expect(sign(league, team, keeper).ok).toBe(false);
    release(league, team, goaliesOn(league, team)[0]!.id);
    expect(canPlay(league, team).ok).toBe(false);
    expect(sign(league, team, keeper)).toEqual({ ok: true });
    expect(team.lineup.goalie).toBe(keeper);
    expect(canPlay(league, team)).toEqual({ ok: true });
  });

  it('someone already on a team cannot be signed', () => {
    const league = fresh();
    const other = league.teams[3]!.roster[0]!;
    expect(sign(league, userTeam(league), other).ok).toBe(false);
  });

  it('a team can play with 6 skaters and a goalie, but not with 5', () => {
    const league = fresh();
    const team = userTeam(league);
    release(league, team, skatersOn(league, team)[6]!.id);
    expect(canPlay(league, team)).toEqual({ ok: true });
    release(league, team, skatersOn(league, team)[5]!.id);
    expect(canPlay(league, team).ok).toBe(false);
  });
});

describe('lineup', () => {
  it('auto-fill dresses the best six skaters, best three on line 1, and the goalie', () => {
    const league = fresh();
    const team = userTeam(league);
    const best = skatersOn(league, team).map((p) => p.id);
    const lineup = autoLineup(league, team);
    expect(lineup.line1).toEqual(best.slice(0, 3));
    expect(lineup.line2).toEqual(best.slice(3, 6));
    expect(lineup.goalie).toBe(goaliesOn(league, team)[0]!.id);
    expect(LINE_SIZE).toBe(3);
  });

  it('spots a skater dressed twice, an empty spot, an outsider and a missing goalie', () => {
    const league = fresh();
    const team = userTeam(league);
    team.lineup.line2[0] = team.lineup.line1[0]!;
    expect(lineupProblems(league, team).join(' ')).toMatch(/twice/);
    team.lineup.line2[0] = null;
    expect(lineupProblems(league, team).join(' ')).toMatch(/empty/);
    team.lineup.line2[0] = league.teams[2]!.roster[0]!;
    expect(lineupProblems(league, team).join(' ')).toMatch(/not on the roster/);
    team.lineup = autoLineup(league, team);
    team.lineup.goalie = null;
    expect(lineupProblems(league, team).join(' ')).toMatch(/goalie/i);
  });

  it('putting a dressed skater in another spot swaps the two', () => {
    const league = fresh();
    const team = userTeam(league);
    const [a, , , d] = dressedSkaters(team.lineup);
    expect(setLineupSlot(league, team, 0, 0, d!)).toBe(true);
    expect(team.lineup.line1[0]).toBe(d);
    expect(team.lineup.line2[0]).toBe(a);
    expect(lineupProblems(league, team)).toEqual([]);
  });

  it('the spare skater can be swapped in, sending the other to the bench', () => {
    const league = fresh();
    const team = userTeam(league);
    const spare = skatersOn(league, team).map((p) => p.id).find((id) => !dressedSkaters(team.lineup).includes(id))!;
    const out = team.lineup.line2[2]!;
    expect(setLineupSlot(league, team, 1, 2, spare)).toBe(true);
    expect(dressedSkaters(team.lineup)).toContain(spare);
    expect(dressedSkaters(team.lineup)).not.toContain(out);
    expect(lineupProblems(league, team)).toEqual([]);
  });

  it('refuses a goalie or an outsider in a skater spot', () => {
    const league = fresh();
    const team = userTeam(league);
    expect(setLineupSlot(league, team, 0, 0, goaliesOn(league, team)[0]!.id)).toBe(false);
    expect(setLineupSlot(league, team, 0, 0, league.teams[5]!.roster[0]!)).toBe(false);
    expect(setLineupSlot(league, team, 0, 7, dressedSkaters(team.lineup)[1]!)).toBe(false);
  });

  it('after a release, the lineup is repaired with the spare skater and stays legal', () => {
    const league = fresh();
    const team = userTeam(league);
    const centre = team.lineup.line1[0]!;
    release(league, team, centre);
    expect(dressedSkaters(team.lineup)).not.toContain(centre);
    expect(lineupProblems(league, team)).toEqual([]);
    // Nobody else was moved.
    const before = autoLineup(fresh(), userTeam(fresh()));
    expect(team.lineup.line1.slice(1)).toEqual(before.line1.slice(1));
  });

  it('repair leaves a legal lineup alone', () => {
    const league = fresh();
    const team = userTeam(league);
    setLineupSlot(league, team, 0, 0, team.lineup.line2[1]!);
    const snapshot = JSON.parse(JSON.stringify(team.lineup));
    repairLineup(league, team);
    expect(team.lineup).toEqual(snapshot);
  });
});

describe('saves', () => {
  it('a save round-trips through text unchanged', () => {
    const league = fresh();
    release(league, userTeam(league), skatersOn(league, userTeam(league))[6]!.id);
    const save = toSave(league, { wins: 3, losses: 1, overtimeLosses: 2 }, '2026-11-13T12:00:00.000Z');
    expect(save.schemaVersion).toBe(SAVE_VERSION);
    const loaded = parseSave(JSON.stringify(save));
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && loaded.save).toEqual(save);
  });

  it('refuses a save from a newer version of the game', () => {
    const save = { ...toSave(fresh(), emptyRecord(), 'now'), schemaVersion: SAVE_VERSION + 1 };
    const loaded = fromSave(save);
    expect(loaded.ok).toBe(false);
    expect(!loaded.ok && loaded.reason).toMatch(/newer version/);
  });

  it('refuses things that are not saves, with a reason', () => {
    for (const bad of [null, 42, 'hello', [], {}, { schemaVersion: 'one' }, { schemaVersion: 0 }]) {
      const loaded = fromSave(bad);
      expect(loaded.ok).toBe(false);
      expect(!loaded.ok && loaded.reason.length).toBeGreaterThan(10);
    }
    expect(parseSave('{not json').ok).toBe(false);
  });

  it('refuses a damaged save', () => {
    const good = (): Record<string, any> => JSON.parse(JSON.stringify(toSave(fresh(), emptyRecord(), 'now')));
    const noPlayers = good();
    delete noPlayers.league.players;
    expect(fromSave(noPlayers).ok).toBe(false);

    const ghost = good();
    ghost.league.teams[0].roster.push('p-9999');
    const result = fromSave(ghost);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/does not exist/);

    const noTeam = good();
    noTeam.league.teams = noTeam.league.teams.filter((t: { id: string }) => t.id !== 't-user');
    expect(fromSave(noTeam).ok).toBe(false);

    const noRecord = good();
    delete noRecord.record;
    expect(fromSave(noRecord).ok).toBe(false);
  });
});

describe('taking a team onto the ice', () => {
  it('the dressed lineup becomes the simulation roster: line 1, line 2, then the goalie', () => {
    const league = fresh();
    const team = userTeam(league);
    const dressed = dress(league, team)!;
    const ids = [...dressedSkaters(team.lineup), team.lineup.goalie!];
    expect(dressed.players.map((p) => p.id)).toEqual(ids);
    expect(dressed.name).toBe(team.name);
    expect(dressed.setup.skaters).toHaveLength(6);
    expect(dressed.setup.skaters[0]).toEqual(playerOf(league, team.lineup.line1[0]!).ratings);
    expect(dressed.setup.skaters[3]).toEqual(playerOf(league, team.lineup.line2[0]!).ratings);
    expect(dressed.setup.goalie).toEqual(playerOf(league, team.lineup.goalie!).ratings);
    expect(dressed.setup.positions).toEqual(ids.slice(0, 6).map((id) => playerOf(league, id).position));
  });

  it('a team that cannot play cannot be dressed', () => {
    const league = fresh();
    const team = userTeam(league);
    team.lineup.goalie = null;
    expect(dress(league, team)).toBe(null);
  });

  it('a result updates the record: win, loss, or overtime loss', () => {
    const result = (winner: 0 | 1 | null, overtime: boolean, finished = true): GameResult => ({
      score: [0, 0],
      winner,
      finished,
      overtime,
      periods: 3,
      players: [],
    });
    const start = emptyRecord();
    expect(applyResult(start, result(0, false))).toEqual({ wins: 1, losses: 0, overtimeLosses: 0 });
    expect(applyResult(start, result(0, true))).toEqual({ wins: 1, losses: 0, overtimeLosses: 0 });
    expect(applyResult(start, result(1, false))).toEqual({ wins: 0, losses: 1, overtimeLosses: 0 });
    expect(applyResult(start, result(1, true))).toEqual({ wins: 0, losses: 0, overtimeLosses: 1 });
    expect(applyResult(start, result(null, true))).toEqual(start);
    expect(applyResult(start, result(0, false, false))).toEqual(start);
  });
});
