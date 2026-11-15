import { useEffect, useRef, useState } from 'preact/hooks';
import { readGamepad, type GamepadSnapshot } from '../game/gamepad';
import { defaultPadMap, describeBinding, detectPress, PAD_ACTIONS, sameBinding, savePadMap, type Binding, type PadAction, type PadMap } from '../game/padMap';
import { menuInput } from './menuInput';

/** What each step asks for, in the player's words. */
const PROMPTS: Record<PadAction, { name: string; note: string }> = {
  pass: { name: 'Pass', note: 'Also the faceoff draw, and "select" in the menus.' },
  check: { name: 'Check', note: 'Also "back" in the menus.' },
  shoot: { name: 'Shoot', note: 'Hold to wind up, let go to shoot.' },
  switchPlayer: { name: 'Switch player', note: 'With the puck, the same button is the deke.' },
  sprint: { name: 'Sprint', note: 'Usually the right trigger.' },
  lineChange: { name: 'Line change', note: 'Usually the left bumper.' },
  powerupA: { name: 'Powerup 1', note: 'Usually the left trigger.' },
  powerupB: { name: 'Powerup 2', note: 'Usually the right bumper.' },
  menu: { name: 'Pause', note: 'Usually the Menu or Start button.' },
  pullGoalie: { name: 'Pull the goalie', note: 'Usually the View or Select button.' },
  dpadUp: { name: 'Menu up', note: 'Up on the d-pad.' },
  dpadDown: { name: 'Menu down', note: 'Down on the d-pad.' },
  dpadLeft: { name: 'Menu left', note: 'Left on the d-pad.' },
  dpadRight: { name: 'Menu right', note: 'Right on the d-pad.' },
};

/**
 * Sets up the controller by asking for each action in turn: "press the button you want for Shoot". It reads
 * the controller itself and takes no menu input while it runs, because the layout it is fixing may be the
 * reason the menus cannot be worked. The buttons on screen can be tapped or clicked.
 */
export function PadSetup({ onDone }: { onDone: (message: string) => void }) {
  const [step, setStep] = useState(0);
  const [note, setNote] = useState('');
  const [seen, setSeen] = useState(false);
  const chosen = useRef<Partial<PadMap>>({});
  const baseline = useRef<GamepadSnapshot | null>(null);
  /** True while waiting for the last press to be let go, so one press is not taken for two actions. */
  const waiting = useRef(true);
  const stepRef = useRef(0);
  stepRef.current = step;

  const finish = (): void => {
    const map: PadMap = { ...defaultPadMap(), ...chosen.current };
    savePadMap(map);
    onDone('Controller set up. You can redo it any time from Settings.');
  };

  useEffect(() => {
    menuInput.stop();
    const timer = setInterval(() => {
      const pad = readGamepad();
      setSeen(pad !== null);
      if (!pad) return;
      if (!baseline.current) baseline.current = pad;
      const press = detectPress(baseline.current, pad);
      if (waiting.current) {
        // Everything let go: this is the resting state the next press is measured against.
        if (press === null) {
          waiting.current = false;
          baseline.current = pad;
        }
        return;
      }
      if (press === null) return;
      const action = PAD_ACTIONS[stepRef.current] as PadAction;
      const taken = (Object.entries(chosen.current) as [PadAction, Binding][]).find(([, b]) => sameBinding(b, press));
      waiting.current = true;
      if (taken) {
        setNote(`That one is already ${PROMPTS[taken[0]].name}. Press a different button.`);
        return;
      }
      chosen.current[action] = press;
      setNote(`${PROMPTS[action].name}: ${describeBinding(press)}.`);
      if (stepRef.current + 1 >= PAD_ACTIONS.length) finish();
      else setStep(stepRef.current + 1);
    }, 40);
    return () => {
      clearInterval(timer);
      menuInput.start();
    };
  }, []);

  const action = PAD_ACTIONS[step] as PadAction;
  return (
    <div class="menu pad-setup">
      <div class="menu-top">
        <div class="menu-title">
          <h1>Set up controller</h1>
        </div>
        <span class="pad-step">
          {step + 1} of {PAD_ACTIONS.length}
        </span>
      </div>
      <div class="pad-ask">
        <i>Press the button you want for</i>
        <b>{PROMPTS[action].name}</b>
        <span>{PROMPTS[action].note}</span>
        {!seen && <span class="warn">No controller seen yet. Press any button on it to wake it.</span>}
        {note && <span class="pad-note">{note}</span>}
      </div>
      <div class="pad-buttons">
        <button
          type="button"
          onClick={() => {
            setNote(`${PROMPTS[action].name} left as it was.`);
            waiting.current = true;
            if (step + 1 >= PAD_ACTIONS.length) finish();
            else setStep(step + 1);
          }}
        >
          Skip this one
        </button>
        <button
          type="button"
          onClick={() => {
            chosen.current = {};
            waiting.current = true;
            setNote('');
            setStep(0);
          }}
        >
          Start again
        </button>
        <button
          type="button"
          onClick={() => {
            savePadMap(null);
            onDone('Controller back to the standard layout.');
          }}
        >
          Use the standard layout
        </button>
        <button type="button" onClick={() => onDone('')}>
          Cancel
        </button>
      </div>
      <div class="menu-help">Tap or click the buttons above. The controller only answers the question while this screen is open.</div>
    </div>
  );
}
