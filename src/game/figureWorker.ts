import { paintFigure } from './drawFigure';
import type { PaintJob, PaintDone } from './figurePainter';

/**
 * The thread that paints player pictures. It is sent a pose as a list of shapes, paints it exactly as the page
 * would (the same `paintFigure`), and sends the finished picture back. The game goes on meanwhile.
 */
const scope = self as unknown as { onmessage: ((e: MessageEvent<PaintJob>) => void) | null; postMessage(message: PaintDone, transfer: Transferable[]): void };

scope.onmessage = (e) => {
  const job = e.data;
  const canvas = new OffscreenCanvas(1, 1);
  paintFigure(canvas, job.shapes, job.colours, job.pixels);
  const bitmap = canvas.transferToImageBitmap();
  scope.postMessage({ key: job.key, pixels: job.pixels, player: job.player, asked: job.asked, bitmap }, [bitmap]);
};
