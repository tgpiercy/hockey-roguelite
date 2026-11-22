import type { Shape, Tag } from './figure';
// Built into the game's own script, not a file of its own: the copy kept for playing offline and the
// check that a kept game was written by the same build both go by the page's files, and stay as they are.
import PainterWorker from './figureWorker?worker&inline';

/** One picture to paint: the pose as shapes, the colours, and how many pixels to a footprint radius. */
export interface PaintJob {
  key: string;
  shapes: readonly Shape[];
  colours: Record<Tag, string>;
  pixels: number;
  /** Whose picture it is, and the frame it was asked for on: handed back with it. */
  player: number;
  asked: number;
}

export interface PaintDone {
  key: string;
  pixels: number;
  player: number;
  asked: number;
  bitmap: ImageBitmap;
}

/**
 * Paints player pictures on a thread of their own. `ready` is false where the browser cannot (no such thread,
 * or no canvas off the page), or once the thread has failed: the rink then paints them itself, as it used to.
 */
export class FigurePainter {
  private worker: Worker | null = null;
  /** The pictures asked for and not yet back. */
  readonly waiting = new Set<string>();

  constructor(private readonly done: (key: string, bitmap: ImageBitmap, pixels: number, player: number, asked: number) => void) {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
    try {
      const worker = new PainterWorker();
      worker.onmessage = (e: MessageEvent<PaintDone>) => {
        const d = e.data;
        this.waiting.delete(d.key);
        this.done(d.key, d.bitmap, d.pixels, d.player, d.asked);
      };
      worker.onerror = () => this.dispose();
      this.worker = worker;
    } catch {
      this.worker = null;
    }
  }

  get ready(): boolean {
    return this.worker !== null;
  }

  ask(key: string, shapes: readonly Shape[], colours: Record<Tag, string>, pixels: number, player: number, asked: number): void {
    if (!this.worker) return;
    this.waiting.add(key);
    const job: PaintJob = { key, shapes, colours, pixels, player, asked };
    this.worker.postMessage(job);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
  }
}
