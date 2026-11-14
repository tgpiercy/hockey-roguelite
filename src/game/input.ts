import controls from '../data/controls.json';
import { applyDeadzone } from '../sim/stick';
import type { InputFrame } from '../sim/types';
import { readGamepad, type GamepadSnapshot } from './gamepad';

export interface Controls {
  /** What the simulation needs this frame. */
  frame: InputFrame;
  /** True on the frame the menu button (or key) goes down. */
  menuPressed: boolean;
  /** True on the frame the view button (or key) goes down: toggles the AI debug overlay. */
  debugPressed: boolean;
  /** D-pad presses for the tuning panel, with hold-to-repeat: -1, 0 or 1 on each axis. */
  navX: -1 | 0 | 1;
  navY: -1 | 0 | 1;
  /** True once a controller has been seen. */
  hasPad: boolean;
  /** True once any key has been pressed. */
  hasKeyboard: boolean;
}

const allKeys = new Set(Object.values(controls.keys).flat());

/** Reads the controller and keyboard once per frame and turns them into game controls. */
export class InputReader {
  private readonly keysDown = new Set<string>();
  private hasKeyboard = false;
  private menuWasDown = false;
  private debugWasDown = false;
  private navHeld = '';
  private navNextAt = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!allKeys.has(e.code)) return;
      e.preventDefault();
      this.keysDown.add(e.code);
      this.hasKeyboard = true;
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.keysDown.clear());
  }

  private key(codes: string[]): boolean {
    return codes.some((code) => this.keysDown.has(code));
  }

  read(nowMs: number): Controls {
    const pad = readGamepad();
    const b = controls.buttons;
    const down = (index: number): boolean => pad?.buttons[index]?.pressed ?? false;
    const value = (index: number): number => pad?.buttons[index]?.value ?? 0;

    // Skating: the stick if it is tilted, otherwise the keyboard.
    let move = pad
      ? applyDeadzone(pad.axes[controls.axes.moveX] ?? 0, pad.axes[controls.axes.moveY] ?? 0, controls.stickDeadzone)
      : { x: 0, y: 0 };
    if (move.x === 0 && move.y === 0) {
      const kx = (this.key(controls.keys.right) ? 1 : 0) - (this.key(controls.keys.left) ? 1 : 0);
      const ky = (this.key(controls.keys.down) ? 1 : 0) - (this.key(controls.keys.up) ? 1 : 0);
      const length = Math.hypot(kx, ky);
      if (length > 0) move = { x: kx / length, y: ky / length };
    }

    const menuDown = down(b.menu) || this.key(controls.keys.menu);
    const menuPressed = menuDown && !this.menuWasDown;
    this.menuWasDown = menuDown;

    const debugDown = down(b.view) || this.key(controls.keys.debug);
    const debugPressed = debugDown && !this.debugWasDown;
    this.debugWasDown = debugDown;

    const [navX, navY] = this.readNav(pad, nowMs);

    return {
      frame: {
        moveX: move.x,
        moveY: move.y,
        sprint: value(b.sprint) >= controls.triggerThreshold || down(b.sprint) || this.key(controls.keys.sprint),
        shoot: down(b.shoot) || this.key(controls.keys.shoot),
        pass: down(b.pass) || this.key(controls.keys.pass),
        check: down(b.check) || this.key(controls.keys.check),
        switchPlayer: down(b.switchPlayer) || this.key(controls.keys.switchPlayer),
      },
      menuPressed,
      debugPressed,
      navX,
      navY,
      hasPad: pad !== null,
      hasKeyboard: this.hasKeyboard,
    };
  }

  /** One step when a d-pad direction goes down, then repeats while it is held. */
  private readNav(pad: GamepadSnapshot | null, nowMs: number): [-1 | 0 | 1, -1 | 0 | 1] {
    const b = controls.buttons;
    const down = (index: number): boolean => pad?.buttons[index]?.pressed ?? false;
    const held = down(b.dpadUp) ? 'up' : down(b.dpadDown) ? 'down' : down(b.dpadLeft) ? 'left' : down(b.dpadRight) ? 'right' : '';

    if (held === '') {
      this.navHeld = '';
      return [0, 0];
    }
    if (held !== this.navHeld) {
      this.navHeld = held;
      this.navNextAt = nowMs + controls.panelRepeat.delaySeconds * 1000;
    } else if (nowMs >= this.navNextAt) {
      this.navNextAt = nowMs + controls.panelRepeat.intervalSeconds * 1000;
    } else {
      return [0, 0];
    }
    if (held === 'up') return [0, -1];
    if (held === 'down') return [0, 1];
    return held === 'left' ? [-1, 0] : [1, 0];
  }
}
