import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { onMenuAction } from './menuInput';

export interface MenuItem {
  key: string;
  label: ComponentChildren;
  /** Shown under the list while this item is focused. */
  detail?: ComponentChildren;
  /** A (or Enter, or a click). */
  onSelect?: () => void;
  /** Left and right on the focused item. */
  onLeft?: () => void;
  onRight?: () => void;
  /** Greyed out; can still be focused so its detail can be read. */
  disabled?: boolean;
}

interface Props {
  title: string;
  /** Anything to show between the title and the list. */
  header?: ComponentChildren;
  items: MenuItem[];
  /** B (or Escape). Left out on the top screen. */
  onBack?: () => void;
  /** One line of help at the bottom. */
  help?: string;
  /** A message to show above the list, such as why a signing was refused. */
  message?: string;
  /** Which item to start on. */
  initialFocus?: number;
  /** If given, the screen remembers which item was focused and returns to it next time. */
  remember?: string;
}

const remembered = new Map<string, number>();

/**
 * One screen of the menus: a list worked with the d-pad or left stick, A to select and B to go back.
 * Every screen in the game is one of these, so they all behave the same.
 */
export function Menu({ title, header, items, onBack, help, message, initialFocus = 0, remember }: Props) {
  const [focus, setFocus] = useState((remember !== undefined ? remembered.get(remember) : undefined) ?? initialFocus);
  const current = Math.min(focus, Math.max(0, items.length - 1));
  if (remember !== undefined) remembered.set(remember, current);
  const focused = useRef<HTMLDivElement>(null);

  // The handlers change every render; keep the latest where the listener can reach them.
  const latest = useRef({ items, current, onBack });
  latest.current = { items, current, onBack };

  useEffect(
    () =>
      onMenuAction((action) => {
        const now = latest.current;
        const count = now.items.length;
        const item = now.items[now.current];
        if (action === 'up' && count > 0) setFocus((now.current - 1 + count) % count);
        else if (action === 'down' && count > 0) setFocus((now.current + 1) % count);
        else if (action === 'left') item?.onLeft?.();
        else if (action === 'right') item?.onRight?.();
        else if (action === 'confirm' && item && !item.disabled) item.onSelect?.();
        else if (action === 'back') now.onBack?.();
      }),
    [],
  );

  useEffect(() => {
    focused.current?.scrollIntoView({ block: 'nearest' });
  });

  const detail = items[current]?.detail;
  return (
    <div class="menu">
      <div class="menu-title">
        {onBack && (
          <button class="menu-back" onClick={onBack}>
            ‹ Back
          </button>
        )}
        <h1>{title}</h1>
      </div>
      {header && <div class="menu-header">{header}</div>}
      {message && <div class="menu-message">{message}</div>}
      <div class="menu-list">
        {items.map((item, i) => (
          <div
            key={item.key}
            ref={i === current ? focused : undefined}
            class={`menu-item${i === current ? ' focused' : ''}${item.disabled ? ' disabled' : ''}`}
            onMouseMove={() => i !== current && setFocus(i)}
            onClick={() => {
              setFocus(i);
              if (!item.disabled) item.onSelect?.();
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
      {detail && <div class="menu-detail">{detail}</div>}
      <div class="menu-help">{help ?? (onBack ? 'A select · B back' : 'A select')}</div>
    </div>
  );
}
