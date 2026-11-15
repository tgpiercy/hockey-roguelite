import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { playerOf, teamOf, userTeam } from '../src/core/league';
import { dress } from '../src/core/matchup';
import { capHitOf, type PlayerRecord } from '../src/core/player';
import { newFranchise, type Franchise } from '../src/core/season';
import { evaluateTrade } from '../src/core/trades';
import rules from '../src/data/offseason.json';
import { autoChange } from '../src/sim/lines';
import { cloneTuning } from '../src/sim/tuning';
import type { World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { giveTo, ID } from './helpers';

const t = cloneTuning();

describe('line shifts', () => {
  /** Team 0 has the puck, line 1 on the ice at one energy and line 2 rested on the bench. */
  const tired = (energy: number, heavy: 0 | 1 | null): World => {
    const world = createWorld(t, 'shifts');
    world.teams[0].heavyLine = heavy;
    for (const p of world.players) if (p.team === 0 && p.role === 'skater') p.energy = p.line === 0 ? energy : 1;
    giveTo(world, ID.home1);
    return world;
  };
  const below = t.energy.changeBelow - t.energy.heavyShift / 2;
  const above = t.energy.changeBelow + t.energy.heavyShift / 2;

  it('with even shifts a line changes once it is below the usual level', () => {
    expect(autoChange(tired(below, null), 0, t)).toBe(true);
    expect(autoChange(tired(above, null), 0, t)).toBe(false);
  });

  it('the line that plays more stays on at an energy where it would otherwise change', () => {
    expect(autoChange(tired(below, 0), 0, t)).toBe(false);
    expect(autoChange(tired(t.energy.changeBelow - t.energy.heavyShift - 0.02, 0), 0, t)).toBe(true);
  });

  it('and the other line comes off sooner', () => {
    expect(autoChange(tired(above, 1), 0, t)).toBe(true);
  });

  it('the choice on your lineup reaches the ice; AI teams and an untouched lineup stay even', () => {
    const league = generateLeague('shifts');
    const mine = userTeam(league);
    expect(dress(league, mine)!.setup.heavyLine).toBeUndefined();
    mine.lineup.heavy = 1;
    expect(dress(league, mine)!.setup.heavyLine).toBe(1);
    expect(dress(league, teamOf(league, 't-05'))!.setup.heavyLine).toBeUndefined();
    const world = createWorld(t, 'shifts', { teams: [dress(league, mine)!.setup, dress(league, teamOf(league, 't-05'))!.setup] });
    expect(world.teams[0].heavyLine).toBe(1);
    expect(world.teams[1].heavyLine).toBeNull();
  });
});

describe('trades by position', () => {
  const set = (p: PlayerRecord, position: 'F' | 'D', overall: number): PlayerRecord => {
    p.position = position;
    p.overall = overall;
    p.potential = overall;
    p.age = 26;
    p.capHit = capHitOf(overall);
    return p;
  };
  /** Their eight skaters as forwards and defencemen all rated 70; yours all rated 70 too. */
  const setUp = (theirForwards: number): { f: Franchise; mine: PlayerRecord[]; theirs: PlayerRecord[]; theirId: string } => {
    const f = newFranchise(generateLeague('positions'));
    const theirId = 't-03';
    const skatersOf = (teamId: string): PlayerRecord[] => teamOf(f.league, teamId).roster.map((id) => playerOf(f.league, id)).filter((p) => p.position !== 'G');
    const theirs = skatersOf(theirId);
    theirs.forEach((p, i) => set(p, i < theirForwards ? 'F' : 'D', 70));
    const mine = skatersOf(f.league.userTeamId);
    mine.forEach((p, i) => set(p, i < 4 ? 'F' : 'D', 70));
    f.value = 1e9;
    return { f, mine, theirs, theirId };
  };
  const forward = (list: PlayerRecord[]): PlayerRecord => list.find((p) => p.position === 'F')!;
  const defender = (list: PlayerRecord[]): PlayerRecord => list.find((p) => p.position === 'D')!;

  it('like for like at equal value is accepted, whatever they have', () => {
    const { f, mine, theirs, theirId } = setUp(4);
    expect(evaluateTrade(f, forward(mine).id, theirId, forward(theirs).id)).toEqual({ ok: true });
  });

  it('a team short at a position pays over the odds for it', () => {
    const { f, mine, theirs, theirId } = setUp(8 - rules.trade.positionShort);
    const offered = set(defender(mine), 'D', 70 - rules.trade.positionNeed);
    expect(evaluateTrade(f, offered.id, theirId, forward(theirs).id)).toEqual({ ok: true });
    // The same offer for a defenceman of theirs brings no bonus: it does not change what they have.
    expect(evaluateTrade(f, offered.id, theirId, defender(theirs).id).ok).toBe(false);
  });

  it('a team with plenty at a position wants more to take another', () => {
    const { f, mine, theirs, theirId } = setUp(8 - rules.trade.positionPlenty);
    const refused = evaluateTrade(f, defender(mine).id, theirId, forward(theirs).id);
    expect(refused.ok).toBe(false);
    const better = set(defender(mine), 'D', 70 + rules.trade.positionNeed);
    expect(evaluateTrade(f, better.id, theirId, forward(theirs).id)).toEqual({ ok: true });
  });

  it('no team trades away its last forwards or defencemen', () => {
    const { f, mine, theirs, theirId } = setUp(rules.trade.positionMin);
    const star = set(defender(mine), 'D', 95);
    const refused = evaluateTrade(f, star.id, theirId, forward(theirs).id);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/short of forwards/);
    // A forward for a forward leaves them as they were.
    expect(evaluateTrade(f, forward(mine).id, theirId, forward(theirs).id)).toEqual({ ok: true });
  });
});
