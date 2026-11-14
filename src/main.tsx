import * as Phaser from 'phaser';
import { render } from 'preact';
import testTuning from './data/controllerTest.json';
import { ControllerTestScene } from './game/ControllerTestScene';
import type { GamepadSnapshot } from './game/gamepad';
import { gameAudio } from './game/audio';
import { App } from './ui/App';
import { ArtSheet } from './ui/ArtSheet';
import { ControllerReadout } from './ui/ControllerReadout';
import './style.css';

/** The Phase 0 page: open with ?controller to check the controller mapping. */
function startControllerTest(): void {
  const panel = document.getElementById('panel') as HTMLElement;
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

// Browsers only allow sound once the player has pressed or tapped something: any such press wakes it.
for (const type of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(type, () => gameAudio.unlock(), { passive: true });

const query = new URLSearchParams(location.search);
if (query.has('controller')) startControllerTest();
else if (query.has('sheet')) {
  // Every piece of drawn art on one page, for checking it together.
  document.body.className = 'mode-menu mode-sheet';
  render(<ArtSheet />, document.getElementById('menu') as HTMLElement);
} else render(<App />, document.getElementById('menu') as HTMLElement);
