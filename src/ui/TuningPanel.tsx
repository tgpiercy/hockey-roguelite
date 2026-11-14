import { useEffect, useRef } from 'preact/hooks';
import { entries, tuningStore as store } from './tuningStore';

/** Turns "sprintSpeedBoost" into "sprint speed boost". */
const words = (key: string): string => key.replace(/([A-Z])/g, ' $1').toLowerCase();

/** Live editor for every value in src/data/physics.json. */
export function TuningPanel() {
  const selectedRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' });
  });

  if (!store.open) return null;

  let lastGroup = '';
  return (
    <div class="tuning">
      <div class="tuning-head">
        <strong>Tuning</strong>
        <button onClick={() => void store.exportJson()}>Export JSON</button>
        <button onClick={() => store.reset()}>Reset</button>
        <button onClick={() => store.toggle()}>Close</button>
      </div>
      <div class="tuning-help">D-pad: up and down to choose, left and right to change. Menu closes.</div>
      {store.status && <div class="tuning-status">{store.status}</div>}
      <div class="tuning-list">
        {entries.map((entry, i) => {
          const heading = entry.group !== lastGroup ? <h2>{entry.group}</h2> : null;
          lastGroup = entry.group;
          const value = store.value(entry);
          const changed = value !== store.defaultValue(entry);
          const selected = i === store.selected;
          return (
            <>
              {heading}
              <div
                class={`tuning-row${selected ? ' selected' : ''}${changed ? ' changed' : ''}`}
                ref={selected ? selectedRow : undefined}
                onClick={() => store.select(i)}
              >
                <span class="name">{words(entry.key)}</span>
                <button onClick={() => store.adjust(i, -1)}>−</button>
                <span class="val">{value}</span>
                <button onClick={() => store.adjust(i, 1)}>+</button>
              </div>
            </>
          );
        })}
      </div>
    </div>
  );
}
