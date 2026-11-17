import { createRng } from '../core/rng';
import { deliveryFor, rankVoices, SPEECH, spokenText, voiceFor } from './voicePlan';

/**
 * The spoken commentary: lines read by the best of the device's own voices, each said in the way its kind
 * asks for (voicePlan.ts). There are no sound files; what it sounds like depends on the device. Everything
 * here is safe to call where speech is not available.
 */
let speaking = 0;
const rng = createRng('voice');

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
}

/** The device's voices. Browsers hand them over late, so this is asked for each time and may be empty at first. */
function deviceVoices(): SpeechSynthesisVoice[] {
  try {
    return canSpeak() ? window.speechSynthesis.getVoices() : [];
  } catch {
    return [];
  }
}

/** The names of the English voices this device has, best for calling a game first, and no more than a handful. */
export function voiceChoices(): string[] {
  return rankVoices(deviceVoices())
    .map((v) => v.name)
    .slice(0, SPEECH.mostChoices);
}

/**
 * Says a line of some kind. A line that matters more than the one being spoken cuts it off; a lesser one is
 * dropped if the voice is busy. `chosen` is the voice the player picked, or nothing for the best the device has.
 */
export function speak(text: string, priority: number, volume: number, kind = '', tense = false, chosen = ''): void {
  if (!canSpeak()) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      if (priority <= speaking) return;
      synth.cancel();
    }
    const words = new SpeechSynthesisUtterance(spokenText(text));
    const how = deliveryFor(kind, tense, rng.next());
    const voice = voiceFor(deviceVoices(), chosen, kind);
    if (voice) {
      words.voice = voice;
      words.lang = voice.lang;
    }
    words.rate = how.rate;
    words.pitch = how.pitch;
    words.volume = Math.max(0, Math.min(1, volume * how.volume));
    speaking = priority;
    words.onend = () => {
      speaking = 0;
    };
    synth.speak(words);
  } catch {
    // Some browsers refuse to speak before the page has been touched: stay silent.
  }
}

/** Says the sample line as a goal is called, in the voice named: for choosing one in Settings. */
export function sayVoiceSample(chosen: string, volume: number): void {
  hush();
  speak(SPEECH.sample, 9, volume, 'goal', false, chosen);
}

/** Stops whatever is being said: on pause, and when the game ends. */
export function hush(): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
    speaking = 0;
  } catch {
    // Nothing to stop.
  }
}
