import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { teamOf, userTeam } from '../src/core/league';
import { dress } from '../src/core/matchup';
import { aiLevel, styleOf, think } from '../src/sim/ai';
import { goalLineX } from '../src/sim/rink';
import { BALANCED, choices, kindName, nextTactic, readTactics, TACTIC_KINDS, tacticInfo, tacticsLine, type Tactics } from '../src/sim/tactics';
import { cloneTuning } from '../src/sim/tuning';
import type { World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const gx = goalLineX(t);
const lv = aiLevel(0.5);
/** An all-AI world whose first team plays the given tactics. */
const world = (tactics: Partial<Tactics>): World => {
  const w = createWorld(t, 'tactics', { human: false });
  w.teams[0].tactics = { ...BALANCED, ...tactics };
  return w;
};
const plan = (w: World, id: number): void => {
  think(w, player(w, id), t, lv);
};

describe('the settings', () => {
  it('there are three, each with a balanced choice that changes nothing and words for the player', () => {
    expect(TACTIC_KINDS).toEqual(['forecheck', 'attack', 'defence']);
    for (const kind of TACTIC_KINDS) {
      expect(kindName(kind).length).toBeGreaterThan(3);
      const all = choices(kind);
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(all[0]!.id).toBe('balanced');
      for (const c of all) expect(c.describe.length).toBeGreaterThan(20);
    }
    expect(tacticsLine(BALANCED)).toBe('Balanced · Balanced · Balanced');
  });

  it('pressing a setting moves it to the next choice and comes round again', () => {
    let now = BALANCED;
    const seen: string[] = [];
    for (let i = 0; i < choices('forecheck').length; i++) {
      now = nextTactic(now, 'forecheck');
      seen.push(now.forecheck);
    }
    expect(seen[seen.length - 1]).toBe('balanced');
    expect(new Set(seen).size).toBe(choices('forecheck').length);
    expect(now.attack).toBe('balanced');
  });

  it('stored tactics are read back; anything unknown falls back to balanced', () => {
    expect(readTactics({ forecheck: 'press', attack: 'crash', defence: 'man' })).toEqual({ forecheck: 'press', attack: 'crash', defence: 'man' });
    expect(readTactics({ forecheck: 'charge', attack: 7 })).toEqual(BALANCED);
    expect(readTactics(undefined)).toEqual(BALANCED);
    expect(tacticInfo('attack', 'nonsense').id).toBe('balanced');
  });

  it('your lineup\'s tactics reach the ice; other teams and an untouched lineup have none', () => {
    const league = generateLeague('tactics');
    const mine = userTeam(league);
    expect(dress(league, mine)!.setup.tactics).toBeUndefined();
    mine.lineup.tactics = { forecheck: 'press', attack: 'cycle', defence: 'collapse' };
    expect(dress(league, mine)!.setup.tactics).toEqual(mine.lineup.tactics);
    expect(dress(league, teamOf(league, 't-04'))!.setup.tactics).toBeUndefined();
    const w = createWorld(t, 'reach', { teams: [dress(league, mine)!.setup, dress(league, teamOf(league, 't-04'))!.setup] });
    expect(w.teams[0].tactics).toEqual(mine.lineup.tactics);
    expect(w.teams[1].tactics).toBeNull();
  });
});

describe('forecheck', () => {
  /** Their carrier deep in their own end; our three in the neutral zone. */
  const theirEnd = (tactics: Partial<Tactics>): World => {
    const w = world(tactics);
    place(w, ID.away1, gx - 6, 2, Math.PI);
    giveTo(w, ID.away1);
    place(w, ID.away2, gx - 12, -6, Math.PI);
    place(w, ID.away3, gx - 12, 7, Math.PI);
    place(w, ID.home1, 2, 0, 0);
    place(w, ID.home2, 0, -5, 0);
    place(w, ID.home3, -2, 5, 0);
    for (const id of [ID.home1, ID.home2, ID.home3]) plan(w, id);
    return w;
  };
  const chasing = (w: World): number => [ID.home1, ID.home2, ID.home3].filter((id) => player(w, id).ai.follow === 'carrier').length;

  it('press sends two after the carrier; balanced fewer; sit back none', () => {
    expect(chasing(theirEnd({ forecheck: 'press' }))).toBe(2);
    expect(chasing(theirEnd({}))).toBeLessThan(2);
    expect(chasing(theirEnd({ forecheck: 'sit' }))).toBe(0);
  });

  it('sit back lines all three up at their own blue line', () => {
    const w = theirEnd({ forecheck: 'sit' });
    for (const id of [ID.home1, ID.home2, ID.home3]) {
      expect(player(w, id).ai.follow).toBe('point');
      expect(player(w, id).ai.targetX).toBeLessThan(0);
    }
  });
});

describe('attack', () => {
  it('rush and cycle play the styles of those names; crash has its own; balanced none', () => {
    expect(styleOf(world({ attack: 'rush' }), 0).name).toBe('Rush');
    expect(styleOf(world({ attack: 'cycle' }), 0).pass).toBeGreaterThan(1);
    expect(styleOf(world({ attack: 'crash' }), 0).name).toBe('Crash');
    expect(styleOf(world({}), 0).name).toBe('');
    // The other team is untouched.
    expect(styleOf(world({ attack: 'rush' }), 1).name).toBe('');
  });

  it('crash puts both helpers at the front of the net, one at each post; otherwise one goes to the point', () => {
    const spots = (tactics: Partial<Tactics>): { x: number; y: number }[] => {
      const w = world(tactics);
      place(w, ID.home1, gx - 9, 6, 0);
      giveTo(w, ID.home1);
      place(w, ID.home2, gx - 14, 0, 0);
      place(w, ID.home3, gx - 16, -4, 0);
      for (const id of [ID.away1, ID.away2, ID.away3]) place(w, id, -15, id - 8, Math.PI);
      for (const id of [ID.home2, ID.home3]) plan(w, id);
      return [ID.home2, ID.home3].map((id) => ({ x: player(w, id).ai.targetX, y: player(w, id).ai.targetY }));
    };
    const crash = spots({ attack: 'crash' });
    for (const s of crash) expect(gx - s.x).toBeLessThan(5);
    expect(Math.sign(crash[0]!.y)).not.toBe(Math.sign(crash[1]!.y));
    const usual = spots({});
    expect(Math.max(...usual.map((s) => gx - s.x))).toBeGreaterThan(7);
  });
});

describe('defence', () => {
  /** Their carrier at the top of our zone with a man on each wing; our three back. */
  const ourEnd = (tactics: Partial<Tactics>): World => {
    const w = world(tactics);
    place(w, ID.away1, -gx + 12, 0, Math.PI);
    giveTo(w, ID.away1);
    place(w, ID.away2, -gx + 7, -7, Math.PI);
    place(w, ID.away3, -gx + 7, 7, Math.PI);
    place(w, ID.home1, -gx + 10, 1, 0);
    place(w, ID.home2, -gx + 5, -3, 0);
    place(w, ID.home3, -gx + 5, 3, 0);
    for (const id of [ID.home1, ID.home2, ID.home3]) plan(w, id);
    return w;
  };
  const others = (w: World): { x: number; y: number }[] =>
    [ID.home1, ID.home2, ID.home3].filter((id) => player(w, id).ai.follow !== 'carrier').map((id) => ({ x: player(w, id).ai.targetX, y: player(w, id).ai.targetY }));

  it('collapse packs everyone but the presser into the slot', () => {
    const packed = others(ourEnd({ defence: 'collapse' }));
    expect(packed).toHaveLength(2);
    for (const s of packed) expect(Math.abs(s.y)).toBeLessThan(4);
  });

  it('man-to-man sends the others out to their men, wider than the usual shape', () => {
    const width = (list: { y: number }[]): number => Math.max(...list.map((s) => Math.abs(s.y)));
    const man = others(ourEnd({ defence: 'man' }));
    const usual = others(ourEnd({}));
    expect(man).toHaveLength(2);
    expect(width(man)).toBeGreaterThan(5);
    expect(width(man)).toBeGreaterThan(Math.min(...usual.map((s) => Math.abs(s.y))));
    // Each of the two is on a different side: one man each.
    expect(Math.sign(man[0]!.y)).not.toBe(Math.sign(man[1]!.y));
  });
});

describe('who the tactics are for', () => {
  it('balanced is exactly the play of a team with no tactics at all', () => {
    const run = (tactics: Tactics | null): string => {
      const w = createWorld(t, 'same', { human: false });
      w.teams[0].tactics = tactics;
      place(w, ID.away1, gx - 6, 2, Math.PI);
      giveTo(w, ID.away1);
      for (const id of [ID.home1, ID.home2, ID.home3]) plan(w, id);
      return JSON.stringify([ID.home1, ID.home2, ID.home3].map((id) => player(w, id).ai));
    };
    expect(run(BALANCED)).toBe(run(null));
  });

  it('a skater a person controls is never one of the pressers', () => {
    const w = createWorld(t, 'human-press');
    w.teams[0].tactics = { ...BALANCED, forecheck: 'press' };
    w.human!.controlled = ID.home1;
    place(w, ID.away1, gx - 6, 2, Math.PI);
    giveTo(w, ID.away1);
    place(w, ID.home1, 6, 0, 0);
    place(w, ID.home2, 0, -5, 0);
    place(w, ID.home3, -2, 5, 0);
    for (const id of [ID.home2, ID.home3]) plan(w, id);
    expect(player(w, ID.home2).ai.follow).toBe('carrier');
    expect(player(w, ID.home3).ai.follow).toBe('carrier');
  });
});
