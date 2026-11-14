import * as Phaser from 'phaser';
import { render } from 'preact';
import testTuning from './data/controllerTest.json';
import { ControllerTestScene } from './game/ControllerTestScene';
import type { GamepadSnapshot } from './game/gamepad';
import { App } from './ui/App';
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

if (new URLSearchParams(location.search).has('controller')) startControllerTest();
else render(<App />, document.getElementById('menu') as HTMLElement);
