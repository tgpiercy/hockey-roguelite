import type { Crest } from '../core/crest';
import look from '../data/rinkLook.json';
import { figure, figureColours, figureStyle, withStick, type FigureStyle, type Kit, type PoseInput, type Shape } from '../game/figure';
import { ABOVE_CENTRE } from '../game/figureStyles/above';

const F = look.figure;

function piece(s: Shape, fill: string, grow: number, key: string) {
  if (s.kind === 'circle') return <circle key={key} cx={s.x} cy={s.y} r={s.r + grow} fill={fill} />;
  if (s.kind === 'limb') return <line key={key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={fill} stroke-width={s.w + grow * 2} stroke-linecap="round" />;
  return <polygon key={key} points={s.points.map((p) => p.join(',')).join(' ')} fill={fill} stroke={fill} stroke-width={grow * 2} stroke-linejoin="round" />;
}

/**
 * The on-ice player figure drawn as SVG, from the same shapes the rink paints: for the art sheet, so every
 * pose can be looked at large.
 */
export function FigureArt({ pose, crest, skin, size = 96, kit = 'home', style = figureStyle() }: { pose: PoseInput; crest: Crest; skin: string; size?: number; kit?: Kit; style?: FigureStyle }) {
  const fig = figure(pose, style);
  const above = style === 'above';
  const end = fig.stickEnd ?? { x: pose.side * F.restStickX, y: -F.bladeWidth };
  // Seen from above the stick is part of the figure, and he is turned to face left instead of mirrored.
  const shapes = above ? fig.shapes : withStick(fig, end, pose.side);
  const turn = above && pose.side === -1 ? `rotate(180 0 ${-ABOVE_CENTRE})` : undefined;
  const colours = figureColours(crest, pose.goalie, skin, kit);
  return (
    <svg width={size} height={size} viewBox="-3 -5 6 5.6" class="figure-art">
      {!above && <ellipse cx="0" cy="0" rx={F.shadowWidth} ry={F.shadowHeight} fill="rgba(6, 32, 64, 0.25)" />}
      <g transform={turn}>
        {shapes.filter((s) => !s.bare).map((s, i) => piece(s, F.colours.outline, F.outline, `o${i}`))}
        {shapes.map((s, i) => piece(s, colours[s.tag], 0, `f${i}`))}
      </g>
    </svg>
  );
}
