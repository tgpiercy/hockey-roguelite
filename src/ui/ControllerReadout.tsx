import type { GamepadSnapshot } from '../game/gamepad';
import mapping from '../data/xboxMapping.json';

interface Props {
  snapshot: GamepadSnapshot | null;
}

export function ControllerReadout({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div class="connect">
        <div class="connect-title">Press any button to connect controller</div>
        <div class="connect-hint">Pair the controller with this phone over Bluetooth first.</div>
      </div>
    );
  }

  return (
    <div class="readout">
      <div class="pad-id">{snapshot.id}</div>
      {snapshot.mapping !== 'standard' && (
        <div class="warn">
          Layout reported as "{snapshot.mapping || 'unknown'}", not "standard": labels may not match.
        </div>
      )}

      <h2>Axes</h2>
      {snapshot.axes.map((value, i) => {
        const info = mapping.axes[i];
        const fill = { left: `${50 + Math.min(0, value) * 50}%`, width: `${Math.abs(value) * 50}%` };
        return (
          <div class="row" key={`a${i}`}>
            <span class="idx">{i}</span>
            <span class="name">{info?.label ?? `Axis ${i}`}</span>
            <span class="bar">
              <span class="bar-fill" style={fill} />
            </span>
            <span class="val">{value.toFixed(2)}</span>
          </div>
        );
      })}

      <h2>Buttons</h2>
      {snapshot.buttons.map((button, i) => {
        const info = mapping.buttons[i];
        return (
          <div class={button.pressed ? 'row on' : 'row'} key={`b${i}`}>
            <span class="idx">{i}</span>
            <span class="name">
              {info?.label ?? `Button ${i}`}
              {info?.action ? <span class="action"> {info.action}</span> : null}
            </span>
            <span class="val">{button.value.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}
