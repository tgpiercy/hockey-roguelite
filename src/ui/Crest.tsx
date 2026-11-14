import { EMBLEM_PARTS, SHAPE_POINTS, type Crest, type Point } from '../core/crest';

const path = (points: Point[], scale: number): string => points.map(([x, y]) => `${(x * scale).toFixed(2)},${(y * scale).toFixed(2)}`).join(' ');

/**
 * A team's badge: a bordered shape in its main colour with an emblem in its second colour.
 * The same data is drawn on the ice by src/game/drawCrest.ts, so the two always match.
 */
export function CrestBadge({ crest, size = 28 }: { crest: Crest; size?: number }) {
  const outline = SHAPE_POINTS[crest.shape];
  const parts = EMBLEM_PARTS[crest.emblem] ?? [];
  return (
    <svg class="crest" width={size} height={size} viewBox="-1.05 -1.05 2.1 2.1" role="img" aria-label="Team crest">
      <polygon points={path(outline, 1)} fill={crest.trim} />
      <polygon points={path(outline, 0.86)} fill={crest.primary} />
      {parts.map((part, i) => (
        <polygon key={i} points={path(part.points, 0.82)} fill={part.cut ? crest.primary : crest.secondary} />
      ))}
    </svg>
  );
}
