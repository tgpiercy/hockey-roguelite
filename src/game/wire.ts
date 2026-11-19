import online from '../data/online.json';
import type { PackedWorld } from '../sim/snapshot';
import type { Tuning } from '../sim/tuning';

/**
 * A game across two devices, what the two say to each other and what carries it. Only types come from the simulation, so the menus can use this without it.
 * Nothing here touches the page: `Wire` is whatever carries the messages (`peer.ts` in the game, a made-up one in tests).
 */
export interface Wire {
  /** A short message that may be lost or come out of order. */
  sendFast(data: Uint8Array): void;
  /** A message that arrives, in the order sent. */
  sendSure(text: string): void;
  onFast: ((data: Uint8Array) => void) | null;
  onSure: ((text: string) => void) | null;
  onClosed: (() => void) | null;
  close(): void;
}

/** What goes on the sure line, as text. */
export type SureMessage =
  | { k: 'start'; build: string; world: PackedWorld; tuning: Tuning; show: unknown }
  | { k: 'ready' }
  | { k: 'full'; tick: number; guestLatest: number; world: PackedWorld }
  | { k: 'pause'; on: boolean }
  | { k: 'bye' };

export function readSure(text: string): SureMessage | null {
  try {
    const m = JSON.parse(text) as SureMessage;
    return m && typeof m.k === 'string' ? m : null;
  } catch {
    return null;
  }
}

/** A sure message cut into pieces small enough for any browser's line: '+' more to come, '.' the last. */
export function cutSure(text: string): string[] {
  const out: string[] = [];
  for (let at = 0; at < text.length || out.length === 0; at += online.sureChunk) out.push((at + online.sureChunk < text.length ? '+' : '.') + text.slice(at, at + online.sureChunk));
  return out;
}

/** Puts the pieces back together: give it each as it comes, and it returns the whole message when the last is in. */
export function joinSure(): (piece: string) => string | null {
  let held = '';
  return (piece) => {
    held += piece.slice(1);
    if (piece[0] !== '.') return null;
    const whole = held;
    held = '';
    return whole;
  };
}
