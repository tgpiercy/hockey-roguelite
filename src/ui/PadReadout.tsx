import { useEffect, useState } from 'preact/hooks';
import controls from '../data/controls.json';
import { readGamepad, type GamepadSnapshot } from '../game/gamepad';
import { hasCustomPadMap, PAD_ACTIONS, padMap } from '../game/padMap';
import { TOUCH_BUTTONS, touchState } from '../game/touch';

/** What the game does with each controller button, by its number, in the layout in use. */
function actionOf(index: number): string {
  const map = padMap();
  return PAD_ACTIONS.filter((action) => map[action].kind === 'button' && map[action].index === index).join(', ');
}

/**
 * What the game is reading from the controller and the on-screen buttons right now. It is there to find out
 * why a button does nothing: press it and see whether, and as what, it shows up here.
 */
export function PadReadout() {
  const [pad, setPad] = useState<GamepadSnapshot | null>(null);
  const [, redraw] = useState(0);
  useEffect(() => {
    // A timer, not animation frames: it must keep reading while the game underneath is paused.
    const timer = setInterval(() => {
      setPad(readGamepad());
      redraw((n) => n + 1);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const pressed = pad ? pad.buttons.map((b, i) => ({ b, i })).filter(({ b }) => b.pressed || b.value >= controls.triggerThreshold) : [];
  const held = TOUCH_BUTTONS.filter((button) => touchState.down[button]);
  const stick = pad ? `${(pad.axes[controls.axes.moveX] ?? 0).toFixed(1)}, ${(pad.axes[controls.axes.moveY] ?? 0).toFixed(1)}` : '';
  return (
    <div class="pad-readout">
      <i>What the game sees now</i>
      {pad ? (
        <>
          <span>
            Controller: <b>{pad.id.slice(0, 40) || 'unnamed'}</b>
          </span>
          <span>
            Layout: <b>{pad.mapping === 'standard' ? 'standard' : `not standard (${pad.mapping || 'none'}): buttons may be mixed up`}</b> · {pad.buttons.length} buttons
          </span>
          <span>
            Pressed:{' '}
            <b>
              {pressed.length === 0
                ? 'nothing'
                : pressed.map(({ i }) => `button ${i}: ${actionOf(i) || 'unused'}`).join(' · ')}
            </b>
          </span>
          <span>
            Left stick: <b>{stick}</b> · Buttons: <b>{hasCustomPadMap() ? 'set up by you' : 'standard layout'}</b>
          </span>
        </>
      ) : (
        <span>No controller seen yet. Press any button on it.</span>
      )}
      <span>
        On-screen buttons held: <b>{held.length === 0 ? 'none' : held.join(', ')}</b>
      </span>
    </div>
  );
}
