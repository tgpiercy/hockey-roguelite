import controls from '../data/controls.json';
import { readGamepad } from '../game/gamepad';
import { bindingDown, padMap, type PadAction } from '../game/padMap';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

const listeners = new Set<(action: MenuAction) => void>();

/** Listen for menu moves. Returns a function that stops listening. */
export function onMenuAction(listener: (action: MenuAction) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(action: MenuAction): void {
  for (const listener of [...listeners]) listener(action);
}

const keyActions = new Map<string, MenuAction>();
for (const [action, codes] of Object.entries(controls.menuKeys)) {
  for (const code of codes) keyActions.set(code, action as MenuAction);
}

const STICK_THRESHOLD = 0.6;

/**
 * Turns the controller and keyboard into menu moves: d-pad or left stick to move (repeating while held),
 * A to select, B to go back. Runs only while a menu is on screen.
 */
class MenuInput {
  private running = false;
  private held: MenuAction | null = null;
  private nextRepeatAt = 0;
  private confirmWasDown = true;
  private backWasDown = true;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const action = keyActions.get(e.code);
      if (!action) return;
      e.preventDefault();
      emit(action);
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Anything still held from the game (such as A on the summary screen) must be let go before it counts.
    this.confirmWasDown = true;
    this.backWasDown = true;
    this.held = null;
    requestAnimationFrame(this.poll);
  }

  stop(): void {
    this.running = false;
  }

  private readonly poll = (now: number): void => {
    if (!this.running) return;
    const pad = readGamepad();
    if (pad) {
      // Read through the layout in use, so a controller set up by the player works the menus the same way.
      const map = padMap();
      const down = (action: PadAction): boolean => bindingDown(pad, map[action]);
      const x = pad.axes[controls.axes.moveX] ?? 0;
      const y = pad.axes[controls.axes.moveY] ?? 0;

      const direction: MenuAction | null =
        down('dpadUp') || y < -STICK_THRESHOLD
          ? 'up'
          : down('dpadDown') || y > STICK_THRESHOLD
            ? 'down'
            : down('dpadLeft') || x < -STICK_THRESHOLD
              ? 'left'
              : down('dpadRight') || x > STICK_THRESHOLD
                ? 'right'
                : null;
      if (direction === null) {
        this.held = null;
      } else if (direction !== this.held) {
        this.held = direction;
        this.nextRepeatAt = now + controls.panelRepeat.delaySeconds * 1000;
        emit(direction);
      } else if (now >= this.nextRepeatAt) {
        this.nextRepeatAt = now + controls.panelRepeat.intervalSeconds * 1000;
        emit(direction);
      }

      const confirm = down('pass');
      if (confirm && !this.confirmWasDown) emit('confirm');
      this.confirmWasDown = confirm;
      const back = down('check');
      if (back && !this.backWasDown) emit('back');
      this.backWasDown = back;
    } else {
      this.confirmWasDown = false;
      this.backWasDown = false;
    }
    requestAnimationFrame(this.poll);
  };
}

export const menuInput = new MenuInput();
