import controls from '../data/controls.json';
import { applyDeadzone } from '../sim/stick';
import type { InputFrame } from '../sim/types';
import { readGamepad, type GamepadSnapshot } from './gamepad';
import { bindingDown, padMap, type PadAction } from './padMap';
import { mergeFrames, touchFrame, touchState } from './touch';

export interface Controls {
  /** What the simulation needs this frame. */
  frame: InputFrame;
  /** True on the frame the menu button (or key) goes down. */
  menuPressed: boolean;
  /** Which player pressed it: 0 or 1. Left out when it was player one. */
  menuPlayer?: 0 | 1;
  /** True on the frame the debug key goes down: toggles the AI debug overlay. Keyboard only. */
  debugPressed: boolean;
  /** D-pad presses for the tuning panel, with hold-to-repeat: -1, 0 or 1 on each axis. */
  navX: -1 | 0 | 1;
  navY: -1 | 0 | 1;
  /** True once a controller has been seen. */
  hasPad: boolean;
  /** True once any key has been pressed. */
  hasKeyboard: boolean;
  /** True once the screen has been touched: the on-screen controls are in use. */
  hasTouch: boolean;
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

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!allKeys.has(e.code)) return;
    e.preventDefault();
    this.keysDown.add(e.code);
    this.hasKeyboard = true;
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => void this.keysDown.delete(e.code);
  private readonly onBlur = (): void => this.keysDown.clear();

  /** Player one (0) also has the keyboard and the on-screen buttons; player two (1) has his controller only. */
  constructor(private readonly player: 0 | 1 = 0) {
    if (player !== 0) return;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** What the player is playing with: a controller if one is in use, the keyboard if a key has been pressed, else the screen. */
  device(): 'pad' | 'keys' | 'touch' {
    if (readGamepad(this.player)) return 'pad';
    return this.hasKeyboard || !(navigator.maxTouchPoints > 0) ? 'keys' : 'touch';
  }

  /** Stops listening to the keyboard. Call when the game that owns this reader ends. */
  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private key(codes: string[]): boolean {
    return codes.some((code) => this.keysDown.has(code));
  }

  read(nowMs: number): Controls {
    const pad = readGamepad(this.player);
    // Each action is read through the layout in use: the standard one, or the player's own from the setup screen.
    const map = padMap(this.player);
    const down = (action: PadAction): boolean => bindingDown(pad, map[action]);

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

    const menuDown = down('menu') || this.key(controls.keys.menu);
    const menuPressed = menuDown && !this.menuWasDown;
    this.menuWasDown = menuDown;

    const debugDown = this.key(controls.keys.debug);
    const debugPressed = debugDown && !this.debugWasDown;
    this.debugWasDown = debugDown;

    const [navX, navY] = this.readNav(pad, nowMs);

    // The on-screen controls count as well (for player one): whichever stick is tilted further, and any button held on either.
    const own: InputFrame = {
        moveX: move.x,
        moveY: move.y,
        sprint: down('sprint') || this.key(controls.keys.sprint),
        shoot: down('shoot') || this.key(controls.keys.shoot),
        pass: down('pass') || this.key(controls.keys.pass),
        check: down('check') || this.key(controls.keys.check),
        switchPlayer: down('switchPlayer') || this.key(controls.keys.switchPlayer),
        lineChange: down('lineChange') || this.key(controls.keys.lineChange),
        powerupA: down('powerupA') || this.key(controls.keys.powerupA),
        powerupB: down('powerupB') || this.key(controls.keys.powerupB),
        pullGoalie: down('pullGoalie') || this.key(controls.keys.pullGoalie),
      };
    const frame = this.player === 0 ? mergeFrames(own, touchFrame(touchState)) : own;

    return {
      frame,
      menuPressed,
      debugPressed,
      navX,
      navY,
      hasPad: pad !== null,
      hasKeyboard: this.hasKeyboard,
      hasTouch: this.player === 0 && touchState.used,
    };
  }

  /** One step when a d-pad direction goes down, then repeats while it is held. */
  private readNav(pad: GamepadSnapshot | null, nowMs: number): [-1 | 0 | 1, -1 | 0 | 1] {
    const map = padMap(this.player);
    const down = (action: PadAction): boolean => bindingDown(pad, map[action]);
    const held = down('dpadUp') ? 'up' : down('dpadDown') ? 'down' : down('dpadLeft') ? 'left' : down('dpadRight') ? 'right' : '';

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
