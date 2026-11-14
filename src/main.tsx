import * as Phaser from 'phaser';
import { render } from 'preact';
import tuning from './data/controllerTest.json';
import { ControllerTestScene } from './game/ControllerTestScene';
import type { GamepadSnapshot } from './game/gamepad';
import { ControllerReadout } from './ui/ControllerReadout';
import './style.css';

const panel = document.getElementById('panel') as HTMLElement;

const show = (snapshot: GamepadSnapshot | null): void => {
  render(<ControllerReadout snapshot={snapshot} />, panel);
};
show(null);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: tuning.world.width,
  height: tuning.world.height,
  backgroundColor: tuning.colours.background,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: new ControllerTestScene(show),
});
