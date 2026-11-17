import { useEffect, useRef } from 'preact/hooks';
import type { Crest } from '../core/crest';
import look from '../data/rinkLook.json';
import { FIGURE_BOX, paintFigure } from '../game/drawFigure';
import { figure, figureColours, PLAIN_LOOK, withStick, type FigureLook, type Kit, type PoseInput } from '../game/figure';

const F = look.figure;

/**
 * The on-ice player figure, painted by the same code that paints him for the rink, with his stick: for the
 * art sheet and the player's card, so every pose can be looked at large. `size` is the picture's height in pixels.
 */
export function FigureArt({ pose, crest, skin, size = 96, kit = 'home', who = PLAIN_LOOK, hair }: { pose: PoseInput; crest: Crest; skin: string; size?: number; kit?: Kit; who?: FigureLook; hair?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const unit = size / FIGURE_BOX.height;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fig = figure(pose, who);
    const end = fig.stickEnd ?? { x: pose.side * F.restStickX, y: -F.bladeWidth };
    paintFigure(canvas, withStick(fig, end, pose.side), figureColours(crest, pose.goalie, skin, kit, hair), unit * Math.max(2, window.devicePixelRatio || 1));
  });
  return <canvas ref={ref} class="figure-art" style={{ width: `${FIGURE_BOX.width * unit}px`, height: `${size}px` }} />;
}
