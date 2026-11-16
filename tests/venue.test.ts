import { describe, expect, it } from 'vitest';
import look from '../src/data/rinkLook.json';
import { VENUE_IDS, venueFor, venueLook } from '../src/game/venue';

const HEX = /^#[0-9a-f]{6}$/i;

describe('the buildings games are played in', () => {
  it('gives a game with no venue the look of before', () => {
    const v = venueLook();
    expect(v.rows).toBe(look.arena.maxRows);
    expect(v.emptySeatChance).toBe(look.arena.emptySeatChance);
    expect(v.ice).toBe(look.colours.ice);
    expect(v.wall).toBeNull();
    expect(v.lamps).toBe(0);
    expect(v.flashShare).toBe(0);
    expect(venueLook('no-such-place')).toBe(v);
  });

  it('has every venue drawable: colours that are colours, seats that fit, four words for the ice', () => {
    expect(VENUE_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of VENUE_IDS) {
      const v = venueLook(id);
      expect(v.id).toBe(id);
      expect(v.name.length).toBeGreaterThan(0);
      for (const hex of [v.stands, v.standsEdge, v.ice, v.iceZone, ...(v.wall ? [v.wall] : [])]) expect(hex).toMatch(HEX);
      expect(v.rows).toBeGreaterThan(0);
      expect(v.rows).toBeLessThanOrEqual(look.arena.maxRows);
      expect(v.emptySeatChance).toBeGreaterThanOrEqual(0);
      expect(v.emptySeatChance).toBeLessThan(1);
      expect(v.iceAdverts).toHaveLength(4);
      expect(v.flashShare).toBeGreaterThanOrEqual(0);
      expect(v.flashShare).toBeLessThan(0.2);
      for (const [share, alpha] of v.lightPools) {
        expect(share).toBeGreaterThan(0);
        expect(alpha).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('grows with the season: fewer seats and more of them empty early, the biggest building last', () => {
    const order = look.venueByStage.map((id) => venueLook(id));
    for (let i = 1; i < order.length; i++) {
      expect(order[i]!.rows).toBeGreaterThan(order[i - 1]!.rows);
      expect(order[i]!.emptySeatChance).toBeLessThan(order[i - 1]!.emptySeatChance);
    }
  });

  it('names a venue for every stage, and the last one for anything past the end', () => {
    for (const id of look.venueByStage) expect(VENUE_IDS).toContain(id);
    expect(venueFor(0)).toBe(look.venueByStage[0]);
    expect(venueFor(1)).toBe(look.venueByStage[1]);
    expect(venueFor(99)).toBe(look.venueByStage[look.venueByStage.length - 1]);
    expect(venueFor(-1)).toBe(look.venueByStage[0]);
  });
});
