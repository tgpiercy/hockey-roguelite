import type { SeasonMap as MapData, Stop, StopKind } from '../core/seasonMap';

interface Props {
  map: MapData;
  /** The last stop finished, the stop being dealt with now, and the stops that can be reached next. */
  last: string | null;
  current: string | null;
  open: string[];
  /** The stop the player is pointing at in the list, to light up. */
  focus: string | null;
  /** Every stop finished so far this season, in order. */
  walked: string[];
  /** The region to draw, large. The others are shown as a row of progress pips above it. */
  region: number;
}

/** The letter drawn on each kind of stop, and what it means in the key. */
export const STOP_MARKS: Record<StopKind, { mark: string; name: string }> = {
  game: { mark: 'G', name: 'Game' },
  training: { mark: 'T', name: 'Training' },
  event: { mark: '?', name: 'Event' },
  shop: { mark: '$', name: 'Shop' },
  boss: { mark: 'B', name: 'Boss' },
};

const STEP = 64;
const LANE = 62;
const TOP = 8;

/** Which lane a stop is in: its place among the choices on its step. */
const laneOf = (stop: Stop): number => Number(stop.id.split('n')[1] ?? 0);

/**
 * One region of the season as a route: a column of stops per step, joined by the paths between them.
 * Finished stops are filled, the ones you can reach next are ringed, and the one you are pointing at
 * in the list is lit. A row of pips above says which region this is and how far the season has got.
 */
export function SeasonMapView({ map, last, current, open, focus, walked, region }: Props) {
  const all = Object.values(map.stops);
  const regions = Math.max(...all.map((s) => s.region)) + 1;
  const stops = all.filter((s) => s.region === region);
  const steps = Math.max(...stops.map((s) => s.step)) + 1;
  const lanes = Math.max(...stops.map(laneOf)) + 1;
  const width = steps * STEP + 16;
  const height = TOP + lanes * LANE + 8;

  const lanesAt = (stop: Stop): number => stops.filter((s) => s.region === stop.region && s.step === stop.step).length;
  const x = (stop: Stop): number => 8 + stop.step * STEP + STEP / 2;
  // A step with a single stop (the boss) sits in the middle of the lanes.
  const y = (stop: Stop): number => TOP + (lanesAt(stop) === 1 ? (lanes * LANE) / 2 : laneOf(stop) * LANE + LANE / 2);

  const done = new Set(walked);
  const reachable = new Set(open);
  const here = current ?? last;

  return (
    <div class="map-wrap">
      <div class="map-regions">
        {Array.from({ length: regions }, (_, r) => (
          <span key={r} class={`map-region${r === region ? ' now' : r < region ? ' done' : ''}`}>
            Region {r + 1}
          </span>
        ))}
        <span class="map-region">Playoffs</span>
      </div>
    <svg class="season-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Season map">
      <rect class="band" x={4} y={TOP - 4} width={width - 8} height={lanes * LANE + 8} rx={10} />
      {stops.flatMap((from) =>
        from.next.map((id) => {
          const to = map.stops[id] as Stop;
          const walkedEdge = done.has(from.id) && (done.has(to.id) || to.id === current);
          const openEdge = from.id === last && current === null && reachable.has(to.id);
          return (
            <line
              key={`${from.id}-${id}`}
              class={`edge${walkedEdge ? ' walked' : openEdge ? ' open' : ''}`}
              x1={x(from)}
              y1={y(from)}
              x2={x(to)}
              y2={y(to)}
            />
          );
        }),
      )}
      {stops.map((stop) => {
        const state = stop.id === focus ? ' focus' : stop.id === here && stop.id === current ? ' here' : done.has(stop.id) ? ' done' : reachable.has(stop.id) ? ' open' : '';
        const size = stop.kind === 'boss' ? 21 : 19;
        return (
          <g key={stop.id}>
            {stop.kind === 'boss' ? (
              <rect class={`stop${state}`} x={x(stop) - size} y={y(stop) - size} width={size * 2} height={size * 2} rx={5} transform={`rotate(45 ${x(stop)} ${y(stop)})`} />
            ) : (
              <circle class={`stop${state}`} cx={x(stop)} cy={y(stop)} r={size} />
            )}
            <text class="mark" x={x(stop)} y={y(stop)}>
              {STOP_MARKS[stop.kind].mark}
            </text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** What the letters on the map mean. */
export function MapKey() {
  return (
    <div class="map-key">
      {Object.values(STOP_MARKS).map((entry) => (
        <span key={entry.name}>
          <b>{entry.mark}</b> {entry.name}
        </span>
      ))}
    </div>
  );
}
