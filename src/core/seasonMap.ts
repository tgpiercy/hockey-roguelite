import bossData from '../data/bosses.json';
import { isVariant, RINK_CHANCE, RINKS } from './rinks';
import bosses from '../data/bosses.json';
import events from '../data/events.json';
import powerups from '../data/powerups.json';
import rules from '../data/season.json';
import { createRng } from './rng';

export type StopKind = 'game' | 'training' | 'event' | 'shop' | 'boss';

/** One stop on the season map. */
export interface Stop {
  id: string;
  /** 0-based region and step within it. */
  region: number;
  step: number;
  kind: StopKind;
  /** Ids of the stops this one leads to. Empty for a boss: the next region (or the playoffs) follows. */
  next: string[];
  /** Game stops: the league team to play. */
  opponentId?: string;
  /** Game and boss stops: the rink it is played on (rinks.json). Left out, the standard rink. */
  rink?: string;
  /** Game stops: an elite game, against a team from the next tier up playing above itself, for a better prize. */
  elite?: boolean;
  /** Event stops: which event. */
  eventId?: string;
  /** Boss stops: which boss. */
  bossId?: string;
  /** Shop stops: powerup ids still on the shelf. */
  stock?: string[];
}

export interface SeasonMap {
  stops: Record<string, Stop>;
  /** The stops you can start each region from. */
  regionStarts: string[][];
}

/**
 * Builds the season's map from a seed. Each region follows the step pattern in season.json
 * (game, stop, game, stop, boss); every step but the boss offers a choice; each stop leads to one
 * or two stops on the next step; and every stop is reachable and leads to the boss.
 *
 * `teamsByStrength` is the AI teams' ids, weakest first: the first region draws from the weakest
 * third, the last from the strongest.
 */
export function generateMap(seed: string, teamsByStrength: string[], regions: number = rules.regions, seenEvents: readonly string[] = []): SeasonMap {
  const rng = createRng(`${seed}/map`);
  const stops: Record<string, Stop> = {};
  const regionStarts: string[][] = [];
  // Events you have not had before come first; within each group the order is the seed's.
  const shuffled = rng.shuffle(events.map((e) => e.id));
  const eventOrder = [...shuffled.filter((id) => !seenEvents.includes(id)), ...shuffled.filter((id) => seenEvents.includes(id))];
  const bossOrder = rng.shuffle(bosses.map((b) => b.id));
  const tierSize = Math.max(1, Math.floor(teamsByStrength.length / regions));
  let nextEvent = 0;

  for (let region = 0; region < regions; region++) {
    const tier = teamsByStrength.slice(region * tierSize, region === regions - 1 ? undefined : (region + 1) * tierSize);
    let opponents = rng.shuffle(tier);
    const above = region === regions - 1 ? [] : teamsByStrength.slice((region + 1) * tierSize, region === regions - 2 ? undefined : (region + 2) * tierSize);
    const harder = above.length > 0 ? above : tier.slice(-Math.max(1, Math.ceil(tier.length / 2)));
    const rows: Stop[][] = [];

    rules.steps.forEach((pattern, step) => {
      const row: Stop[] = [];
      const make = (kind: StopKind, index: number): Stop => ({ id: `r${region}s${step}n${index}`, region, step, kind, next: [] });

      if (pattern === 'boss') {
        row.push({ ...make('boss', 0), bossId: bossOrder[region % bossOrder.length] as string });
      } else if (pattern === 'game') {
        for (let i = 0; i < rules.choicesPerStep; i++) {
          // The last choice on a game step is the elite game: a team from the next tier up (or, in the
          // last region, the strongest of this one).
          if (i > 0 && i === rules.choicesPerStep - 1) {
            const taken = row.map((s) => s.opponentId);
            const pool = harder.filter((id) => !taken.includes(id));
            row.push({ ...make('game', i), opponentId: rng.pick(pool.length > 0 ? pool : harder), elite: true });
            continue;
          }
          if (opponents.length === 0) opponents = rng.shuffle(tier);
          row.push({ ...make('game', i), opponentId: opponents.shift() as string });
        }
      } else {
        const kinds = rng.shuffle(rules.stopKinds as StopKind[]).slice(0, rules.choicesPerStep);
        kinds.forEach((kind, i) => {
          const stop = make(kind, i);
          if (kind === 'event') stop.eventId = eventOrder[nextEvent++ % eventOrder.length] as string;
          if (kind === 'shop') stop.stock = rng.shuffle(powerups.map((p) => p.id)).slice(0, rules.shopItems);
          row.push(stop);
        });
      }
      rows.push(row);
    });

    // Paths: straight ahead always, and sometimes across as well, so both stops on a step can be reached.
    for (let step = 0; step < rows.length - 1; step++) {
      const from = rows[step] as Stop[];
      const to = rows[step + 1] as Stop[];
      from.forEach((stop, i) => {
        if (to.length === 1) {
          stop.next = [to[0]!.id];
          return;
        }
        const straight = to[i % to.length] as Stop;
        stop.next = [straight.id];
        if (rng.chance(rules.branchChance)) {
          const across = to[(i + 1) % to.length] as Stop;
          if (across.id !== straight.id) stop.next.push(across.id);
        }
      });
    }

    for (const row of rows) for (const stop of row) stops[stop.id] = stop;
    regionStarts.push((rows[0] as Stop[]).map((s) => s.id));
  }
  // Some ordinary games are on a rink of their own. (A stream of its own, so the map itself is as it always was.)
  const rinks = createRng(`${seed}/rinks`);
  const variants = RINKS.filter((x) => isVariant(x.id)).map((x) => x.id);
  for (const id of Object.keys(stops).sort()) {
    const stop = stops[id] as Stop;
    if (stop.kind === 'boss' && stop.bossId) {
      const at = bossHomeRink(stop.bossId);
      if (at) stop.rink = at;
    } else if (stop.kind === 'game' && !stop.elite && variants.length > 0 && rinks.chance(RINK_CHANCE)) {
      stop.rink = rinks.pick(variants);
    }
  }
  return { stops, regionStarts };
}

/** The rink a boss plays his home game on, if he has one. */
function bossHomeRink(bossId: string): string | undefined {
  return (bossData as unknown as { id: string; rink?: string }[]).find((b) => b.id === bossId)?.rink;
}
