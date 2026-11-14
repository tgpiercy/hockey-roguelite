import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { portraitOf } from '../src/core/portrait';
import { threeStars } from '../src/core/stars';
import portraitRules from '../src/data/portraits.json';
import starRules from '../src/data/stars.json';
import type { GameResult, PlayerLine } from '../src/sim/match';
import { gridMove, gridRows } from '../src/ui/gridMove';

describe('player portraits', () => {
  const league = generateLeague('portraits');
  const players = Object.values(league.players);

  it('every player gets a valid portrait, the same every time', () => {
    for (const p of players) {
      const face = portraitOf(p.id, p.age);
      expect(portraitRules.skins).toContain(face.skin);
      expect([...portraitRules.hairColours, portraitRules.greyHair]).toContain(face.hairColour);
      expect(portraitRules.hairStyles).toContain(face.hairStyle);
      expect(portraitRules.faces).toContain(face.face);
      expect(portraitRules.brows).toContain(face.brows);
      expect(portraitRules.beards).toContain(face.beard);
      expect(portraitRules.eyeColours).toContain(face.eyeColour);
      expect(portraitOf(p.id, p.age)).toEqual(face);
    }
  });

  it('the league shows real variety', () => {
    const faces = players.map((p) => portraitOf(p.id, 25));
    expect(new Set(faces.map((f) => f.skin)).size).toBe(portraitRules.skins.length);
    expect(new Set(faces.map((f) => f.hairStyle)).size).toBe(portraitRules.hairStyles.length);
    expect(new Set(faces.map((f) => f.beard)).size).toBe(portraitRules.beards.length);
    expect(new Set(faces.map((f) => JSON.stringify(f))).size).toBeGreaterThan(players.length * 0.85);
  });

  it('a player keeps his face for life: only grey hair and a first beard come with age', () => {
    for (const p of players.slice(0, 40)) {
      const young = portraitOf(p.id, 25);
      const old = portraitOf(p.id, 45);
      expect({ ...old, hairColour: '', beard: '' }).toEqual({ ...young, hairColour: '', beard: '' });
    }
  });

  it('nobody is grey before his early thirties, everyone is eventually, and grey never goes back', () => {
    for (const p of players) {
      expect(portraitOf(p.id, portraitRules.greyFromAge - 1).hairColour).not.toBe(portraitRules.greyHair);
      expect(portraitOf(p.id, 60).hairColour).toBe(portraitRules.greyHair);
      let grey = false;
      for (let age = 18; age <= 45; age++) {
        const now = portraitOf(p.id, age).hairColour === portraitRules.greyHair;
        if (grey) expect(now).toBe(true);
        grey = now;
      }
    }
    const at36 = players.filter((p) => portraitOf(p.id, 36).hairColour === portraitRules.greyHair).length / players.length;
    expect(at36).toBeGreaterThan(0.2);
    expect(at36).toBeLessThan(0.8);
  });

  it('the youngest players have no beard yet', () => {
    for (const p of players) expect(portraitOf(p.id, portraitRules.beardFromAge - 1).beard).toBe('none');
    expect(players.some((p) => portraitOf(p.id, 28).beard !== 'none')).toBe(true);
  });
});

const line = (team: 0 | 1, index: number, over: Partial<PlayerLine> = {}): PlayerLine => ({
  id: team * 7 + index,
  team,
  role: index === 6 ? 'goalie' : 'skater',
  line: index >= 3 && index < 6 ? 1 : 0,
  slot: index === 6 ? 0 : index % 3,
  goals: 0,
  assists: 0,
  shots: 0,
  hits: 0,
  blocks: 0,
  timeOnIce: 100,
  saves: 0,
  goalsAgainst: 0,
  ...over,
});
const result = (score: [number, number], overrides: Record<string, Partial<PlayerLine>> = {}): GameResult => ({
  score,
  winner: score[0] > score[1] ? 0 : 1,
  finished: true,
  overtime: false,
  periods: 3,
  players: ([0, 1] as const).flatMap((team) => [0, 1, 2, 3, 4, 5, 6].map((i) => line(team, i, overrides[`${team}-${i}`] ?? {}))),
  powerupsUsed: [],
});

describe('three stars of the game', () => {
  it('picks the three best nights, best first', () => {
    const stars = threeStars(
      result([4, 1], {
        '0-0': { goals: 3, shots: 6 },
        '0-1': { goals: 1, assists: 2, shots: 3 },
        '1-0': { goals: 1, shots: 4 },
        '0-6': { saves: 12, goalsAgainst: 1 },
        '1-6': { saves: 20, goalsAgainst: 4 },
      }),
    );
    expect(stars).toHaveLength(starRules.count);
    expect(stars.map((s) => `${s.team}-${s.index}`)).toEqual(['0-0', '0-1', '0-6']);
    expect(stars[0]!.line).toBe('3 goals');
    expect(stars[1]!.line).toBe('1 goal, 2 assists');
    expect(stars[2]!.line).toBe('12 saves, 1 against');
    expect(stars[0]!.score).toBeGreaterThan(stars[1]!.score);
  });

  it('a goalie with a shutout in a low-scoring win is a star', () => {
    const stars = threeStars(result([1, 0], { '0-2': { goals: 1, shots: 2 }, '0-6': { saves: 24 }, '1-6': { saves: 9, goalsAgainst: 1 } }));
    expect(stars[0]).toMatchObject({ team: 0, index: 6, line: '24 saves, shutout' });
    expect(stars.map((s) => `${s.team}-${s.index}`)).toContain('0-2');
  });

  it('a skater who did nothing is not a star, even on the winning side', () => {
    const stars = threeStars(result([1, 0], { '0-0': { goals: 1, shots: 1 } }));
    expect(stars.map((s) => `${s.team}-${s.index}`)).toEqual(['0-0']);
  });

  it('being on the winning side breaks a tie between equal nights', () => {
    const stars = threeStars(result([2, 1], { '1-0': { goals: 1, shots: 2 }, '0-0': { goals: 1, shots: 2 }, '0-1': { goals: 1, shots: 2 } }));
    expect(stars.slice(0, 2).every((s) => s.team === 0)).toBe(true);
    expect(stars[2]!.team).toBe(1);
  });

  it('there are none for a game that was not finished', () => {
    expect(threeStars({ ...result([3, 0], { '0-0': { goals: 3 } }), finished: false })).toEqual([]);
  });

  it('says what a checker or shot blocker did when he has no points', () => {
    const stars = threeStars(result([1, 0], { '0-0': { goals: 1 }, '1-3': { hits: 5, blocks: 3 } }));
    expect(stars.find((s) => s.team === 1)!.line).toBe('5 hits, 3 blocks');
  });
});

describe('moving around a grid of tiles', () => {
  // The hub: two wide buttons, then five tiles in two columns.
  const hub = [true, true, false, false, false, false, false];

  it('lays wide items on rows of their own and the rest in rows of two', () => {
    expect(gridRows(hub, 2)).toEqual([[0], [1], [2, 3], [4, 5], [6]]);
    expect(gridRows([false, false, false], 2)).toEqual([[0, 1], [2]]);
    expect(gridRows([false, true, false], 2)).toEqual([[0], [1], [2]]);
  });

  it('left and right move within a row and stop at its ends', () => {
    expect(gridMove(hub, 2, 2, 'right')).toBe(3);
    expect(gridMove(hub, 2, 3, 'right')).toBe(3);
    expect(gridMove(hub, 2, 3, 'left')).toBe(2);
    expect(gridMove(hub, 2, 2, 'left')).toBe(2);
    expect(gridMove(hub, 2, 0, 'right')).toBe(0);
  });

  it('up and down keep the column', () => {
    expect(gridMove(hub, 2, 2, 'down')).toBe(4);
    expect(gridMove(hub, 2, 3, 'down')).toBe(5);
    expect(gridMove(hub, 2, 5, 'up')).toBe(3);
    expect(gridMove(hub, 2, 4, 'up')).toBe(2);
  });

  it('a wide button leads into the first tile below it, and every tile under it leads back up to it', () => {
    expect(gridMove(hub, 2, 1, 'down')).toBe(2);
    expect(gridMove(hub, 2, 2, 'up')).toBe(1);
    expect(gridMove(hub, 2, 3, 'up')).toBe(1);
    expect(gridMove(hub, 2, 0, 'down')).toBe(1);
  });

  it('a short last row is reached from either column, and the ends wrap around', () => {
    expect(gridMove(hub, 2, 4, 'down')).toBe(6);
    expect(gridMove(hub, 2, 5, 'down')).toBe(6);
    expect(gridMove(hub, 2, 6, 'down')).toBe(0);
    expect(gridMove(hub, 2, 0, 'up')).toBe(6);
  });

  it('every tile can be reached from the first', () => {
    const seen = new Set([0]);
    let frontier = [0];
    while (frontier.length > 0) {
      const next: number[] = [];
      for (const at of frontier) {
        for (const d of ['up', 'down', 'left', 'right'] as const) {
          const to = gridMove(hub, 2, at, d);
          if (!seen.has(to)) {
            seen.add(to);
            next.push(to);
          }
        }
      }
      frontier = next;
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('an index that is not in the grid stays where it is', () => {
    expect(gridMove(hub, 2, 99, 'down')).toBe(99);
  });
});
