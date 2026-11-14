import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { gameAudio } from '../game/audio';
import { gridMove } from './gridMove';
import { onMenuAction } from './menuInput';

export interface MenuItem {
  key: string;
  label: ComponentChildren;
  /** Shown in the side panel while this item is focused. */
  detail?: ComponentChildren;
  /** A (or Enter, or a tap). */
  onSelect?: () => void;
  /** Left and right on the focused item. */
  onLeft?: () => void;
  onRight?: () => void;
  /** Greyed out; can still be focused so its detail can be read. */
  disabled?: boolean;
  /** On a grid screen: this item takes a whole row to itself. */
  wide?: boolean;
}

interface Props {
  title: string;
  /** Anything to show at the top of the side panel: the facts of this screen. */
  header?: ComponentChildren;
  items: MenuItem[];
  /** B (or Escape). Left out on the top screen. */
  onBack?: () => void;
  /** One line of help at the bottom, such as "A sign · left/right sort · B back". */
  help?: string;
  /** A message to show above the list, such as why a signing was refused. */
  message?: string;
  /** Which item to start on. */
  initialFocus?: number;
  /** If given, the screen remembers which item was focused and returns to it next time. */
  remember?: string;
  /** Told which item is focused whenever it changes, so the screen can light something up to match. */
  onFocus?: (key: string | null) => void;
  /** Put the screen's facts across the top with the list beneath, for screens that are mostly something to read. */
  stack?: boolean;
  /** Lay the items out as a grid this many columns wide, moved around with all four directions. */
  columns?: number;
}

/** Something every menu screen shows in its top bar: the strip of cap space, cash, tape and Pucks. */
export const MenuChrome = createContext<ComponentChildren>(null);

const remembered = new Map<string, number>();

/** One line of help with the controller buttons drawn as glyphs: "A sign · B back". */
function Help({ text }: { text: string }) {
  return (
    <div class="menu-help">
      {text.split(' · ').map((part) => {
        const [first, ...rest] = part.split(' ');
        const words = rest.join(' ');
        if (first === 'A' || first === 'B') {
          return (
            <span key={part}>
              <span class={`glyph glyph-${first.toLowerCase()}`}>{first}</span>
              {words}
            </span>
          );
        }
        if (first === 'left/right') {
          return (
            <span key={part}>
              <span class="glyph glyph-pad">◀ ▶</span>
              {words}
            </span>
          );
        }
        return <span key={part}>{part}</span>;
      })}
    </div>
  );
}

/**
 * One screen of the menus: a list worked with the d-pad or left stick, A to select and B to go back,
 * with a side panel for the screen's facts and the focused item's details.
 * Every screen in the game is one of these, so they all look and behave the same.
 */
export function Menu({ title, header, items, onBack, help, message, initialFocus = 0, remember, onFocus, stack = false, columns }: Props) {
  const chrome = useContext(MenuChrome);
  const [focus, setFocus] = useState((remember !== undefined ? remembered.get(remember) : undefined) ?? initialFocus);
  const current = Math.min(focus, Math.max(0, items.length - 1));
  if (remember !== undefined) remembered.set(remember, current);
  const focused = useRef<HTMLDivElement>(null);

  // The handlers change every render; keep the latest where the listener can reach them.
  const latest = useRef({ items, current, onBack, onFocus, columns });
  latest.current = { items, current, onBack, onFocus, columns };

  useEffect(
    () =>
      onMenuAction((action) => {
        const now = latest.current;
        const count = now.items.length;
        const item = now.items[now.current];
        // Any press is the player's own, which is what browsers need before they allow sound.
        gameAudio.unlock();
        if (now.columns && count > 0 && (action === 'up' || action === 'down' || action === 'left' || action === 'right')) {
          // A grid: all four directions move the focus.
          const next = gridMove(
            now.items.map((i) => Boolean(i.wide)),
            now.columns,
            now.current,
            action,
          );
          if (next !== now.current) gameAudio.play('tick');
          setFocus(next);
        } else if (action === 'up' && count > 0) {
          setFocus((now.current - 1 + count) % count);
          gameAudio.play('tick');
        } else if (action === 'down' && count > 0) {
          setFocus((now.current + 1) % count);
          gameAudio.play('tick');
        } else if (action === 'left') item?.onLeft?.();
        else if (action === 'right') item?.onRight?.();
        else if (action === 'confirm' && item && !item.disabled) {
          gameAudio.play('select');
          item.onSelect?.();
        } else if (action === 'back' && now.onBack) {
          gameAudio.play('back');
          now.onBack();
        }
      }),
    [],
  );

  useEffect(() => {
    focused.current?.scrollIntoView({ block: 'nearest' });
  });

  const focusedKey = items[current]?.key ?? null;
  useEffect(() => {
    latest.current.onFocus?.(focusedKey);
  }, [focusedKey]);

  const detail = items[current]?.detail;
  // The side panel appears on any screen that has facts of its own or an item with details.
  const side = Boolean(header) || items.some((item) => item.detail !== undefined);
  return (
    <div class="menu">
      <div class="menu-top">
        <div class="menu-title">
          {onBack && (
            <button class="menu-back" onClick={onBack} aria-label="Back">
              ‹
            </button>
          )}
          <h1>{title}</h1>
        </div>
        {chrome}
      </div>
      {message && <div class="menu-message">{message}</div>}
      <div class={`menu-body${side ? ' two' : ''}${stack ? ' stack' : ''}`}>
        <div class={`menu-list${columns ? ' grid' : ''}`} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
          {items.map((item, i) => (
            <div
              key={item.key}
              ref={i === current ? focused : undefined}
              class={`menu-item${i === current ? ' focused' : ''}${item.disabled ? ' disabled' : ''}${item.wide ? ' wide' : ''}`}
              onMouseMove={() => i !== current && setFocus(i)}
              onClick={() => {
                gameAudio.unlock();
                setFocus(i);
                if (!item.disabled) {
                  gameAudio.play('select');
                  item.onSelect?.();
                }
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
        {side && (
          <div class="menu-side">
            {header && <div class="menu-header">{header}</div>}
            {detail !== undefined && detail !== null && detail !== false && <div class="menu-detail">{detail}</div>}
          </div>
        )}
      </div>
      <Help text={help ?? (onBack ? 'A select · B back' : 'A select')} />
    </div>
  );
}
