import { STEPS_PER_SECOND } from '../sim/clock';
import type { InputFrame, World } from '../sim/types';

/**
 * Instant replay. The game is a fixed-step simulation that only its seed and the inputs decide, so a
 * replay is a copy of the world from a moment ago plus the inputs since, run again. Nothing is filmed.
 *
 * The recorder keeps a copy of the world every so often and every input for the last few seconds.
 */

/** A copy of a world that shares nothing with it: stepping one never touches the other. */
export function copyWorld(world: World): World {
  const { rng, ...rest } = world;
  // Everything in a world is plain data but its random generator, which is copied with its state.
  return { ...(structuredClone(rest) as Omit<World, 'rng'>), rng: rng.clone() };
}

/** A stretch of play to run again: the world as it was, and the two players' inputs for each step after. */
export interface Clip {
  start: World;
  inputs: [InputFrame, InputFrame][];
}

export class Recorder {
  private snapshots: { tick: number; world: World }[] = [];
  private inputs: [InputFrame, InputFrame][] = [];
  /** The tick the first kept input was applied at. */
  private firstTick = 0;

  constructor(
    /** Seconds between copies of the world. */
    private readonly everySeconds = 1,
    /** How far back a replay can reach. */
    private readonly keepSeconds = 8,
  ) {}

  /** Call just before each step of the live game, with the inputs about to be applied. */
  before(world: World, input: InputFrame, input2: InputFrame): void {
    if (this.inputs.length === 0) this.firstTick = world.tick;
    const every = Math.max(1, Math.round(this.everySeconds * STEPS_PER_SECOND));
    if (world.tick % every === 0 || this.snapshots.length === 0) this.snapshots.push({ tick: world.tick, world: copyWorld(world) });
    this.inputs.push([{ ...input }, { ...input2 }]);
    // Forget what is too old to be wanted, keeping one copy at or before the oldest moment that could be asked for.
    const oldest = world.tick - Math.round((this.keepSeconds + this.everySeconds) * STEPS_PER_SECOND);
    while (this.snapshots.length > 1 && (this.snapshots[1] as { tick: number }).tick <= oldest) this.snapshots.shift();
    const from = (this.snapshots[0] as { tick: number }).tick;
    if (from > this.firstTick) {
      this.inputs.splice(0, from - this.firstTick);
      this.firstTick = from;
    }
  }

  /**
   * The play from about `fromTick` to `toTick` (both as the world's tick counts them), or null if that
   * far back is no longer kept. It starts at the nearest copy at or before `fromTick`.
   */
  clip(fromTick: number, toTick: number): Clip | null {
    const start = [...this.snapshots].reverse().find((s) => s.tick <= fromTick) ?? this.snapshots[0];
    if (!start || toTick <= start.tick) return null;
    const inputs = this.inputs.slice(start.tick - this.firstTick, toTick - this.firstTick);
    if (inputs.length === 0) return null;
    return { start: copyWorld(start.world), inputs };
  }
}

/**
 * Which goal is the goal of the game: an overtime winner first, then a one-timer, then the goal that
 * last changed who was ahead, then the last goal. Returns its place in the list, or null with no goals.
 */
export interface GoalNote {
  team: 0 | 1;
  /** The score after it. */
  score: [number, number];
  overtime: boolean;
  oneTimer: boolean;
}

export function goalOfTheGame(goals: readonly GoalNote[]): number | null {
  if (goals.length === 0) return null;
  const last = <T>(pick: (g: GoalNote, i: number) => T | false): number => {
    for (let i = goals.length - 1; i >= 0; i--) if (pick(goals[i] as GoalNote, i) !== false) return i;
    return -1;
  };
  const winner = last((g) => g.overtime);
  if (winner >= 0) return winner;
  const oneTimer = last((g) => g.oneTimer);
  if (oneTimer >= 0) return oneTimer;
  // A goal changes the lead when the scorer's team was level or behind before it and is ahead after.
  const leadChange = last((g) => {
    const mine = g.score[g.team];
    const theirs = g.score[g.team === 0 ? 1 : 0];
    return mine - 1 <= theirs && mine > theirs;
  });
  return leadChange >= 0 ? leadChange : goals.length - 1;
}
