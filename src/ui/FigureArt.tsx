import type { Crest } from '../core/crest';
import look from '../data/rinkLook.json';
import { figure, figureColours, PLAIN_LOOK, withStick, type FigureLook, type Kit, type PoseInput, type Shape } from '../game/figure';

const F = look.figure;
let nextId = 0;

function piece(s: Shape, fill: string, grow: number, key: string) {
  if (s.kind === 'circle') return <circle key={key} cx={s.x} cy={s.y} r={s.r + grow} fill={fill} />;
  if (s.kind === 'limb') return <line key={key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={fill} stroke-width={s.w + grow * 2} stroke-linecap="round" />;
  return <polygon key={key} points={s.points.map((p) => p.join(',')).join(' ')} fill={fill} stroke={fill} stroke-width={grow * 2} stroke-linejoin="round" />;
}

/**
 * The on-ice player figure drawn as SVG, from the same shapes the rink paints: for the art sheet, so every
 * pose can be looked at large. The light from above is laid over the figure through a mask of its own shape,
 * as the rink lays it over the painted pixels.
 */
export function FigureArt({ pose, crest, skin, size = 96, kit = 'home', who = PLAIN_LOOK, hair }: { pose: PoseInput; crest: Crest; skin: string; size?: number; kit?: Kit; who?: FigureLook; hair?: string }) {
  const fig = figure(pose, who);
  const end = fig.stickEnd ?? { x: pose.side * F.restStickX, y: -F.bladeWidth };
  const shapes = withStick(fig, end, pose.side);
  const colours = figureColours(crest, pose.goalie, skin, kit, hair);
  const id = `fig${nextId++}`;
  return (
    <svg width={size} height={size} viewBox="-3 -5 6 5.6" class="figure-art">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity={F.shade.light} />
          <stop offset="0.45" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="0.55" stop-color="#08142c" stop-opacity="0" />
          <stop offset="1" stop-color="#08142c" stop-opacity={F.shade.dark} />
        </linearGradient>
        <mask id={`${id}m`}>{shapes.map((s, i) => piece(s, '#ffffff', s.bare ? 0 : F.outline, `m${i}`))}</mask>
      </defs>
      <ellipse cx="0" cy="0" rx={F.shadowWidth} ry={F.shadowHeight} fill="rgba(6, 32, 64, 0.25)" />
      {shapes.filter((s) => !s.bare).map((s, i) => piece(s, F.colours.outline, F.outline, `o${i}`))}
      {shapes.map((s, i) => piece(s, colours[s.tag], 0, `f${i}`))}
      <rect x="-3" y="-5" width="6" height="5.6" fill={`url(#${id}g)`} mask={`url(#${id}m)`} />
    </svg>
  );
}
