import data from '../data/audio.json';
import type { Tuning } from '../sim/tuning';
import type { SimEvent } from '../sim/types';

export type SoundName = keyof typeof data.sounds;

/** One sound to play now: which one, and how loud (0 to 1) compared with its normal level. */
export interface Cue {
  name: SoundName;
  gain: number;
}

/** How far a number is through a range, held between 0 and 1. */
const share = (value: number, from: number, to: number): number => Math.max(0, Math.min(1, (value - from) / (to - from)));

/**
 * The sounds for what just happened on the ice. `myTeam` is the team the listener plays for:
 * their goal is a horn and a roar, the other team's a groan.
 */
export function cuesFor(events: readonly SimEvent[], myTeam: 0 | 1, t: Tuning): Cue[] {
  const cues: Cue[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'goal':
        if (e.team === myTeam) cues.push({ name: 'horn', gain: 1 }, { name: 'roar', gain: 1 });
        else cues.push({ name: 'groan', gain: 1 });
        break;
      case 'shot':
        // A harder shot is louder: from a soft wrister at the quiet end to a full slap shot.
        cues.push({ name: 'shot', gain: data.shotMinGain + (1 - data.shotMinGain) * share(e.speed, t.shot.wristSpeed * 0.6, t.shot.maxSpeed) });
        break;
      case 'pass':
        cues.push({ name: 'pass', gain: e.saucer ? 0.7 : 1 });
        break;
      case 'post':
        cues.push({ name: 'post', gain: 1 });
        break;
      case 'save':
        cues.push({ name: 'save', gain: e.frozen ? 0.7 : 1 });
        break;
      case 'check':
        if (e.kind === 'body') cues.push({ name: 'hit', gain: e.success ? 1 : 0.45 });
        else if (e.success) cues.push({ name: 'poke', gain: 1 });
        break;
      case 'pickup':
        cues.push({ name: 'tap', gain: 1 });
        break;
      case 'faceoff':
        if (e.winner !== null) cues.push({ name: 'drop', gain: 1 });
        break;
      case 'period':
      case 'final':
        cues.push({ name: 'whistle', gain: 1 });
        break;
      case 'powerup':
      case 'talent':
        cues.push({ name: 'chime', gain: 0.8 });
        break;
      case 'change':
        break;
    }
  }
  return cues;
}

/** How much the crowd is lifted by what just happened, 0 to 1: a goal fills the building, a shot or a save stirs it. */
export function crowdLift(events: readonly SimEvent[]): number {
  let lift = 0;
  for (const e of events) {
    if (e.type === 'goal') lift = 1;
    else if (e.type === 'shot') lift = Math.max(lift, data.crowd.shotLift);
    else if (e.type === 'save' || e.type === 'post') lift = Math.max(lift, data.crowd.saveLift);
  }
  return lift;
}

/** How long a sound lasts, in seconds: its longest layer, counting any delay before the layer starts. */
export function soundSeconds(name: SoundName): number {
  return Math.max(...data.sounds[name].map((layer) => layer.duration + ('delay' in layer ? (layer.delay as number) : 0)));
}
