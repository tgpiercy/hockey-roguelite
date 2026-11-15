import controls from '../data/controls.json';

export interface ButtonReading {
  pressed: boolean;
  value: number;
}

export interface GamepadSnapshot {
  id: string;
  /** "standard" when the browser recognises the usual Xbox layout. */
  mapping: string;
  buttons: ButtonReading[];
  axes: number[];
}

/** A connected controller and the slot the browser has it in. */
export interface SeenPad {
  index: number;
  pad: GamepadSnapshot;
}

/** True if someone is using this controller right now: a button down, or a stick pushed well over. */
export function inUse(pad: GamepadSnapshot): boolean {
  if (pad.buttons.some((b) => b.pressed || b.value >= controls.padSetup.buttonHeld)) return true;
  const sticks = [controls.axes.moveX, controls.axes.moveY];
  return sticks.some((axis) => Math.abs(pad.axes[axis] ?? 0) >= controls.padSetup.axisHeld);
}

/**
 * Which controller the game listens to. Phones often list things that are not controllers (a fingerprint
 * reader, a remote) ahead of the real one, so the first in the list is not good enough: the game stays with
 * the one it had while that is connected, and moves to another only when that other is being used and the
 * current one is not. With nothing to go on, it prefers one with the standard layout.
 */
export function pickPad(pads: SeenPad[], current: number | null): SeenPad | null {
  if (pads.length === 0) return null;
  const mine = pads.find((p) => p.index === current);
  if (mine && inUse(mine.pad)) return mine;
  const busy = pads.find((p) => inUse(p.pad));
  if (busy) return busy;
  return mine ?? pads.find((p) => p.pad.mapping === 'standard') ?? pads[0]!;
}

/** Which controller each player has, by the slot the browser gave it. */
export interface PadSeats {
  first: number | null;
  second: number | null;
}

/**
 * Who has which controller. Player one is the controller in use, as `pickPad` chooses. A second player
 * joins when another controller is used while joining is open and player one's is still connected; from
 * then on both seats are fixed, so neither can take the other's. If a controller is unplugged its seat
 * empties, and player two moves up if it was player one's.
 */
export function assignSeats(pads: SeenPad[], seats: PadSeats, joinOpen: boolean): PadSeats {
  const has = (index: number | null): boolean => index !== null && pads.some((p) => p.index === index);
  let { first, second } = seats;
  if (!has(second)) second = null;
  if (!has(first)) {
    first = second;
    second = null;
  }
  if (second !== null) return { first, second };
  const other = pads.find((p) => p.index !== first && inUse(p.pad));
  if (first !== null && other && joinOpen) return { first, second: other.index };
  const picked = pickPad(pads, first);
  return { first: picked ? picked.index : null, second: null };
}

let seats: PadSeats = { first: null, second: null };
let joinOpen = false;

/** Lets a second controller join as player two (on the menus), or stops it (during a one-player game). */
export function openJoining(open: boolean): void {
  joinOpen = open;
}

/** True while a second player has a controller. */
export function secondJoined(): boolean {
  seats = assignSeats(seenPads(), seats, joinOpen);
  return seats.second !== null;
}

/** Player two leaves: his controller is free again. */
export function dropSecond(): void {
  seats = { first: seats.first, second: null };
}

/** Every connected controller, as the browser lists them. */
export function seenPads(): SeenPad[] {
  if (typeof navigator.getGamepads !== 'function') return [];
  const seen: SeenPad[] = [];
  let list: ReturnType<typeof navigator.getGamepads>;
  try {
    list = navigator.getGamepads();
  } catch {
    // Some browsers throw when the page is not allowed to read controllers.
    return [];
  }
  for (const pad of list) {
    if (!pad || !pad.connected) continue;
    seen.push({
      index: pad.index,
      pad: {
        id: pad.id,
        mapping: pad.mapping,
        buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
        axes: Array.from(pad.axes),
      },
    });
  }
  return seen;
}

/** Reads a player's controller (player one's by default), or null when he has none. */
export function readGamepad(player: 0 | 1 = 0): GamepadSnapshot | null {
  const pads = seenPads();
  seats = assignSeats(pads, seats, joinOpen);
  const index = player === 0 ? seats.first : seats.second;
  return pads.find((p) => p.index === index)?.pad ?? null;
}
