import look from '../data/rinkLook.json';

/**
 * The building a game is played in: how many rows of seats, how full they are, what the walls and the ice
 * look like, and how it is lit. It changes the drawing only; the rink and the game are the same everywhere.
 */
export interface Venue {
  id: string;
  name: string;
  /** Rows of seats round the boards, and the chance a seat is empty. */
  rows: number;
  emptySeatChance: number;
  /** The seating, the edge of each tier, and (where the seats stop short of the screen) the wall behind them. */
  stands: string;
  standsEdge: string;
  wall: string | null;
  /** Lines drawn across the wall, as planks: how far apart, and how strongly. Nothing when zero. */
  plankGap: number;
  plankAlpha: number;
  ice: string;
  iceZone: string;
  /** Soft light over the whole sheet: each a share of the rink's size and a strength. */
  lightPools: [number, number][];
  /** Hanging lamps down the middle: how many, each one's size as a share of the rink's width, and its strength. */
  lamps: number;
  lampSize: number;
  lampAlpha: number;
  /** The words painted on the ice. */
  iceAdverts: string[];
  /** Whether the boards carry the two teams' colours between the white panels. */
  teamPanels: boolean;
  /** Camera flashes in the crowd when it is excited: the share of fans flashing at the height of it. */
  flashShare: number;
}

type Override = Partial<Omit<Venue, 'id'>>;

const venues = look.venues as unknown as Record<string, Override>;

/** The look of before, which is what a game with no venue named gets (exhibition, practice). */
const BASE: Venue = {
  id: 'standard',
  name: 'Arena',
  rows: look.arena.maxRows,
  emptySeatChance: look.arena.emptySeatChance,
  stands: look.colours.stands,
  standsEdge: look.colours.standsEdge,
  wall: null,
  plankGap: 0,
  plankAlpha: 0,
  ice: look.colours.ice,
  iceZone: look.colours.iceZone,
  lightPools: look.arena.lightPools as [number, number][],
  lamps: 0,
  lampSize: 0,
  lampAlpha: 0,
  iceAdverts: look.arena.iceAdverts,
  teamPanels: true,
  flashShare: 0,
};

/** Every venue there is, by id. */
export const VENUE_IDS: string[] = Object.keys(venues);

/** A venue's look: the standard one with that venue's own numbers on top. An unknown or missing id is the standard look. */
export function venueLook(id?: string): Venue {
  const own = id ? venues[id] : undefined;
  return own ? { ...BASE, ...own, id: id as string } : BASE;
}

/** The venue for a stage of the season: 0, 1, 2 for the regions in order; anything past the last listed (the playoffs) gets the last. */
export function venueFor(stage: number): string {
  const order = look.venueByStage;
  return order[Math.max(0, Math.min(order.length - 1, Math.floor(stage)))] as string;
}
