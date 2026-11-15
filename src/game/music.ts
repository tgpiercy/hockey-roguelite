import { gameAudio } from './audio';
import { MUSIC_LEVELS, pieceSeconds, pieceSpec, readTrack, type PieceName } from './musicScore';

/**
 * The music: a theme that loops on the menus and short pieces for big moments. Every note is a tone made
 * here from the tunes in music.json; nothing is loaded from a file. It plays through the game's own sound
 * engine, so switching sound off silences it too, and it has its own switch and volume besides.
 */
export class Music {
  private gain: GainNode | null = null;
  private themeGain: GainNode | null = null;
  private themeNodes: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private looping: PieceName | null = null;
  private wanted: PieceName | null = null;
  private enabled = true;
  private volume = 0.5;
  /** How many times each piece has been asked for: lets a check count them without listening. */
  readonly played: Partial<Record<PieceName, number>> = {};

  /** Music on or off, and how loud (0 to 1). */
  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    const bus = gameAudio.bus();
    if (this.gain && bus) this.gain.gain.setTargetAtTime(this.level(), bus.ctx.currentTime, 0.05);
    if (!enabled) this.stopLoop();
    else if (this.wanted && !this.looping) this.loop(this.wanted);
  }

  private level(): number {
    return this.enabled ? MUSIC_LEVELS.gain * this.volume : 0;
  }

  /** The output for music, made on first use once sound is unlocked. */
  private out(): { ctx: AudioContext; gain: GainNode } | null {
    const bus = gameAudio.bus();
    if (!bus) return null;
    if (!this.gain) {
      this.gain = bus.ctx.createGain();
      this.gain.gain.value = this.level();
      this.gain.connect(bus.out);
    }
    return { ctx: bus.ctx, gain: this.gain };
  }

  /** Schedules one pass of a piece into `into`, starting at `when`. Returns the nodes made. */
  private schedule(ctx: AudioContext, into: AudioNode, name: PieceName, when: number): AudioScheduledSourceNode[] {
    const piece = pieceSpec(name);
    const nodes: AudioScheduledSourceNode[] = [];
    for (const track of piece.tracks) {
      let tail: AudioNode = into;
      if (track.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = track.filter;
        filter.connect(into);
        tail = filter;
      }
      for (const note of readTrack(track.notes, piece.bpm).notes) {
        const start = when + note.start;
        const end = start + note.seconds;
        const level = ctx.createGain();
        level.gain.setValueAtTime(0, start);
        level.gain.linearRampToValueAtTime(track.gain, start + Math.min(track.attack, note.seconds / 2));
        level.gain.setValueAtTime(track.gain, Math.max(start + track.attack, end - track.release));
        level.gain.linearRampToValueAtTime(0, end);
        level.connect(tail);
        const osc = ctx.createOscillator();
        osc.type = track.wave as OscillatorType;
        osc.frequency.value = note.freq;
        osc.connect(level);
        osc.start(start);
        osc.stop(end + 0.02);
        nodes.push(osc);
      }
    }
    return nodes;
  }

  /** Starts a piece looping (the menu theme), or keeps it going if it already is. Remembered, so it starts once sound is unlocked. */
  loop(name: PieceName): void {
    this.wanted = name;
    if (this.looping === name || !this.enabled) return;
    const out = this.out();
    if (!out || out.ctx.state !== 'running') return;
    this.stopLoop();
    this.wanted = name;
    this.looping = name;
    this.played[name] = (this.played[name] ?? 0) + 1;
    this.themeGain = out.ctx.createGain();
    this.themeGain.gain.value = 1;
    this.themeGain.connect(out.gain);
    const seconds = pieceSeconds(name);
    let next = out.ctx.currentTime + 0.08;
    const pass = (): void => {
      if (this.looping !== name || !this.themeGain) return;
      this.themeNodes.push(...this.schedule(out.ctx, this.themeGain, name, next));
      // Forget notes that have finished, so the list does not grow for ever.
      if (this.themeNodes.length > 800) this.themeNodes = this.themeNodes.slice(-400);
      next += seconds;
      this.timer = setTimeout(pass, Math.max(50, (next - out.ctx.currentTime - 0.5) * 1000));
    };
    pass();
  }

  /** Stops the looping piece and forgets that it was wanted. */
  stop(): void {
    this.wanted = null;
    this.stopLoop();
  }

  private stopLoop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.looping = null;
    for (const node of this.themeNodes) {
      try {
        node.stop();
      } catch {
        // Already finished.
      }
    }
    this.themeNodes = [];
    this.themeGain?.disconnect();
    this.themeGain = null;
  }

  /** Plays a short piece once, over whatever else is playing; the theme dips under it. */
  sting(name: PieceName): void {
    this.played[name] = (this.played[name] ?? 0) + 1;
    if (!this.enabled) return;
    const out = this.out();
    if (!out || out.ctx.state !== 'running') return;
    const now = out.ctx.currentTime;
    this.schedule(out.ctx, out.gain, name, now + 0.02);
    if (this.themeGain) {
      this.themeGain.gain.cancelScheduledValues(now);
      this.themeGain.gain.setTargetAtTime(MUSIC_LEVELS.duckGain, now, 0.05);
      this.themeGain.gain.setTargetAtTime(1, now + Math.max(MUSIC_LEVELS.duckSeconds, pieceSeconds(name)), 0.3);
    }
  }

  /** Call after sound has been unlocked by a press: starts the theme if one was asked for before sound was allowed. */
  wake(): void {
    if (this.wanted && !this.looping) this.loop(this.wanted);
  }
}

/** The one music player for the page. */
export const music = new Music();
