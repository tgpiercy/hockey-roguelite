import data from '../data/crests.json';
import { createRng } from './rng';
import { colourDistance, teamColour } from './teamColours';

export type CrestShape = 'shield' | 'circle' | 'diamond' | 'hexagon';
export type JerseyPattern = 'yoke' | 'hoop' | 'sash';

/** A team's badge and jersey design, worked out from its name so it is always the same. */
export interface Crest {
  shape: CrestShape;
  emblem: string;
  /** The team's main colour: the jersey and the badge's field. */
  primary: string;
  /** Its second colour: the emblem and the jersey's pattern. Always clearly different from the main one. */
  secondary: string;
  /** The badge's border: white on a dark team, near-black on a light one. */
  trim: string;
  /** How the second colour is worn on the jersey. */
  pattern: JerseyPattern;
}

/** A point in a badge's own space: both axes run -1 to 1, y down. */
export type Point = [number, number];

/** One filled piece of an emblem. "cut" pieces are drawn in the field colour, to punch a hole. */
export interface EmblemPart {
  points: Point[];
  cut?: boolean;
}

const ring = (radius: number, sides = 20): Point[] =>
  Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius] as Point;
  });

const starPoints = (): Point[] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.62 : 0.26;
    return [Math.cos(a) * r, Math.sin(a) * r] as Point;
  });

/** The outline of each badge shape. */
export const SHAPE_POINTS: Record<CrestShape, Point[]> = {
  shield: [
    [-0.82, -0.9],
    [0.82, -0.9],
    [0.82, 0.05],
    [0.5, 0.62],
    [0, 0.98],
    [-0.5, 0.62],
    [-0.82, 0.05],
  ],
  circle: ring(0.95, 28),
  diamond: [
    [0, -1],
    [0.88, 0],
    [0, 1],
    [-0.88, 0],
  ],
  hexagon: [
    [-0.5, -0.92],
    [0.5, -0.92],
    [0.98, 0],
    [0.5, 0.92],
    [-0.5, 0.92],
    [-0.98, 0],
  ],
};

/** The pieces of each emblem. */
export const EMBLEM_PARTS: Record<string, EmblemPart[]> = {
  star: [{ points: starPoints() }],
  bolt: [
    {
      points: [
        [0.12, -0.66],
        [-0.36, 0.08],
        [-0.04, 0.08],
        [-0.16, 0.66],
        [0.36, -0.1],
        [0.04, -0.1],
      ],
    },
  ],
  peak: [
    {
      points: [
        [-0.62, 0.46],
        [-0.16, -0.38],
        [0.06, -0.02],
        [0.26, -0.3],
        [0.62, 0.46],
      ],
    },
  ],
  wave: [
    {
      points: [
        [-0.62, -0.08],
        [-0.3, -0.38],
        [0, -0.08],
        [0.3, -0.38],
        [0.62, -0.08],
        [0.62, 0.14],
        [0.3, -0.16],
        [0, 0.14],
        [-0.3, -0.16],
        [-0.62, 0.14],
      ],
    },
    {
      points: [
        [-0.62, 0.3],
        [-0.3, 0],
        [0, 0.3],
        [0.3, 0],
        [0.62, 0.3],
        [0.62, 0.52],
        [0.3, 0.22],
        [0, 0.52],
        [-0.3, 0.22],
        [-0.62, 0.52],
      ],
    },
  ],
  flame: [
    {
      points: [
        [0, -0.7],
        [0.2, -0.3],
        [0.44, -0.12],
        [0.42, 0.3],
        [0.2, 0.58],
        [0, 0.64],
        [-0.2, 0.58],
        [-0.42, 0.3],
        [-0.36, -0.04],
        [-0.14, -0.2],
      ],
    },
    {
      cut: true,
      points: [
        [0, -0.02],
        [0.16, 0.3],
        [0, 0.46],
        [-0.16, 0.3],
      ],
    },
  ],
  leaf: [
    {
      points: [
        [0, -0.68],
        [0.42, -0.2],
        [0.4, 0.26],
        [0.06, 0.5],
        [0.06, 0.7],
        [-0.06, 0.7],
        [-0.06, 0.5],
        [-0.4, 0.26],
        [-0.42, -0.2],
      ],
    },
  ],
  chevron: [
    {
      points: [
        [-0.6, -0.44],
        [0, 0.02],
        [0.6, -0.44],
        [0.6, -0.12],
        [0, 0.34],
        [-0.6, -0.12],
      ],
    },
    {
      points: [
        [-0.6, 0.06],
        [0, 0.52],
        [0.6, 0.06],
        [0.6, 0.3],
        [0, 0.72],
        [-0.6, 0.3],
      ],
    },
  ],
  ring: [{ points: ring(0.6) }, { cut: true, points: ring(0.34) }],
};

/** How bright a colour looks, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * A team's crest and jersey design from its name. `primary` overrides the main colour
 * (your team wears the jersey colour you chose); left out, it is the team's own colour.
 */
export function teamCrest(teamName: string, primary: string = teamColour(teamName)): Crest {
  const rng = createRng(`crest/${teamName}`);
  const shape = rng.pick(data.shapes) as CrestShape;
  const emblem = rng.pick(data.emblems);
  const pattern = rng.pick(data.patterns) as JerseyPattern;
  // The second colour: the first on the team's own shuffled list that stands out against the main one.
  const order = rng.shuffle(data.secondaries);
  const secondary = order.find((colour) => colourDistance(colour, primary) >= data.minSecondaryDistance) ?? order[0]!;
  return {
    shape,
    emblem,
    primary,
    secondary,
    trim: luminance(primary) < data.darkBelowLuminance ? data.lightTrim : data.darkTrim,
    pattern,
  };
}
