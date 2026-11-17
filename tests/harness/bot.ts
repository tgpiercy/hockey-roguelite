import { createRng } from '../../src/core/rng';
import { gameResult, type GameResult } from '../../src/sim/match';
import { goalLineX } from '../../src/sim/rink';
import { cloneTuning, type Tuning } from '../../src/sim/tuning';
import { NO_INPUT, type InputFrame, type World } from '../../src/sim/types';
import { createGame, step, STEPS_PER_SECOND, type TeamSetup } from '../../src/sim/world';

/**
 * A stand-in for a simple human player on team 0, for balance checks. It does the obvious thing:
 * chases the puck, carries it straight at the net, winds up a shot at the near corner from the slot,
 * and goes for faceoffs at about a human reaction time. It never passes, checks or changes lines.
 */
export function createNaivePlayer(t: Tuning, reactionSeconds = 0.25): (world: World) => InputFrame {
  let shootSteps = 0;
  return (world: World): InputFrame => {
    const input: InputFrame = { ...NO_INPUT };
    if (world.phase === 'faceoff') {
      const f = world.faceoff;
      input.pass = f !== null && f.dropped && f.sinceDrop >= reactionSeconds && f.sinceDrop < reactionSeconds + 0.1;
      return input;
    }
    const me = world.human ? world.players[world.human.controlled] : undefined;
    if (!me || world.phase !== 'play') return input;

    const mine = world.puck.carrier === me.id;
    const targetX = mine ? goalLineX(t) : world.puck.pos.x;
    const targetY = mine ? (me.pos.y > 0 ? 1 : -1) * (t.net.mouthWidth / 2 - 0.3) : world.puck.pos.y;
    const dx = targetX - me.pos.x;
    const dy = targetY - me.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    input.moveX = dx / d;
    input.moveY = dy / d;

    // In the attacking zone with the puck: hold shoot for a third of a second, then let go.
    if (mine && me.pos.x > goalLineX(t) - 10) {
      shootSteps += 1;
      input.shoot = shootSteps < 20;
      if (shootSteps >= 20) shootSteps = 0;
    } else {
      shootSteps = 0;
    }
    return input;
  };
}

/** How a newcomer differs from the script. Kept together so the stand-in can be re-shaped in one place. */
export const NOVICE = {
  /** He decides what to do this often, in steps (a third of a second), and holds it in between. */
  reactSteps: 17,
  /** How far off his steering may be, in degrees either way. */
  steerDegrees: 24,
  /** The share of his decisions without the puck in which he does nothing at all. */
  idleChance: 0.2,
  /** He shoots from this far out (the script waits for 10 m), and for anywhere on the net, not the corner. */
  shootFrom: 13.5,
  /** His wind-up is anything from a tap to a long hold, in steps. */
  windUp: [6, 30],
};

/**
 * A stand-in for a person new to the game, on team 0. He does what the script does (chase the puck, carry
 * it at the net, shoot) but as a newcomer would: late, a little off line, sometimes not at all, from too
 * far out and at the middle of the net as often as the corner. Like the script he never passes, checks or
 * changes lines. The same seed always plays the same game.
 */
export function createNovicePlayer(t: Tuning, seed: string): (world: World) => InputFrame {
  const rng = createRng(`novice/${seed}`);
  let held: InputFrame = { ...NO_INPUT };
  let wait = 0;
  let shooting = 0;
  let aimY = 0;
  return (world: World): InputFrame => {
    if (world.phase === 'faceoff') {
      const f = world.faceoff;
      // Slow to the draw.
      return { ...NO_INPUT, pass: f !== null && f.dropped && f.sinceDrop >= 0.45 && f.sinceDrop < 0.55 };
    }
    const me = world.human ? world.players[world.human.controlled] : undefined;
    if (!me || world.phase !== 'play') return { ...NO_INPUT };
    const mine = world.puck.carrier === me.id;

    // A shot once begun is held to its length, then let go.
    if (shooting > 0) {
      shooting -= 1;
      return { ...held, shoot: mine && shooting > 0 };
    }
    if (wait > 0) {
      wait -= 1;
      return { ...held, shoot: false };
    }
    wait = NOVICE.reactSteps;
    const input: InputFrame = { ...NO_INPUT };
    if (!mine && rng.chance(NOVICE.idleChance)) {
      held = input;
      return input;
    }
    if (mine && shooting === 0) aimY = rng.range(-1, 1) * (t.net.mouthWidth / 2 - 0.2);
    const targetX = mine ? goalLineX(t) : world.puck.pos.x;
    const targetY = mine ? aimY : world.puck.pos.y;
    const off = (rng.range(-1, 1) * NOVICE.steerDegrees * Math.PI) / 180;
    const angle = Math.atan2(targetY - me.pos.y, targetX - me.pos.x) + off;
    input.moveX = Math.cos(angle);
    input.moveY = Math.sin(angle);
    if (mine && me.pos.x > goalLineX(t) - NOVICE.shootFrom) {
      shooting = rng.int(NOVICE.windUp[0] as number, NOVICE.windUp[1] as number);
      input.shoot = true;
    }
    held = input;
    return input;
  };
}

/** How the passing player differs from the script: where it looks for the pass and when it gives up and shoots. */
export const PASSER = {
  /** It looks for a pass once this near the goal line, and shoots by itself this near if nobody is there. */
  lookFrom: 13,
  shootFrom: 6,
  /** A team-mate counts as "at the net" within this distance of it, and across the ice by at least this much. */
  mateRange: 8,
  mateAcross: 2,
  /** Steps the pass button is held, and steps shoot is held on the one-timer before it is let go. */
  passSteps: 2,
  shotSteps: 3,
};

/**
 * A stand-in that plays the pass: it carries in like the script, but with a team-mate in front of the net and
 * across the ice it passes to him and shoots first-touch. With nobody there it shoots as the script does.
 * It measures whether passing pays against carrying in alone.
 */
export function createPasserPlayer(t: Tuning, reactionSeconds = 0.25): (world: World) => InputFrame {
  let shootSteps = 0;
  let passing = 0;
  let firing = 0;
  return (world: World): InputFrame => {
    const input: InputFrame = { ...NO_INPUT };
    if (world.phase === 'faceoff') {
      const f = world.faceoff;
      input.pass = f !== null && f.dropped && f.sinceDrop >= reactionSeconds && f.sinceDrop < reactionSeconds + 0.1;
      return input;
    }
    const me = world.human ? world.players[world.human.controlled] : undefined;
    if (!me || world.phase !== 'play') return input;
    const mine = world.puck.carrier === me.id;
    const gx = goalLineX(t);
    const corner = (me.pos.y > 0 ? -1 : 1) * (t.net.mouthWidth / 2 - 0.3);

    // Just received a pass: fire it first-touch at the far corner.
    if (mine && me.oneTimer > 0) {
      const dx = gx - me.pos.x;
      const dy = corner - me.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      input.moveX = dx / d;
      input.moveY = dy / d;
      firing += 1;
      input.shoot = firing <= PASSER.shotSteps;
      return input;
    }
    firing = 0;

    const targetX = mine ? gx : world.puck.pos.x;
    const targetY = mine ? (me.pos.y > 0 ? 1 : -1) * (t.net.mouthWidth / 2 - 0.3) : world.puck.pos.y;
    const dx = targetX - me.pos.x;
    const dy = targetY - me.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    input.moveX = dx / d;
    input.moveY = dy / d;

    if (mine && me.pos.x > gx - PASSER.lookFrom) {
      const mate = world.players.find((o) => o.team === me.team && o.role === 'skater' && o.onIce && o.id !== me.id && Math.hypot(gx - o.pos.x, o.pos.y) <= PASSER.mateRange && o.pos.x < gx - 1 && Math.abs(o.pos.y - me.pos.y) >= PASSER.mateAcross);
      if (mate && shootSteps === 0) {
        const mx = mate.pos.x - me.pos.x;
        const my = mate.pos.y - me.pos.y;
        const md = Math.hypot(mx, my) || 1;
        input.moveX = mx / md;
        input.moveY = my / md;
        passing += 1;
        input.pass = passing <= PASSER.passSteps;
        if (passing > PASSER.passSteps + 2) passing = 0;
        return input;
      }
      passing = 0;
      if (me.pos.x > gx - PASSER.shootFrom || shootSteps > 0) {
        shootSteps += 1;
        input.shoot = shootSteps < 20;
        if (shootSteps >= 20) shootSteps = 0;
      }
    } else {
      shootSteps = 0;
      passing = 0;
    }
    return input;
  };
}

/** The numbers of the stand-in that passes out of trouble in its own half. */
export const OUTLET = {
  /** An opponent this near (metres) is pressure. */
  pressRange: 5,
  /** The team-mate passed to is at least this far up the ice from him (metres). */
  ahead: 4,
};

/**
 * The passer, with one more habit: carrying in its own half with an opponent close, it passes to the team-mate
 * furthest up the ice. It is the stated answer to a team that sends everyone after the puck.
 */
export function createOutletPlayer(t: Tuning, reactionSeconds = 0.25): (world: World) => InputFrame {
  const base = createPasserPlayer(t, reactionSeconds);
  let passing = 0;
  return (world: World): InputFrame => {
    const input = base(world);
    const me = world.human ? world.players[world.human.controlled] : undefined;
    if (!me || world.phase !== 'play' || world.puck.carrier !== me.id || me.pos.x >= 0) {
      passing = 0;
      return input;
    }
    const pressed = world.players.some((o) => o.team !== me.team && o.onIce && o.role === 'skater' && Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y) < OUTLET.pressRange);
    const mate = world.players.filter((o) => o.team === me.team && o.onIce && o.role === 'skater' && o.id !== me.id && o.pos.x >= me.pos.x + OUTLET.ahead).sort((a, b) => b.pos.x - a.pos.x)[0];
    if (!pressed || !mate) {
      passing = 0;
      return input;
    }
    const dx = mate.pos.x - me.pos.x;
    const dy = mate.pos.y - me.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    // With somebody standing in the lane the pass is held long enough to be lifted over him.
    const blocked = world.players.some((o) => {
      if (o.team === me.team || !o.onIce || o.role !== 'skater') return false;
      const along = ((o.pos.x - me.pos.x) * dx + (o.pos.y - me.pos.y) * dy) / d;
      return along > 0 && along < d && Math.abs((o.pos.x - me.pos.x) * dy - (o.pos.y - me.pos.y) * dx) / d < 1.2;
    });
    const hold = blocked ? Math.ceil(t.pass.saucerHoldTime * STEPS_PER_SECOND) + 2 : PASSER.passSteps;
    passing += 1;
    const out: InputFrame = { ...NO_INPUT, moveX: dx / d, moveY: dy / d, pass: passing <= hold };
    if (passing > hold + 2) passing = 0;
    return out;
  };
}

/** Who sits in the person's seat for a measurement: the script, a newcomer, one who plays the pass, or nobody touching the controls. */
export type Stand = 'script' | 'novice' | 'passer' | 'outlet' | 'idle';

export function standIn(who: Stand, t: Tuning, seed: string): (world: World) => InputFrame {
  if (who === 'novice') return createNovicePlayer(t, seed);
  if (who === 'outlet') return createOutletPlayer(t);
  if (who === 'passer') return createPasserPlayer(t);
  if (who === 'idle') return () => NO_INPUT;
  return createNaivePlayer(t);
}

/** Plays one game with the naive player on team 0 against the AI on team 1. */
export function runNaiveGame(seed: string, home: TeamSetup, away: TeamSetup, level = 0.5, tuning?: Tuning): GameResult {
  const t = tuning ?? cloneTuning();
  const world = createGame(t, seed, { teams: [home, away], levels: [null, level], overtimeLimit: 300 });
  const player = createNaivePlayer(t);
  const maxSteps = 30 * 60 * STEPS_PER_SECOND;
  for (let i = 0; i < maxSteps && world.phase !== 'final'; i++) step(world, player(world), t);
  return gameResult(world);
}

export interface NaiveReport {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
}

export function runNaiveSeries(n: number, home: TeamSetup, away: TeamSetup, seed: string, level = 0.5): NaiveReport {
  const report: NaiveReport = { games: n, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
  for (let i = 0; i < n; i++) {
    const result = runNaiveGame(`${seed}-${i}`, home, away, level);
    if (result.winner === 0) report.wins++;
    else if (result.winner === 1) report.losses++;
    else report.ties++;
    report.goalsFor += result.score[0] / n;
    report.goalsAgainst += result.score[1] / n;
  }
  return report;
}
