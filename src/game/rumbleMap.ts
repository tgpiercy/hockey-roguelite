import controls from '../data/controls.json';
import type { SimEvent, World } from '../sim/types';

/** One buzz of a controller: how hard its two motors turn (0 to 1) and for how long. */
export interface Buzz {
  strong: number;
  weak: number;
  ms: number;
}

export type BuzzName = keyof typeof controls.rumble.buzzes;

/** The buzz of this name, from the table in controls.json. */
export function buzz(name: BuzzName): Buzz {
  return controls.rumble.buzzes[name];
}

/**
 * Which buzz each player's controller gets for what has just happened: index 0 is player one, 1 is
 * player two; null is none. A player feels what happens to him and his team: his team's goal and the
 * other's, a body check he throws or takes, his shot off the post, his goalie's save. When two things
 * happen at once he feels the bigger.
 */
export function buzzesFor(events: readonly SimEvent[], world: World): [Buzz | null, Buzz | null] {
  const seats = [world.human, world.human2];
  const out: [Buzz | null, Buzz | null] = [null, null];
  const give = (seat: number, name: BuzzName): void => {
    const b = buzz(name);
    const had = out[seat as 0 | 1];
    if (!had || b.strong * b.ms > had.strong * had.ms) out[seat as 0 | 1] = b;
  };
  for (const e of events) {
    seats.forEach((human, seat) => {
      if (!human) return;
      const mine = world.players[human.controlled];
      if (e.type === 'goal') give(seat, e.team === human.team ? 'goalFor' : 'goalAgainst');
      else if (e.type === 'check' && e.kind === 'body' && e.success) {
        if (e.player === mine?.id) give(seat, e.big ? 'bigHit' : 'hit');
        else if (e.target === mine?.id) give(seat, e.big ? 'bigHit' : 'hitTaken');
      } else if (e.type === 'post') {
        const by = world.puck.shotBy === null ? undefined : world.players[world.puck.shotBy];
        if (!by || by.team === human.team) give(seat, 'post');
      } else if (e.type === 'save') {
        const goalie = world.players[e.goalie];
        if (goalie && goalie.team === human.team) give(seat, 'save');
      } else if (e.type === 'block') {
        if (e.player === mine?.id) give(seat, 'block');
      }
    });
  }
  return out;
}
