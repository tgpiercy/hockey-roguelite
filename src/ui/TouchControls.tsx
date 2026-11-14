import { useEffect, useRef, useState } from 'preact/hooks';
import controls from '../data/controls.json';
import { releaseTouch, stickFromTouch, touchState, type TouchButton } from '../game/touch';
import { touchVisible, type Prefs } from './prefs';

const layout = controls.touch;

/** One on-screen button: held while a finger is on it. */
function TouchKey({ button, label, size, style }: { button: TouchButton; label: string; size: 'big' | 'small'; style?: Record<string, string> }) {
  const [down, setDown] = useState(false);
  const set = (value: boolean) => (event: PointerEvent) => {
    event.preventDefault();
    touchState.down[button] = value;
    setDown(value);
  };
  return (
    <div
      class={`touch-btn ${size}${down ? ' down' : ''}`}
      style={style}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerCancel={set(false)}
      onPointerLeave={set(false)}
    >
      {label}
    </div>
  );
}

/**
 * On-screen controls for playing without a controller: a virtual stick on the left and buttons on the right.
 * Left to themselves they appear on the first touch and are hidden again once a controller or keyboard is
 * used (`hidden`); `mode` can force them to always or never show.
 * They only write to the shared touch state; the game reads that the same way it reads a controller.
 */
export function TouchControls({ hidden, mode = 'auto' }: { hidden: boolean; mode?: Prefs['touch'] }) {
  const [shown, setShown] = useState(touchState.used);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stick = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null);

  useEffect(() => {
    const onTouch = (): void => {
      touchState.used = true;
      setShown(true);
    };
    window.addEventListener('touchstart', onTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouch);
      releaseTouch(touchState);
    };
  }, []);

  const move = (event: PointerEvent): void => {
    const box = stick.current?.getBoundingClientRect();
    if (!box) return;
    const radius = (box.width / 2) * layout.stickTravel;
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const tilt = stickFromTouch(dx, dy, radius);
    touchState.moveX = tilt.x;
    touchState.moveY = tilt.y;
    // The knob follows the finger but stays inside the ring.
    const reach = Math.min(1, Math.hypot(dx, dy) / radius);
    const angle = Math.atan2(dy, dx);
    setKnob({ x: Math.cos(angle) * reach * radius, y: Math.sin(angle) * reach * radius });
  };
  const release = (): void => {
    finger.current = null;
    touchState.moveX = 0;
    touchState.moveY = 0;
    setKnob({ x: 0, y: 0 });
  };

  return (
    <div id="touch" class={touchVisible(mode, shown, hidden) ? 'shown' : ''}>
      <div
        class="touch-stick"
        ref={stick}
        onPointerDown={(event) => {
          event.preventDefault();
          finger.current = event.pointerId;
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          move(event);
        }}
        onPointerMove={(event) => {
          if (finger.current === event.pointerId) move(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div class="touch-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div class="touch-top">
        <TouchKey button="powerupA" label="Power 1" size="small" />
        <TouchKey button="powerupB" label="Power 2" size="small" />
        <TouchKey button="lineChange" label="Lines" size="small" />
      </div>
      <div class="touch-buttons">
        <TouchKey button="shoot" label="Shoot" size="big" style={{ right: '0', bottom: '46px' }} />
        <TouchKey button="pass" label="Pass" size="big" style={{ right: '78px', bottom: '0' }} />
        <TouchKey button="check" label="Check" size="big" style={{ right: '78px', bottom: '92px' }} />
        <TouchKey button="switchPlayer" label="Swap" size="small" style={{ right: '12px', bottom: '-8px' }} />
        <TouchKey button="sprint" label="Sprint" size="small" style={{ right: '8px', bottom: '126px' }} />
      </div>
    </div>
  );
}
