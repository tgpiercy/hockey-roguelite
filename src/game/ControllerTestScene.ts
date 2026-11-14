import * as Phaser from 'phaser';
import tuning from '../data/controllerTest.json';
import { applyDeadzone } from '../sim/stick';
import { readGamepad, type GamepadSnapshot } from './gamepad';

const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** Phase 0 test page: a square on a rink that follows the left stick. */
export class ControllerTestScene extends Phaser.Scene {
  private square!: Phaser.GameObjects.Rectangle;

  constructor(private readonly onSnapshot: (snapshot: GamepadSnapshot | null) => void) {
    super('controller-test');
  }

  create(): void {
    const { world, rink, colours, square } = tuning;
    const g = this.add.graphics();
    const w = world.width - rink.margin * 2;
    const h = world.height - rink.margin * 2;

    g.fillStyle(colour(colours.ice));
    g.fillRoundedRect(rink.margin, rink.margin, w, h, rink.cornerRadius);
    g.lineStyle(rink.lineWidth, colour(colours.centreLine));
    g.lineBetween(world.width / 2, rink.margin, world.width / 2, world.height - rink.margin);
    g.lineStyle(rink.lineWidth, colour(colours.boards));
    g.strokeRoundedRect(rink.margin, rink.margin, w, h, rink.cornerRadius);

    this.square = this.add.rectangle(
      world.width / 2,
      world.height / 2,
      square.size,
      square.size,
      colour(colours.square),
    );
  }

  override update(_time: number, deltaMs: number): void {
    const snapshot = readGamepad();
    this.onSnapshot(snapshot);
    if (!snapshot) return;

    const { world, rink, square, stick } = tuning;
    const move = applyDeadzone(snapshot.axes[0] ?? 0, snapshot.axes[1] ?? 0, stick.deadzone);
    const step = square.speed * (deltaMs / 1000);
    const pad = rink.margin + square.size / 2;

    this.square.x = Phaser.Math.Clamp(this.square.x + move.x * step, pad, world.width - pad);
    this.square.y = Phaser.Math.Clamp(this.square.y + move.y * step, pad, world.height - pad);
  }
}
