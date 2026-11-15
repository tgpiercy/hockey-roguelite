import { describe, expect, it } from 'vitest';
import { conditionWords, FAMILIES, familyInfo, familyOf, familyOfStat } from '../src/core/artifactFamily';
import artifacts from '../src/data/artifacts.json';
import look from '../src/data/artifactLook.json';
import { ON, WHEN } from '../src/sim/conditions';
import type { Modifier } from '../src/sim/modifiers';
import { ICON_NAMES } from '../src/ui/Icon';
import { BACKDROPS, STOP_MARKS } from '../src/ui/SeasonMap';
import seasonRules from '../src/data/season.json';
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

describe('artifact families', () => {
  const list = artifacts as unknown as { id: string; modifiers: Modifier[]; bargain?: { handicap: Modifier[] } }[];

  it('every artifact belongs to one, and every family has an icon that exists and a colour', () => {
    for (const a of list) expect(familyOf(a.modifiers), a.id).not.toBeNull();
    expect(FAMILIES.length).toBeGreaterThanOrEqual(7);
    for (const id of FAMILIES) {
      const family = familyInfo(id);
      expect(ICON_NAMES as string[], id).toContain(family.icon);
      expect(family.colour).toMatch(/^#[0-9a-f]{6}$/);
      // Each family is used by something.
      expect(list.some((a) => familyOf(a.modifiers) === id), id).toBe(true);
    }
  });

  it('a stat belongs to at most one family', () => {
    const seen = new Map<string, string>();
    for (const id of FAMILIES) {
      for (const stat of (look.families as Record<string, { stats: string[] }>)[id]!.stats) {
        expect(seen.has(stat), `${stat} is in ${seen.get(stat)} and ${id}`).toBe(false);
        seen.set(stat, id);
        expect(familyOfStat(stat)).toBe(id);
      }
    }
    expect(familyOfStat('nonsense')).toBeNull();
  });

  it('a condition is put in a few words, once each', () => {
    expect(conditionWords([{ stat: 'shotPower', op: 'add', value: 1 }])).toEqual([]);
    expect(conditionWords([
      { stat: 'shotPower', op: 'add', value: 1, when: 'trailing' },
      { stat: 'accuracy', op: 'add', value: 1, when: 'trailing' },
      { stat: 'accuracy', op: 'add', value: 1, on: 'save', seconds: 5 },
    ])).toEqual(['While trailing', 'After a save']);
    // Every condition and trigger the game knows has its words.
    for (const when of [...WHEN, 'home']) expect((look.when as Record<string, string>)[when], when).toBeDefined();
    for (const on of ON) expect((look.on as Record<string, string>)[on], on).toBeDefined();
  });
});

describe('the drawn map', () => {
  it('every kind of stop has an icon that exists', () => {
    for (const kind of ['game', 'training', 'event', 'shop', 'boss'] as const) {
      expect(ICON_NAMES as string[], kind).toContain(STOP_MARKS[kind].icon);
      expect(STOP_MARKS[kind].name.length).toBeGreaterThan(2);
    }
  });

  it('there is a skyline for each region, drawn left to right inside its box', () => {
    expect(BACKDROPS.length).toBeGreaterThanOrEqual(seasonRules.regions);
    for (const backdrop of BACKDROPS) {
      expect(backdrop.points.length).toBeGreaterThan(8);
      let last = -1;
      for (const [x, y] of backdrop.points) {
        expect(x).toBeGreaterThanOrEqual(last);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThanOrEqual(1);
        last = x;
      }
    }
  });
});
