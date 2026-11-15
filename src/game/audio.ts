import data from '../data/audio.json';
import type { Tuning } from '../sim/tuning';
import type { SimEvent, World } from '../sim/types';
import { crowdLift, cuesFor, type Cue, type SoundName } from './soundMap';

/** One layer of a sound, as written in audio.json: a tone or a burst of noise with a short envelope. */
interface Layer {
  wave: string;
  freq: number;
  freqEnd?: number;
  duration: number;
  gain: number;
  attack?: number;
  delay?: number;
  filter?: string;
  filterFreq?: number;
  q?: number;
}

type Context = BaseAudioContext;

/** A second of white noise, made once per context and reused by every noisy sound. */
function noiseBuffer(ctx: Context): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  // A fixed sequence, so the noise is the same every time: no randomness needed for hiss.
  let state = 22222;
  for (let i = 0; i < samples.length; i++) {
    state = (state * 16807) % 2147483647;
    samples[i] = (state / 2147483647) * 2 - 1;
  }
  return buffer;
}

/**
 * Plays one sound from its recipe into `out`, starting at `when` (context time), `gain` times its normal level.
 * Every sound in the game is built from these layers; nothing is loaded from a file.
 */
export function playSound(ctx: Context, out: AudioNode, noise: AudioBuffer, name: SoundName, gain: number, when: number): void {
  for (const layer of data.sounds[name] as Layer[]) {
    const start = when + (layer.delay ?? 0);
    const end = start + layer.duration;
    const attack = Math.min(layer.attack ?? 0.004, layer.duration / 2);
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, start);
    level.gain.linearRampToValueAtTime(layer.gain * gain, start + attack);
    level.gain.exponentialRampToValueAtTime(0.0001, end);
    level.connect(out);

    let source: AudioScheduledSourceNode;
    let tail: AudioNode;
    if (layer.wave === 'noise') {
      const node = ctx.createBufferSource();
      node.buffer = noise;
      node.loop = true;
      source = node;
      tail = node;
    } else {
      const node = ctx.createOscillator();
      node.type = layer.wave as OscillatorType;
      node.frequency.setValueAtTime(layer.freq, start);
      if (layer.freqEnd !== undefined) node.frequency.exponentialRampToValueAtTime(layer.freqEnd, end);
      source = node;
      tail = node;
    }
    if (layer.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter as BiquadFilterType;
      // For noise the layer's own frequency is the filter's; a tone can name a separate one.
      filter.frequency.value = layer.wave === 'noise' ? layer.freq : (layer.filterFreq ?? layer.freq);
      filter.Q.value = layer.q ?? 0.7;
      tail.connect(filter);
      tail = filter;
    }
    tail.connect(level);
    source.start(start);
    source.stop(end + 0.02);
  }
}

/**
 * The game's sound: one-off sounds for what happens, and the crowd, a bed that runs all the time on the ice.
 * Browsers only allow sound after the player has pressed or tapped something,
 * so nothing is created until `unlock()` is called from such a press.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crowdGain: GainNode | null = null;
  private beds: AudioBufferSourceNode[] = [];
  private crowd = 0;
  private enabled = true;
  private volume = 1;
  private hushed = false;
  private tense = false;
  /** How many times each sound has been asked for: lets a test or a check count them without listening. */
  readonly played: Partial<Record<SoundName, number>> = {};

  /** Sound on or off, and how loud (0 to 1). */
  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(enabled ? data.masterGain * this.volume : 0, this.ctx.currentTime, 0.02);
    if (!enabled) this.stopBeds();
  }

  /** A one-goal game late on: the crowd is louder throughout. */
  tension(on: boolean): void {
    this.tense = on;
  }

  /** While the game is paused the crowd drops to a murmur. */
  hush(on: boolean): void {
    this.hushed = on;
  }

  /** Call from a key press, tap or click: creates the audio context, or wakes it if the browser paused it. */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? data.masterGain * this.volume : 0;
      // A limiter, so several loud sounds at once cannot clip.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.ratio.value = 12;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);
      this.noise = noiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Plays one sound now. Does nothing until sound has been unlocked, or while it is switched off. */
  play(name: SoundName, gain = 1): void {
    this.played[name] = (this.played[name] ?? 0) + 1;
    if (!this.enabled || !this.ctx || !this.master || !this.noise || this.ctx.state !== 'running') return;
    playSound(this.ctx, this.master, this.noise, name, gain, this.ctx.currentTime);
  }

  /** The sounds for what just happened in a game. */
  onEvents(events: readonly SimEvent[], world: World, t: Tuning): void {
    const cues: Cue[] = cuesFor(events, world.human?.team ?? 0, t);
    for (const cue of cues) this.play(cue.name, cue.gain);
    this.crowd = Math.max(this.crowd, crowdLift(events));
  }

  /** Once per frame during a game: keeps the crowd running at the right level. */
  onFrame(seconds: number): void {
    this.crowd = Math.max(0, this.crowd - seconds * data.crowd.calmPerSecond);
    if (!this.enabled || !this.ctx || !this.master || !this.noise || this.ctx.state !== 'running') return;
    if (this.beds.length === 0) this.startBeds();
    const now = this.ctx.currentTime;
    const crowd = (data.crowd.restGain + (data.crowd.maxGain - data.crowd.restGain) * this.crowd) * (this.hushed ? data.crowd.pausedScale : 1) * (this.tense ? data.crowd.tenseScale : 1);
    this.crowdGain?.gain.setTargetAtTime(crowd, now, 0.15);
  }

  private startBeds(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const bed = (filterType: string, freq: number, q: number): GainNode => {
      const source = this.ctx!.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = filterType as BiquadFilterType;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = this.ctx!.createGain();
      gain.gain.value = 0;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master!);
      source.start();
      this.beds.push(source);
      return gain;
    };
    this.crowdGain = bed(data.crowd.filter, data.crowd.freq, data.crowd.q);
  }

  /** Stops the crowd: call when a game ends. */
  stopBeds(): void {
    for (const source of this.beds) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.beds = [];
    this.crowdGain = null;
    this.crowd = 0;
    this.hushed = false;
    this.tense = false;
  }
}

/** The one sound engine for the page, shared by the menus and the rink. */
export const gameAudio = new GameAudio();
