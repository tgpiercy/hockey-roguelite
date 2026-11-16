import type { SimEvent, World } from '../sim/types';
import { padIndex } from './gamepad';
import { buzzesFor, type Buzz } from './rumbleMap';

/** The part of a controller that can shake, where the browser offers one. */
interface Actuator {
  playEffect(type: string, params: { duration: number; strongMagnitude: number; weakMagnitude: number; startDelay?: number }): Promise<unknown>;
}

/**
 * Shakes the players' controllers for what happens in a game. With no controller in use, a phone shakes
 * itself, where it can. Everything here may be missing on a given browser or controller, so every call is
 * guarded and a failure is silent: a game never stops for want of a buzz.
 */
export class Rumble {
  /** How many buzzes have been asked for, by player: lets a check count them without a controller. */
  readonly played: [number, number] = [0, 0];
  private enabled = true;

  configure(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** The buzzes for what just happened in a game. */
  onEvents(events: readonly SimEvent[], world: World): void {
    if (!this.enabled || events.length === 0) return;
    buzzesFor(events, world).forEach((b, seat) => {
      if (b) this.play(seat as 0 | 1, b);
    });
  }

  /** One buzz on a player's controller, or on the phone itself for player one with no controller. */
  play(seat: 0 | 1, b: Buzz): void {
    this.played[seat] += 1;
    try {
      const index = padIndex(seat);
      const pad = index === null || typeof navigator.getGamepads !== 'function' ? null : navigator.getGamepads()[index];
      const actuator = (pad as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        actuator.playEffect('dual-rumble', { duration: b.ms, strongMagnitude: b.strong, weakMagnitude: b.weak }).catch(() => undefined);
        return;
      }
      if (seat === 0 && index === null && typeof navigator.vibrate === 'function') navigator.vibrate(b.ms);
    } catch {
      // No rumble here: carry on.
    }
  }
}

export const rumble = new Rumble();
