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
export function generateMap(seed: string, teamsByStrength: string[]): SeasonMap {
  const rng = createRng(`${seed}/map`);
  const stops: Record<string, Stop> = {};
  const regionStarts: string[][] = [];
  const eventOrder = rng.shuffle(events.map((e) => e.id));
  const bossOrder = rng.shuffle(bosses.map((b) => b.id));
  const tierSize = Math.max(1, Math.floor(teamsByStrength.length / rules.regions));
  let nextEvent = 0;

  for (let region = 0; region < rules.regions; region++) {
    const tier = teamsByStrength.slice(region * tierSize, region === rules.regions - 1 ? undefined : (region + 1) * tierSize);
    let opponents = rng.shuffle(tier);
    const rows: Stop[][] = [];

    rules.steps.forEach((pattern, step) => {
      const row: Stop[] = [];
      const make = (kind: StopKind, index: number): Stop => ({ id: `r${region}s${step}n${index}`, region, step, kind, next: [] });

      if (pattern === 'boss') {
        row.push({ ...make('boss', 0), bossId: bossOrder[region % bossOrder.length] as string });
      } else if (pattern === 'game') {
        for (let i = 0; i < rules.choicesPerStep; i++) {
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
  return { stops, regionStarts };
}
