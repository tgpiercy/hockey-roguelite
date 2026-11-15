import { describe, expect, it } from 'vitest';
import data from '../src/data/commentary.json';
import { Commentator, describe as describeEvent, scoreLine, type CallContext } from '../src/game/commentary';
import type { SimEvent } from '../src/sim/types';

const names = ['Lundanss', 'Wynasen', 'Pellaholt', 'Wynstad', 'Zelovwick', 'Ostaford', 'Pelleholt', 'Okoro', 'Brandt', 'Suzuki', 'Novak', 'Reyes', 'Haas', 'Lindqvist'];
const ctx = (score: [number, number] = [2, 1]): CallContext => ({ name: (id) => names[id] ?? null, teams: ['Gulls', 'Larks'], score });
const goal = (scorer: number, assists: number[] = []): SimEvent => ({ type: 'goal', side: 1, team: scorer < 7 ? 0 : 1, scorer, assists });

describe('the score in words', () => {
  it('names the team in front, or says it is tied', () => {
    expect(scoreLine([2, 1], ['Gulls', 'Larks'])).toBe('2-1 Gulls.');
    expect(scoreLine([1, 3], ['Gulls', 'Larks'])).toBe('3-1 Larks.');
    expect(scoreLine([2, 2], ['Gulls', 'Larks'])).toBe('Tied at 2.');
  });
});

describe('what each event is worth a word for', () => {
  it('a goal names the scorer, the helper if there was one, and the score', () => {
    expect(describeEvent(goal(0), ctx())).toEqual({ kind: 'goal', fill: { name: 'Lundanss', score: '2-1 Gulls.' } });
    expect(describeEvent(goal(8, [9]), ctx([1, 1]))).toEqual({ kind: 'goalAssist', fill: { name: 'Brandt', assist: 'Suzuki', score: 'Tied at 1.' } });
  });

  it('saves name the goalie; a frozen puck is a quieter line', () => {
    expect(describeEvent({ type: 'save', goalie: 6, frozen: false }, ctx())?.kind).toBe('save');
    expect(describeEvent({ type: 'save', goalie: 13, frozen: true }, ctx())).toEqual({ kind: 'freeze', fill: { name: 'Lindqvist' } });
  });

  it('big hits and pokes that work are called; ordinary hits and misses are not', () => {
    expect(describeEvent({ type: 'check', player: 4, target: 8, kind: 'body', success: true, big: true }, ctx())?.kind).toBe('bigHit');
    expect(describeEvent({ type: 'check', player: 4, target: 8, kind: 'body', success: true }, ctx())).toBeNull();
    expect(describeEvent({ type: 'check', player: 4, target: 8, kind: 'poke', success: true }, ctx())?.kind).toBe('poke');
    expect(describeEvent({ type: 'check', player: 4, target: 8, kind: 'poke', success: false }, ctx())).toBeNull();
  });

  it('one-timers, fakes, blocks, tips, posts, momentum and the empty net each have a line', () => {
    expect(describeEvent({ type: 'shot', speed: 30, player: 1, oneTimer: true }, ctx())?.kind).toBe('oneTimer');
    expect(describeEvent({ type: 'shot', speed: 30, player: 1 }, ctx())).toBeNull();
    expect(describeEvent({ type: 'fake', player: 1 }, ctx())?.kind).toBe('fake');
    expect(describeEvent({ type: 'block', player: 5 }, ctx())?.kind).toBe('block');
    expect(describeEvent({ type: 'tip', player: 2 }, ctx())?.kind).toBe('tip');
    expect(describeEvent({ type: 'post' }, ctx())?.kind).toBe('post');
    expect(describeEvent({ type: 'fire', team: 1 }, ctx())).toEqual({ kind: 'fire', fill: { team: 'Larks' } });
    expect(describeEvent({ type: 'pull', team: 0, on: true }, ctx())?.kind).toBe('pullOn');
    expect(describeEvent({ type: 'pickup', player: 1 }, ctx())).toBeNull();
  });

  it('every kind has at least one wording and every wording fills its blanks', () => {
    for (const [kind, lines] of Object.entries(data.lines)) {
      expect(lines.length, kind).toBeGreaterThan(0);
      for (const line of lines) for (const blank of line.match(/\{(\w+)\}/g) ?? []) expect(['{name}', '{assist}', '{score}', '{team}']).toContain(blank);
    }
  });
});

describe('the commentator', () => {
  it('says a line with the right names in it', () => {
    const call = new Commentator('a').call([goal(0, [1])], ctx(), 10)!;
    expect(call.kind).toBe('goalAssist');
    expect(call.text).toContain('Lundanss');
    expect(call.text).toContain('Wynasen');
    expect(call.text).toContain('2-1 Gulls.');
    expect(call.text).not.toMatch(/[{}]/);
  });

  it('picks the biggest thing in a batch', () => {
    const call = new Commentator('b').call([{ type: 'post' }, { type: 'check', player: 4, target: 8, kind: 'poke', success: true }, goal(8)], ctx(), 0)!;
    expect(call.kind).toBe('goal');
  });

  it('never uses the same wording twice running for one kind of play', () => {
    const c = new Commentator('c');
    let last = '';
    for (let i = 0; i < 30; i++) {
      const call = c.call([{ type: 'save', goalie: 6, frozen: false }], ctx(), i * 10)!;
      expect(call.text).not.toBe(last);
      last = call.text;
    }
  });

  it('keeps quiet for a moment after a line, unless something bigger happens', () => {
    const c = new Commentator('d');
    expect(c.call([{ type: 'save', goalie: 6, frozen: false }], ctx(), 5)).not.toBeNull();
    expect(c.call([{ type: 'post' }], ctx(), 5.5)).toBeNull();
    expect(c.call([{ type: 'check', player: 4, target: 8, kind: 'poke', success: true }], ctx(), 6)).toBeNull();
    expect(c.call([goal(0)], ctx(), 6.2)?.kind).toBe('goal');
    expect(c.call([{ type: 'post' }], ctx(), 6.2 + data.minGapSeconds + 0.1)?.kind).toBe('post');
  });

  it('says nothing when nothing worth a word happened', () => {
    expect(new Commentator('e').call([{ type: 'pickup', player: 1 }, { type: 'deke', player: 2 }], ctx(), 0)).toBeNull();
    expect(new Commentator('e').call([], ctx(), 0)).toBeNull();
  });
});
