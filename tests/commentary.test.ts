import { describe, expect, it } from 'vitest';
import data from '../src/data/commentary.json';
import { Commentator, describe as describeEvent, momentOf, scoreLine, type CallContext } from '../src/game/commentary';
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

describe('a goal called from its parts', () => {
  const fills = { name: 'Lundanss', assist: 'Wynasen', team: 'Gulls', n: '2', score: '2-1 Gulls.' };
  const filled = (line: string): string => line.replace(/\{(\w+)\}/g, (_, key: string) => (fills as Record<string, string>)[key] ?? `{${key}}`);

  it('what the goal means for the score', () => {
    expect(momentOf([1, 0], 0, 1, false)).toBe('first');
    expect(momentOf([2, 2], 1, 1, false)).toBe('ties');
    expect(momentOf([3, 2], 0, 1, false)).toBe('ahead');
    expect(momentOf([1, 2], 0, 1, false)).toBe('within');
    expect(momentOf([4, 1], 0, 2, false)).toBe('plain');
    expect(momentOf([1, 4], 0, 1, false)).toBe('plain');
    expect(momentOf([4, 1], 0, 3, false)).toBe('hatTrick');
    expect(momentOf([3, 2], 0, 3, true)).toBe('winner');
  });

  it('every part has wordings and every wording fills its blanks', () => {
    const lists = [...Object.values(data.goal.how), data.goal.from, ...Object.values(data.goal.moment), ...Object.values(data.once)];
    for (const list of lists) {
      expect(list.length).toBeGreaterThan(0);
      for (const line of list) expect(filled(line)).not.toMatch(/[{}]/);
    }
    // Every way a goal can go in is said with the scorer's name; every once-a-game line belongs to a kind that exists.
    for (const list of Object.values(data.goal.how)) for (const line of list) expect(line).toContain('{name}');
    for (const kind of Object.keys(data.once)) expect(Object.keys(data.lines)).toContain(kind);
    for (const kind of Object.keys(data.sayChance)) expect(Object.keys(data.lines)).toContain(kind);
  });

  it('says how it went in and what it means: a one-timer that ties the game', () => {
    const c = new Commentator('parts');
    const call = c.call([{ type: 'shot', speed: 30, player: 0, oneTimer: true }, goal(0, [1])], ctx([2, 2]), 10)!;
    expect(data.goal.how.oneTimer.map(filled)).toContain(call.text.split('! ')[0] + '!');
    expect(data.goal.moment.ties.some((line) => call.text.endsWith(filled(line).replace('2-1 Gulls.', 'Tied at 2.')))).toBe(true);
  });

  it('with nothing special about the score, the passer is named some of the time and the score always', () => {
    let named = 0;
    for (let seed = 0; seed < 40; seed++) {
      const call = new Commentator(`plain-${seed}`).call([goal(0, [1])], ctx([4, 1]), 10)!;
      expect(call.text).toContain('Lundanss');
      expect(call.text).toContain('4-1 Gulls.');
      expect(call.text).not.toMatch(/[{}]/);
      if (call.text.includes('Wynasen')) named += 1;
    }
    expect(named).toBeGreaterThan(8);
    expect(named).toBeLessThan(40);
  });

  it('a third goal by one man is a hat-trick, and overtime is the winner', () => {
    const c = new Commentator('hat');
    c.call([goal(0)], ctx([1, 0]), 10);
    c.call([goal(0)], ctx([2, 0]), 20);
    const third = c.call([goal(0)], ctx([3, 0]), 30)!;
    expect(data.goal.moment.hatTrick.some((line) => third.text.includes(line.split('{')[0]!.trim()))).toBe(true);
    const winner = new Commentator('ot').call([goal(7)], { ...ctx([2, 3]), overtime: true }, 10)!;
    expect(winner.text).toContain('overtime');
    expect(winner.text).toContain('Larks');
  });
});

describe('what is not said', () => {
  it('in a game that is no longer close only the big things are called', () => {
    const c = new Commentator('rout');
    expect(c.call([{ type: 'save', goalie: 6, frozen: false }], ctx([5, 1]), 10)).toBeNull();
    expect(c.call([{ type: 'check', player: 0, target: 7, kind: 'body', success: true, big: true }], ctx([5, 1]), 20)).toBeNull();
    expect(c.call([goal(0)], ctx([6, 1]), 30)).not.toBeNull();
    expect(c.call([{ type: 'save', goalie: 6, frozen: false }], ctx([2, 1]), 40)).not.toBeNull();
  });

  it('a line kept for once a game is said once at most, however long the game', () => {
    const c = new Commentator('once');
    const heard: string[] = [];
    for (let n = 0; n < 400; n++) {
      const call = c.call([{ type: 'save', goalie: 6, frozen: false }], ctx([1, 1]), n * 10);
      if (call) heard.push(call.text);
    }
    for (const line of data.once.save) {
      const text = line.replace('{name}', names[6]!);
      expect(heard.filter((h) => h === text)).toHaveLength(1);
    }
  });

  it('a poke is called only some of the time', () => {
    const c = new Commentator('pokes');
    let said = 0;
    for (let n = 0; n < 200; n++) if (c.call([{ type: 'check', player: 0, target: 7, kind: 'poke', success: true }], ctx([1, 1]), n * 10)) said += 1;
    expect(said).toBeGreaterThan(200 * data.sayChance.poke * 0.6);
    expect(said).toBeLessThan(200 * data.sayChance.poke * 1.4);
  });

  it('a save from a one-timer has words of its own', () => {
    let own = 0;
    for (let seed = 0; seed < 30; seed++) {
      const c = new Commentator(`rob-${seed}`);
      c.call([{ type: 'shot', speed: 30, player: 7, oneTimer: true }], ctx([1, 1]), 10);
      const call = c.call([{ type: 'save', goalie: 6, frozen: false }], ctx([1, 1]), 20)!;
      if (data.lines.saveOneTimer.some((line) => call.text === line.replace('{name}', names[6]!))) own += 1;
    }
    expect(own).toBe(30);
    // And the save after that one is an ordinary save again.
    const c = new Commentator('rob-then');
    c.call([{ type: 'shot', speed: 30, player: 7, oneTimer: true }], ctx([1, 1]), 10);
    c.call([{ type: 'save', goalie: 6, frozen: false }], ctx([1, 1]), 20);
    const next = c.call([{ type: 'save', goalie: 6, frozen: false }], ctx([1, 1]), 30)!;
    expect(data.lines.saveOneTimer.some((line) => next.text === line.replace('{name}', names[6]!))).toBe(false);
  });
});

