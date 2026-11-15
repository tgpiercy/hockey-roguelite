import data from '../data/music.json';
import type { SimEvent } from '../sim/types';

export type PieceName = keyof typeof data.pieces;

/** One note ready to play: its pitch in Hz, and when it starts and how long it lasts, in seconds from the start of the piece. */
export interface Note {
  freq: number;
  start: number;
  seconds: number;
}

export interface TrackSpec {
  wave: string;
  gain: number;
  attack: number;
  release: number;
  /** A low-pass filter's frequency, for a softer edge. Left out, none. */
  filter?: number;
  /** The tune: "C4:1 E4:.5 -:2" is a note name and its length in beats; "-" is a rest. */
  notes: string;
}

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The MIDI number of a note name such as "C4", "Eb3" or "F#5" (A4 is 69); null if it is not a note. */
export function midiOf(name: string): number | null {
  const m = /^([A-G])([b#]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const step = STEPS[m[1] as string] as number;
  return (Number(m[3]) + 1) * 12 + step + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** The pitch of a MIDI number in Hz: A4 (69) is 440. */
export function frequencyOf(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Reads a track's tune at a tempo into notes with times in seconds. Rests move time on and make no note. */
export function readTrack(notes: string, bpm: number): { notes: Note[]; seconds: number } {
  const beat = 60 / bpm;
  const out: Note[] = [];
  let at = 0;
  for (const word of notes.split(/\s+/).filter((w) => w !== '')) {
    const [name, length] = word.split(':');
    const beats = Number(length);
    if (!Number.isFinite(beats) || beats <= 0) throw new Error(`bad note length in "${word}"`);
    if (name !== '-') {
      const midi = midiOf(name as string);
      if (midi === null) throw new Error(`bad note name in "${word}"`);
      out.push({ freq: frequencyOf(midi), start: at * beat, seconds: beats * beat });
    }
    at += beats;
  }
  return { notes: out, seconds: at * beat };
}

export const PIECES = Object.keys(data.pieces) as PieceName[];

export function pieceSpec(name: PieceName): { bpm: number; loop: boolean; tracks: TrackSpec[] } {
  return data.pieces[name] as { bpm: number; loop: boolean; tracks: TrackSpec[] };
}

/** How long a piece lasts: its longest track. */
export function pieceSeconds(name: PieceName): number {
  const piece = pieceSpec(name);
  return Math.max(...piece.tracks.map((track) => readTrack(track.notes, piece.bpm).seconds));
}

/** The short piece for something that just happened in a game, or null. `myTeam` decides whose goal is the happy one. */
export function stingFor(events: readonly SimEvent[], myTeam: 0 | 1): PieceName | null {
  let pick: PieceName | null = null;
  for (const e of events) {
    if (e.type === 'goal') return e.team === myTeam ? 'goalFor' : 'goalAgainst';
    // The organ strikes up as a period ends, to carry the break.
    if (e.type === 'period' && pick === null) pick = 'organ';
    // A fanfare for a mascot's arrival, for either side.
    if (e.type === 'mascot' && e.arrived) pick = 'fanfare';
  }
  return pick;
}

/** The piece for the end of a game. */
export function resultPiece(won: boolean): PieceName {
  return won ? 'win' : 'loss';
}

export const MUSIC_LEVELS = { gain: data.gain, duckGain: data.duckGain, duckSeconds: data.duckSeconds };
