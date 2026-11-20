import { describe, expect, it } from 'vitest';
import look from '../src/data/rinkLook.json';
import { depthHeights, depthStyle } from '../src/game/rinkPaint';
import { VENUE_IDS, venueLook } from '../src/game/venue';

const HEX = /^#[0-9a-f]{6}$/i;

describe('the rink drawn with depth', () => {
  it('the style named is one that exists, and an unknown one is the flat rink', () => {
    expect(depthStyle()).not.toBeNull();
    expect(depthStyle(99)).toBeNull();
  });

  it('every style has colours that are colours and strengths between nothing and all', () => {
    for (const style of look.rinkDepth.styles) {
      for (const hex of [style.boardTop, style.boardFoot, style.capColour]) expect(hex).toMatch(HEX);
      for (const alpha of [style.panelAlpha, style.seamAlpha, style.glassTop, style.glassFoot, style.streakAlpha, style.postAlpha, style.railAlpha, style.shadeAlpha, style.vignette, style.poolAlpha, style.gloss, style.nearCap]) {
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
      expect(style.pools).toBeGreaterThanOrEqual(1);
      expect(style.streakEvery).toBeGreaterThan(0);
    }
  });

  it('the ice stays bright: the light added is gentle and the corners are not dimmed far', () => {
    for (const style of look.rinkDepth.styles) {
      expect(style.vignette).toBeLessThanOrEqual(0.15);
      expect(style.poolAlpha).toBeLessThanOrEqual(0.3);
    }
  });

  it('the far boards and glass fit between the ice and the scoreboard at phone size', () => {
    // At 844 x 390 a metre is about 12 pixels and there are about 21 pixels above the ice.
    for (const style of look.rinkDepth.styles) {
      const { face, glass } = depthHeights(style, 12);
      expect(face + glass).toBeLessThanOrEqual(look.marginPixels + look.standsVerticalPixels);
      expect(face).toBeGreaterThanOrEqual(3);
    }
  });

  it('the near glass is left low: nothing is drawn over the ice but light', () => {
    // The style has no height for the near side at all; this guards against one being added without a look at the puck.
    for (const style of look.rinkDepth.styles) expect(Object.keys(style)).not.toContain('nearGlass');
  });

  it('every building says what colour its lamps throw', () => {
    expect(venueLook().lampColour).toBe(look.colours.light);
    for (const id of VENUE_IDS) expect(venueLook(id).lampColour).toMatch(HEX);
  });

  it('the goal lamp and the reflections have sensible numbers', () => {
    expect(look.effects.goalLamp.off).toMatch(HEX);
    expect(look.effects.goalLamp.washAlpha).toBeLessThan(0.3);
    expect(look.figure.reflection.alpha).toBeLessThan(0.3);
    expect(look.figure.reflection.squash).toBeGreaterThan(0);
    expect(look.figure.reflection.squash).toBeLessThan(1);
  });
});
