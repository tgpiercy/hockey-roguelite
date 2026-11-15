import { describe, expect, it } from 'vitest';
import data from '../src/data/music.json';
import { frequencyOf, midiOf, PIECES, pieceSeconds, pieceSpec, readTrack, resultPiece, stingFor } from '../src/game/musicScore';
import type { SimEvent } from '../src/sim/types';

describe('reading notes', () => {
  it('note names are MIDI numbers: A4 is 69, middle C is 60, flats and sharps move one step', () => {
    expect(midiOf('A4')).toBe(69);
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('Eb4')).toBe(63);
    expect(midiOf('F#5')).toBe(78);
    expect(midiOf('H4')).toBeNull();
    expect(midiOf('C')).toBeNull();
  });

  it('pitches: A4 is 440 Hz, an octave doubles it', () => {
    expect(frequencyOf(69)).toBeCloseTo(440);
    expect(frequencyOf(81)).toBeCloseTo(880);
    expect(frequencyOf(60)).toBeCloseTo(261.63, 1);
  });

  it('a tune becomes notes in seconds; rests move time on and make no note', () => {
    const track = readTrack('C4:1 -:1 E4:.5 G4:1.5', 120);
    expect(track.notes.map((n) => [n.start, n.seconds])).toEqual([
      [0, 0.5],
      [1, 0.25],
      [1.25, 0.75],
    ]);
    expect(track.seconds).toBeCloseTo(2);
    expect(() => readTrack('C4:0', 120)).toThrow();
    expect(() => readTrack('X9:1', 120)).toThrow();
  });
});

describe('the pieces', () => {
  it('every piece reads cleanly, with notes a speaker can play and levels that cannot clip', () => {
    for (const name of PIECES) {
      const piece = pieceSpec(name);
      expect(piece.bpm).toBeGreaterThan(40);
      expect(piece.tracks.length).toBeGreaterThan(0);
      let total = 0;
      for (const track of piece.tracks) {
        const read = readTrack(track.notes, piece.bpm);
        expect(read.notes.length, name).toBeGreaterThan(0);
        for (const note of read.notes) {
          expect(note.freq).toBeGreaterThan(50);
          expect(note.freq).toBeLessThan(2200);
          expect(note.seconds).toBeGreaterThan(0.05);
        }
        expect(['sine', 'triangle', 'square', 'sawtooth']).toContain(track.wave);
        total += track.gain;
      }
      expect(total * data.gain, name).toBeLessThan(0.5);
    }
  });

  it('a looping piece has tracks of one length, so it comes round cleanly', () => {
    for (const name of PIECES) {
      const piece = pieceSpec(name);
      if (!piece.loop) continue;
      const lengths = piece.tracks.map((track) => readTrack(track.notes, piece.bpm).seconds);
      for (const length of lengths) expect(length).toBeCloseTo(lengths[0] as number);
      expect(pieceSeconds(name)).toBeGreaterThan(10);
    }
  });

  it('the pieces for moments are short', () => {
    for (const name of PIECES) if (!pieceSpec(name).loop) expect(pieceSeconds(name), name).toBeLessThan(6);
  });
});

describe('which piece plays when', () => {
  const goal = (team: 0 | 1): SimEvent => ({ type: 'goal', side: 1, team, scorer: null, assists: [] });

  it('your goal and theirs get different pieces', () => {
    expect(stingFor([goal(0)], 0)).toBe('goalFor');
    expect(stingFor([goal(1)], 0)).toBe('goalAgainst');
    expect(stingFor([goal(1)], 1)).toBe('goalFor');
  });

  it('the organ plays at the end of a period; a goal outranks it', () => {
    expect(stingFor([{ type: 'period', period: 1 }], 0)).toBe('organ');
    expect(stingFor([{ type: 'period', period: 1 }, goal(0)], 0)).toBe('goalFor');
  });

  it('ordinary play gets no music', () => {
    expect(stingFor([{ type: 'post' }, { type: 'pickup', player: 1 }, { type: 'save', goalie: 6, frozen: false }], 0)).toBeNull();
    expect(stingFor([], 0)).toBeNull();
  });

  it('a win and a loss end differently', () => {
    expect(resultPiece(true)).toBe('win');
    expect(resultPiece(false)).toBe('loss');
  });
});
