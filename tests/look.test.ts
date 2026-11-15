import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { userTeam } from '../src/core/league';
import { jerseyColour, setJersey, unlockedJerseys } from '../src/core/prestige';
import { newFranchise } from '../src/core/season';
import { contrast, darken, inkOn, INK_DARK, INK_LIGHT, luminance, menuColours, teamColour } from '../src/core/teamColours';
import prestige from '../src/data/prestige.json';
import colours from '../src/data/teamColours.json';

/** Every colour a team's menus can take: the palette teams draw from, and the jerseys prestige unlocks. */
const ALL = [...colours.palette, ...prestige.jerseys.map((j) => j.colour)];

describe('ink on a team colour', () => {
  it('white is black\'s opposite: luminance runs from 0 to 1 and contrast from 1 to 21', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(contrast('#123456', '#abcdef')).toBe(contrast('#abcdef', '#123456'));
  });

  it('is white on a dark colour and dark on a light one', () => {
    expect(inkOn('#1d3557')).toBe(INK_LIGHT);
    expect(inkOn('#ffe066')).toBe(INK_DARK);
    expect(inkOn('#000000')).toBe(INK_LIGHT);
    expect(inkOn('#ffffff')).toBe(INK_DARK);
  });

  it('every colour a team can have gives a band that text reads on, at both ends', () => {
    for (const colour of ALL) {
      const menu = menuColours(colour);
      // The colour itself, or (where no ink reads on it) a slightly deeper one: never a different hue, never lighter.
      expect(luminance(menu.team)).toBeLessThanOrEqual(luminance(colour) + 1e-9);
      expect(luminance(menu.deep)).toBeLessThan(luminance(menu.team) + 1e-9);
      expect(contrast(menu.team, menu.ink), `${colour}: bright end`).toBeGreaterThanOrEqual(colours.menuContrast);
      expect(contrast(menu.deep, menu.ink), `${colour}: deep end`).toBeGreaterThanOrEqual(colours.menuContrast);
    }
  });

  it('darkening goes toward black', () => {
    expect(darken('#808080', 0)).toBe('#808080');
    expect(darken('#808080', 1)).toBe('#000000');
    expect(darken('#ff8040', 0.5)).toBe('#804020');
  });
});

describe('the club\'s own colours', () => {
  it('your first jersey is a colour from your team\'s name, as every other team\'s is', () => {
    const f = newFranchise(generateLeague('colours'));
    const name = userTeam(f.league).name;
    expect(jerseyColour(f)).toBe(teamColour(name));
    expect(unlockedJerseys(f)).toEqual([{ name: 'Club colours', colour: teamColour(name) }]);
    expect(colours.palette).toContain(jerseyColour(f));
  });

  it('prestige still unlocks the others, and choosing one changes the colour', () => {
    const f = newFranchise(generateLeague('colours'));
    f.prestige.level = 2;
    const open = unlockedJerseys(f);
    expect(open).toHaveLength(3);
    expect(open.slice(1)).toEqual(prestige.jerseys.slice(1, 3));
    expect(setJersey(f, 2).ok).toBe(true);
    expect(jerseyColour(f)).toBe(prestige.jerseys[2]!.colour);
    expect(setJersey(f, 3).ok).toBe(false);
  });

  it('different teams mostly get different colours', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(jerseyColour(newFranchise(generateLeague(`club-${i}`))));
    expect(seen.size).toBeGreaterThan(5);
  });
});
