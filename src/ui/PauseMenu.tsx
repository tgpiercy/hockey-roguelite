import { useState } from 'preact/hooks';
import controls from '../data/controls.json';
import xbox from '../data/xboxMapping.json';
import { gameAudio } from '../game/audio';
import { Menu } from './Menu';
import { loadPrefs, savePrefs, TOUCH_MODES, VOLUME_STEPS, type Prefs } from './prefs';

type Action = keyof typeof controls.buttons & keyof typeof controls.keys;

/** What each control is called in the layout, in the order it is listed. */
const ACTIONS: [Action, string][] = [
  ['pass', 'Pass, faceoff draw'],
  ['shoot', 'Shoot'],
  ['check', 'Check'],
  ['switchPlayer', 'Switch player'],
  ['sprint', 'Sprint'],
  ['lineChange', 'Line change'],
  ['powerupA', 'Powerup 1'],
  ['powerupB', 'Powerup 2'],
  ['menu', 'Pause'],
];

const TOUCH_NAMES: Record<Prefs['touch'], string> = { auto: 'Automatic', always: 'Always', never: 'Never' };
const TOUCH_NOTES: Record<Prefs['touch'], string> = {
  auto: 'They appear when you touch the screen and step aside for a controller or keyboard.',
  always: 'They stay on screen even with a controller connected.',
  never: 'They never show. You need a controller or keyboard to play.',
};

/** A key's code as a player would say it: "KeyZ" is Z, "Digit1" is 1, "ShiftLeft" is Shift. */
export function keyName(code: string): string {
  return code.replace(/^Key|^Digit/, '').replace(/(Left|Right)$/, (side) => (code.startsWith('Arrow') ? ` ${side.toLowerCase()}` : ''));
}

/** The button layout, read from the same tables the game reads its controls from. */
function Layout() {
  return (
    <div class="controls-table">
      <div class="controls-row head">
        <span>Action</span>
        <span>Controller</span>
        <span>Keyboard</span>
      </div>
      <div class="controls-row">
        <span>Skate</span>
        <span>Left stick</span>
        <span>Arrows or WASD</span>
      </div>
      {ACTIONS.map(([action, name]) => (
        <div key={action} class="controls-row">
          <span>{name}</span>
          <span>{xbox.buttons[controls.buttons[action]]?.label ?? ''}</span>
          <span>{[...new Set(controls.keys[action].map(keyName))].join(' or ')}</span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  /** Shown when asking whether to end the game, such as what a forfeit costs. Left out for a game that does not count. */
  endNote?: string;
  onResume: () => void;
  /** Close the pause menu and open the tuning panel. */
  onTuning: () => void;
  /** End the game now. */
  onEnd: () => void;
  /** Told whenever a preference changes, so the game can follow it at once. */
  onPrefs: (prefs: Prefs) => void;
}

/** The pause menu over the rink: resume, sound, the controls, the tuning panel and ending the game. */
export function PauseMenu({ endNote, onResume, onTuning, onEnd, onPrefs }: Props) {
  const [page, setPage] = useState<'main' | 'controls' | 'end'>('main');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const change = (next: Prefs): void => {
    savePrefs(next);
    setPrefs(next);
    gameAudio.configure(next.sound, next.volume);
    onPrefs(next);
  };

  if (page === 'controls') {
    return (
      <Menu
        key="controls"
        title="Controls"
        header={<Layout />}
        onBack={() => setPage('main')}
        items={[
          {
            key: 'touch',
            label: `On-screen controls: ${TOUCH_NAMES[prefs.touch]}`,
            detail: TOUCH_NOTES[prefs.touch],
            onSelect: () => change({ ...prefs, touch: TOUCH_MODES[(TOUCH_MODES.indexOf(prefs.touch) + 1) % TOUCH_MODES.length] as Prefs['touch'] }),
          },
          { key: 'back', label: 'Back', onSelect: () => setPage('main') },
        ]}
      />
    );
  }

  if (page === 'end') {
    return (
      <Menu
        key="end"
        title={endNote ? 'Forfeit the game?' : 'End the game?'}
        header={endNote ?? 'This game does not count, so nothing is lost.'}
        onBack={() => setPage('main')}
        initialFocus={1}
        items={[
          { key: 'yes', label: endNote ? 'Yes, forfeit' : 'Yes, end it', onSelect: onEnd },
          { key: 'no', label: 'No, keep playing', onSelect: () => setPage('main') },
        ]}
      />
    );
  }

  return (
    <Menu
      key="main"
      title="Paused"
      onBack={onResume}
      help="A select · B resume"
      items={[
        { key: 'resume', label: 'Resume', detail: 'Back to the game.', onSelect: onResume },
        { key: 'sound', label: `Sound: ${prefs.sound ? 'On' : 'Off'}`, detail: 'Switch every sound on or off.', onSelect: () => change({ ...prefs, sound: !prefs.sound }) },
        {
          key: 'volume',
          label: `Volume: ${Math.round(prefs.volume * 100)}%`,
          detail: 'Press to step through the levels.',
          disabled: !prefs.sound,
          onSelect: () => {
            const next = VOLUME_STEPS[(VOLUME_STEPS.findIndex((v) => v >= prefs.volume - 0.001) + 1) % VOLUME_STEPS.length] as number;
            change({ ...prefs, volume: next });
            gameAudio.play('chime');
          },
        },
        { key: 'controls', label: 'Controls', detail: 'What every button does, and the on-screen controls.', onSelect: () => setPage('controls') },
        { key: 'tuning', label: 'Tuning', detail: 'Open the tuning panel to change the physics numbers. The game runs on while it is open.', onSelect: onTuning },
        {
          key: 'end',
          label: endNote ? 'Forfeit the game' : 'End the game',
          detail: endNote ?? 'This game does not count, so nothing is lost.',
          onSelect: () => setPage('end'),
        },
      ]}
    />
  );
}
