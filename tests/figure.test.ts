import { describe, expect, it } from 'vitest';
import { teamCrest } from '../src/core/crest';
import look from '../src/data/rinkLook.json';
import { facingSide, figure, figureColours, skinTone, STANDING, TAGS, withStick, type Figure, type Shape } from '../src/game/figure';

const F = look.figure;
type Limb = Extract<Shape, { kind: 'limb' }>;

/** The box a figure fills: left, right, top and bottom. */
function box(shapes: readonly Shape[]): { left: number; right: number; top: number; bottom: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of shapes) {
    if (s.kind === 'circle') {
      xs.push(s.x - s.r, s.x + s.r);
      ys.push(s.y - s.r, s.y + s.r);
    } else if (s.kind === 'limb') {
      xs.push(s.x1 - s.w / 2, s.x1 + s.w / 2, s.x2 - s.w / 2, s.x2 + s.w / 2);
      ys.push(s.y1 - s.w / 2, s.y1 + s.w / 2, s.y2 - s.w / 2, s.y2 + s.w / 2);
    } else {
      for (const [x, y] of s.points) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
const skates = (fig: Figure): Limb[] => fig.shapes.filter((s): s is Limb => s.kind === 'limb' && s.tag === 'skate');
const mid = (s: Limb | undefined): number => (s ? (s.x1 + s.x2) / 2 : Number.NaN);
const helmetOf = (fig: Figure): Extract<Shape, { kind: 'circle' }> => {
  const h = fig.shapes.find((s) => s.tag === 'helmet');
  if (!h || h.kind !== 'circle') throw new Error('no helmet');
  return h;
};

describe('the on-ice figure', () => {
  it('stands on his feet at the origin, exactly as tall as the table says, with the head on top', () => {
    const fig = figure(STANDING);
    const b = box(fig.shapes);
    expect(b.top).toBeCloseTo(-F.height);
    expect(fig.top).toBeCloseTo(-F.height);
    // Nothing reaches below the ice by more than the thickness of a skate blade.
    expect(Math.abs(b.bottom)).toBeLessThan(0.1);
    const helmet = helmetOf(fig);
    expect(helmet.y - helmet.r).toBeCloseTo(b.top);
  });

  it('facing left is the exact mirror of facing right', () => {
    const pose = { ...STANDING, stride: 1.1, speed: 0.7, windUp: 0.4 };
    const right = figure({ ...pose, side: 1 });
    const left = figure({ ...pose, side: -1 });
    expect(left.shapes).toHaveLength(right.shapes.length);
    right.shapes.forEach((s, i) => {
      const m = left.shapes[i] as Shape;
      expect(m.tag).toBe(s.tag);
      if (s.kind === 'circle' && m.kind === 'circle') {
        expect(m.x).toBeCloseTo(-s.x);
        expect(m.y).toBeCloseTo(s.y);
      } else if (s.kind === 'limb' && m.kind === 'limb') {
        expect(m.x1).toBeCloseTo(-s.x1);
        expect(m.x2).toBeCloseTo(-s.x2);
        expect(m.y1).toBeCloseTo(s.y1);
      }
    });
    expect(left.hand.x).toBeCloseTo(-right.hand.x);
  });

  it('the legs swing opposite ways through a stride and pass each other in the middle', () => {
    const forward = skates(figure({ ...STANDING, stride: Math.PI / 2, speed: 1 }));
    const back = skates(figure({ ...STANDING, stride: (3 * Math.PI) / 2, speed: 1 }));
    const level = skates(figure({ ...STANDING, stride: Math.PI, speed: 1 }));
    expect(forward).toHaveLength(2);
    // One foot ahead and one behind, and they swap half a stride later.
    expect(mid(forward[0])).toBeLessThan(mid(forward[1]));
    expect(mid(back[0])).toBeGreaterThan(mid(back[1]));
    expect(mid(level[0])).toBeCloseTo(mid(level[1]));
    // A faster skater strides longer.
    const slow = skates(figure({ ...STANDING, stride: Math.PI / 2, speed: 0 }));
    expect(mid(forward[1]) - mid(forward[0])).toBeGreaterThan(mid(slow[1]) - mid(slow[0]));
  });

  it('leans into his skating and winds up by drawing his hands back and up', () => {
    expect(helmetOf(figure({ ...STANDING, speed: 1 })).x).toBeGreaterThan(helmetOf(figure(STANDING)).x);
    const rest = figure(STANDING).hand;
    const wound = figure({ ...STANDING, windUp: 1 }).hand;
    expect(wound.x).toBeLessThan(rest.x);
    expect(wound.y).toBeLessThan(rest.y);
  });

  it('a goalie is wider than a skater, and lower and wider still when he goes down', () => {
    const skater = box(figure(STANDING).shapes);
    const up = box(figure({ ...STANDING, goalie: true }).shapes);
    const down = box(figure({ ...STANDING, goalie: true, down: true }).shapes);
    expect(up.right - up.left).toBeGreaterThan(skater.right - skater.left);
    expect(down.right - down.left).toBeGreaterThan(up.right - up.left);
    expect(down.top).toBeGreaterThan(up.top);
    expect(figure({ ...STANDING, goalie: true }).stickEnd).not.toBeNull();
    expect(figure(STANDING).stickEnd).toBeNull();
  });

  it('every piece has a known kind of colour, and the pieces come in the same order every time', () => {
    const poses = [STANDING, { ...STANDING, goalie: true }, { ...STANDING, goalie: true, down: true }, { ...STANDING, pattern: 'yoke' as const }, { ...STANDING, pattern: 'sash' as const }];
    for (const pose of poses) {
      const a = figure(pose);
      const b = figure({ ...pose, stride: 2, speed: 0.5 });
      for (const s of a.shapes) expect(TAGS).toContain(s.tag);
      expect(b.shapes.map((s) => `${s.kind}:${s.tag}`)).toEqual(a.shapes.map((s) => `${s.kind}:${s.tag}`));
    }
  });

  it('tipping him over moves his head sideways and down', () => {
    const tipped = figure({ ...STANDING, tilt: F.staggerTilt });
    expect(tipped.top).toBeGreaterThan(figure(STANDING).top);
    expect(helmetOf(tipped).x).toBeGreaterThan(1);
  });

  it('his stick runs from above his hand to the blade, tucked behind the near arm', () => {
    const fig = figure(STANDING);
    const end = { x: 1.6, y: -0.1 };
    const shapes = withStick(fig, end, 1);
    expect(shapes).toHaveLength(fig.shapes.length + 2);
    const at = shapes.findIndex((s) => s.tag === 'stick');
    expect(at).toBe(fig.shapes.length - 3);
    const shaft = shapes[at] as Limb;
    expect(shaft.x2).toBe(end.x);
    expect(shaft.y2).toBe(end.y);
    // The butt end is above the hand that grips it.
    expect(shaft.y1).toBeLessThan(fig.hand.y);
  });
});

describe('which way a figure faces', () => {
  it('right when he faces right, left when he faces left', () => {
    expect(facingSide(0, undefined)).toBe(1);
    expect(facingSide(Math.PI, undefined)).toBe(-1);
    expect(facingSide(0.6, -1)).toBe(1);
    expect(facingSide(Math.PI - 0.6, 1)).toBe(-1);
  });

  it('keeps the side he had while he faces nearly straight up or down the screen', () => {
    const nearlyUp = -Math.PI / 2 + 0.1;
    expect(Math.abs(Math.cos(nearlyUp))).toBeLessThan(F.sideDeadBand);
    expect(facingSide(nearlyUp, 1)).toBe(1);
    expect(facingSide(nearlyUp, -1)).toBe(-1);
    expect(facingSide(-Math.PI / 2 - 0.1, 1)).toBe(1);
    // With no side yet, he takes the one he leans toward.
    expect(facingSide(nearlyUp, undefined)).toBe(1);
  });
});

describe('figure colours', () => {
  it('the jersey is the team colour, the accent and socks its second colour, a goalie a lighter shade', () => {
    const crest = teamCrest('Greyport Tinkers');
    const skater = figureColours(crest, false, skinTone(0));
    const goalie = figureColours(crest, true, skinTone(0));
    expect(skater.jersey).toBe(crest.primary);
    expect(skater.accent).toBe(crest.secondary);
    expect(skater.sock).toBe(crest.secondary);
    expect(goalie.jersey).not.toBe(crest.primary);
    for (const tag of TAGS) expect(skater[tag]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('on the road the jersey is white and the team colour moves to the helmet, pattern, gloves, pants and socks', () => {
    const crest = teamCrest('Greyport Tinkers');
    const home = figureColours(crest, false, skinTone(0), 'home');
    const away = figureColours(crest, false, skinTone(0), 'away');
    expect(home).toEqual(figureColours(crest, false, skinTone(0)));
    expect(away.jersey).toBe(F.awayKit.jersey);
    expect(away.jersey).not.toBe(home.jersey);
    for (const tag of ['accent', 'glove', 'pants', 'sock'] as const) expect(away[tag]).toBe(crest.primary);
    expect(figureColours(crest, true, skinTone(0), 'away').jersey).toBe(F.awayKit.goalieJersey);
    for (const tag of TAGS) expect(away[tag]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('skin tones vary between players and are the same each time for one player', () => {
    expect(skinTone(4)).toBe(skinTone(4));
    expect(new Set([0, 1, 2, 3, 4, 5, 6].map(skinTone)).size).toBeGreaterThan(2);
  });
});
