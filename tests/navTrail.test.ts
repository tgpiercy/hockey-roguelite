import { describe, expect, it } from 'vitest';
import { navStep } from '../src/ui/navTrail';

describe('which way the menus are moving', () => {
  it('a new screen is forward, the one before it is back, and staying put is neither', () => {
    const trail: string[] = [];
    expect(navStep(trail, 'title')).toBe('forward');
    expect(navStep(trail, 'home')).toBe('forward');
    expect(navStep(trail, 'home')).toBe('same');
    expect(navStep(trail, 'team')).toBe('forward');
    expect(navStep(trail, 'home')).toBe('back');
    expect(trail).toEqual(['title', 'home']);
  });

  it('going back several screens at once is still back, and leaves the trail at that screen', () => {
    const trail: string[] = [];
    for (const name of ['title', 'home', 'team', 'lineup', 'player']) navStep(trail, name);
    expect(navStep(trail, 'home')).toBe('back');
    expect(trail).toEqual(['title', 'home']);
    expect(navStep(trail, 'team')).toBe('forward');
  });

  it('the trail does not grow without end', () => {
    const trail: string[] = [];
    for (let i = 0; i < 100; i++) navStep(trail, `screen ${i}`, 10);
    expect(trail.length).toBe(10);
    expect(trail[9]).toBe('screen 99');
  });
});
