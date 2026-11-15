import { isVariant, rinkInfo } from '../core/rinks';
import type { SeasonMap as MapData, Stop, StopKind } from '../core/seasonMap';
import look from '../data/mapLook.json';
import { iconShapes, type IconName } from './Icon';

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

/** The icon drawn on each kind of stop, and what the kind is called. */
export const STOP_MARKS: Record<StopKind, { icon: IconName; name: string }> = {
  game: { icon: look.icons.game as IconName, name: 'Game' },
  training: { icon: look.icons.training as IconName, name: 'Training' },
  event: { icon: look.icons.event as IconName, name: 'Event' },
  shop: { icon: look.icons.shop as IconName, name: 'Shop' },
  boss: { icon: look.icons.boss as IconName, name: 'Boss' },
};

/** The backdrop behind a region: a skyline, as points across (0 to 1) and up (0 to 1). The regions take them in turn. */
export const BACKDROPS = look.backdrops as { name: string; points: [number, number][] }[];

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
      {(() => {
        // The region's skyline, faint, along the foot of the band.
        const backdrop = BACKDROPS[region % BACKDROPS.length];
        if (!backdrop) return null;
        const left = 6;
        const foot = TOP + lanes * LANE + 2;
        const wide = width - 12;
        const tall = lanes * LANE * 0.62;
        const outline = backdrop.points.map(([px, py]) => `${(left + px * wide).toFixed(1)},${(foot - py * tall).toFixed(1)}`).join(' ');
        return <polygon class="skyline" points={`${left},${foot} ${outline} ${left + wide},${foot}`} />;
      })()}
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
            <g class="mark" transform={`translate(${x(stop) - 11} ${y(stop) - 11}) scale(0.92)`}>
              {iconShapes(STOP_MARKS[stop.kind].icon)}
            </g>
            {stop.elite && (
              <g class="badge elite" transform={`translate(${x(stop) + 12} ${y(stop) - 14})`}>
                <circle r={7} />
                <path d="M0 -4.200l1.200 2.600 2.800.300-2.100 1.900.600 2.800L0 2.200l-2.500 1.400.600-2.800-2.100-1.900 2.800-.300z" />
              </g>
            )}
            {stop.kind !== 'boss' && isVariant(stop.rink) && (
              <g class="badge rink" transform={`translate(${x(stop) + 12} ${y(stop) - 14})`}>
                <title>{rinkInfo(stop.rink).name}</title>
                <rect x={-8} y={-5} width={16} height={10} rx={4} />
                <path d="M0 -5v10" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** What the marks on the map mean: the two badges, which a picture alone does not explain. */
export function MapKey() {
  return (
    <div class="map-key">
      <span>
        <i class="key-badge elite" /> Elite game
      </span>
      <span>
        <i class="key-badge rink" /> A rink of its own
      </span>
    </div>
  );
}
