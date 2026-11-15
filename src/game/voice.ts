/**
 * The spoken commentary: lines read by the browser's own voice. There are no sound files; what it sounds
 * like depends on the device. Everything here is safe to call where speech is not available.
 */
let speaking = 0;

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
}

/** Says a line. A line that matters more than the one being spoken cuts it off; a lesser one waits its turn and is dropped if the voice is busy. */
export function speak(text: string, priority: number, volume: number): void {
  if (!canSpeak()) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      if (priority <= speaking) return;
      synth.cancel();
    }
    const words = new SpeechSynthesisUtterance(text);
    words.rate = 1.15;
    words.pitch = 1.05;
    words.volume = Math.max(0, Math.min(1, volume));
    speaking = priority;
    words.onend = () => {
      speaking = 0;
    };
    synth.speak(words);
  } catch {
    // Some browsers refuse to speak before the page has been touched: stay silent.
  }
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
