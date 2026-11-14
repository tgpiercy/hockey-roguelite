import * as Phaser from 'phaser';
import { render } from 'preact';
import testTuning from './data/controllerTest.json';
import look from './data/rinkLook.json';
import { ControllerTestScene } from './game/ControllerTestScene';
import type { GamepadSnapshot } from './game/gamepad';
import type { Controls } from './game/input';
import { RinkScene } from './game/RinkScene';
import { ControllerReadout } from './ui/ControllerReadout';
import { TuningPanel } from './ui/TuningPanel';
import { tuningStore } from './ui/tuningStore';
import './style.css';

const panel = document.getElementById('panel') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const tuneButton = document.getElementById('tune') as HTMLElement;

/** The Phase 0 page: open with ?controller to check the controller mapping. */
function startControllerTest(): void {
  document.body.className = 'mode-test';
  const show = (snapshot: GamepadSnapshot | null): void => {
    render(<ControllerReadout snapshot={snapshot} />, panel);
  };
  show(null);

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: testTuning.world.width,
    height: testTuning.world.height,
    backgroundColor: testTuning.colours.background,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new ControllerTestScene(show),
  });
}

function startRink(): void {
  document.body.className = 'mode-rink';

  const showPanel = (): void => {
    document.body.classList.toggle('panel-open', tuningStore.open);
    render(<TuningPanel />, panel);
  };
  tuningStore.subscribe(showPanel);
  showPanel();
  tuneButton.addEventListener('click', () => tuningStore.toggle());

  const onControls = (controls: Controls): void => {
    hint.hidden = controls.hasPad || controls.hasKeyboard;
    if (controls.menuPressed) tuningStore.toggle();
    if (!tuningStore.open) return;
    if (controls.navY !== 0) tuningStore.select(tuningStore.selected + controls.navY);
    if (controls.navX !== 0) tuningStore.adjust(tuningStore.selected, controls.navX);
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: look.colours.background,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: new RinkScene({
      // The seed only varies shot scatter between sessions; a game replays exactly from its seed.
      seed: String(Date.now()),
      tuning: () => tuningStore.tuning,
      onControls,
    }),
  });
  // Local development only: lets a debugging session drive frames by hand.
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}

if (new URLSearchParams(location.search).has('controller')) startControllerTest();
else startRink();
