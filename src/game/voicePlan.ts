import data from '../data/speech.json';

/** What the browser says about one of the device's voices. */
export interface VoiceInfo {
  name: string;
  lang: string;
  /** True for the voice the device uses when none is asked for. */
  default?: boolean;
}

/** How a line is said: how fast, how high and how loud (each as the browser's own scale, 1 being plain). */
export interface Delivery {
  rate: number;
  pitch: number;
  volume: number;
}

const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(high, v));

/** True for a voice that speaks English. */
export function isEnglish(voice: VoiceInfo): boolean {
  return voice.lang.toLowerCase().replace('_', '-').startsWith('en');
}

/**
 * How well a voice suits calling a game, from what its name and language say about it: the natural and
 * enhanced voices a device has score highest, the compact and novelty ones lowest. Not English: none at all.
 */
export function voiceScore(voice: VoiceInfo): number {
  if (!isEnglish(voice)) return Number.NEGATIVE_INFINITY;
  const lang = voice.lang.replace('_', '-');
  const table = data.language as Record<string, number>;
  let score = table[lang] ?? table[lang.slice(0, 2).toLowerCase()] ?? 0;
  const name = voice.name.toLowerCase();
  for (const hint of data.hints) if (name.includes(hint.has)) score += hint.score;
  if (voice.default) score += 2;
  return score;
}

/** The device's English voices, the best for calling a game first; equal ones in the order the device lists them. */
export function rankVoices<T extends VoiceInfo>(voices: readonly T[]): T[] {
  return voices
    .map((voice, at) => ({ voice, at, score: voiceScore(voice) }))
    .filter((v) => v.score > Number.NEGATIVE_INFINITY)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .map((v) => v.voice);
}

/**
 * Which voice says a line: the one the player chose if the device still has it, else the best; and for the
 * radio announcer's own lines (the opening, the periods, the final horn) the next best, so two people are heard.
 */
export function voiceFor<T extends VoiceInfo>(voices: readonly T[], chosen: string, kind: string): T | null {
  const ranked = rankVoices(voices);
  const main = ranked.find((v) => v.name === chosen) ?? ranked[0] ?? null;
  if (!main || !data.announcerKinds.includes(kind)) return main;
  return ranked.find((v) => v.name !== main.name) ?? main;
}

/** True when the game is close and late: everything is said a little quicker and higher. */
export function tenseNow(period: number, score: readonly [number, number], overtime: boolean): boolean {
  return overtime || (period >= data.tense.fromPeriod && Math.abs(score[0] - score[1]) <= data.tense.margin);
}

/**
 * How a line of this kind is said. A goal is shouted, a save called quickly, the end of a period read out
 * level. `tense` lifts it all a little, and `roll` (0 to 1) varies each line slightly so no two sound stamped
 * from one mould.
 */
export function deliveryFor(kind: string, tense: boolean, roll: number): Delivery {
  const D = data.delivery;
  const base = (D.kinds as Record<string, Delivery>)[kind] ?? D.default;
  const vary = (clamp(roll, 0, 1) * 2 - 1) * D.vary;
  return {
    rate: clamp(base.rate + (tense ? D.tenseRate : 0) + vary, D.least.rate, D.most.rate),
    pitch: clamp(base.pitch + (tense ? D.tensePitch : 0) + vary, D.least.pitch, D.most.pitch),
    volume: clamp(base.volume, 0, 1),
  };
}

/** A line as it should be read aloud: a score as "3 to 2", and marks a voice would stumble on taken out. */
export function spokenText(text: string): string {
  return text
    .replace(/(\d+)\s*[-–]\s*(\d+)/g, '$1 to $2')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const SPEECH = data;
