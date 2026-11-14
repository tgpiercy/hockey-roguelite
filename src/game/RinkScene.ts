import * as Phaser from 'phaser';
import look from '../data/rinkLook.json';
import { carrySpot } from '../sim/puck';
import { goalLineX, nets } from '../sim/rink';
import { chargeFraction } from '../sim/shot';
import type { Tuning } from '../sim/tuning';
import type { World } from '../sim/types';
import { createWorld, step, STEP_SECONDS } from '../sim/world';
import { InputReader, type Controls } from './input';

const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);
const c = look.colours;

/** Longest stretch of real time caught up in one frame, so a stalled tab does not fast-forward. */
const MAX_CATCH_UP_SECONDS = 0.25;

export interface RinkSceneOptions {
  seed: string;
  /** The live tuning values; read every step, so the tuning panel takes effect at once. */
  tuning: () => Tuning;
  /** Called once per frame with the controls, for the menus. */
  onControls: (controls: Controls) => void;
}

/** Phase 1: one skater, a puck and two empty nets, drawn with placeholder shapes. */
export class RinkScene extends Phaser.Scene {
  private world!: World;
  private input2!: InputReader;
  private g!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private leftover = 0;

  // World-to-screen transform, recalculated every frame so resizing just works.
  private zoom = 1;
  private originX = 0;
  private originY = 0;

  constructor(private readonly options: RinkSceneOptions) {
    super('rink');
  }

  create(): void {
    this.world = createWorld(this.options.tuning(), this.options.seed);
    this.input2 = new InputReader();
    this.g = this.add.graphics();
    this.scoreText = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: c.boards }).setOrigin(0.5, 0);
    this.goalText = this.add
      .text(0, 0, 'GOAL!', { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: c.redLine })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
  }

  override update(time: number, deltaMs: number): void {
    const controls = this.input2.read(time);
    this.options.onControls(controls);

    const t = this.options.tuning();
    this.leftover += Math.min(deltaMs / 1000, MAX_CATCH_UP_SECONDS);
    while (this.leftover >= STEP_SECONDS) {
      step(this.world, controls.frame, t);
      this.leftover -= STEP_SECONDS;
    }
    this.draw(t);
  }

  private sx(x: number): number {
    return this.originX + x * this.zoom;
  }

  private sy(y: number): number {
    return this.originY + y * this.zoom;
  }

  private draw(t: Tuning): void {
    const g = this.g;
    const { width, height } = this.scale;
    const z = Math.min(
      (width - look.marginPixels * 2) / t.rink.length,
      (height - look.marginPixels * 2) / t.rink.width,
    );
    this.zoom = z;
    this.originX = width / 2;
    this.originY = height / 2;

    const hx = t.rink.length / 2;
    const hy = t.rink.width / 2;
    const corner = Math.min(t.rink.cornerRadius, hx, hy) * z;
    const line = Math.max(1, look.lineWidth * z);
    const gx = goalLineX(t);

    g.clear();

    // Ice
    g.fillStyle(colour(c.ice));
    g.fillRoundedRect(this.sx(-hx), this.sy(-hy), t.rink.length * z, t.rink.width * z, corner);

    // Creases
    g.fillStyle(colour(c.crease));
    g.slice(this.sx(-gx), this.sy(0), look.creaseRadius * z, -Math.PI / 2, Math.PI / 2, false);
    g.fillPath();
    g.slice(this.sx(gx), this.sy(0), look.creaseRadius * z, Math.PI / 2, -Math.PI / 2, false);
    g.fillPath();

    // Lines. Goal lines are shortened where the rounded corners cut in.
    const inset = Math.max(0, t.rink.cornerRadius - t.rink.goalLineFromEnd);
    const cut = t.rink.cornerRadius - Math.sqrt(Math.max(0, t.rink.cornerRadius ** 2 - inset ** 2));
    g.lineStyle(line, colour(c.redLine));
    g.lineBetween(this.sx(0), this.sy(-hy), this.sx(0), this.sy(hy));
    g.lineBetween(this.sx(-gx), this.sy(-hy + cut), this.sx(-gx), this.sy(hy - cut));
    g.lineBetween(this.sx(gx), this.sy(-hy + cut), this.sx(gx), this.sy(hy - cut));
    g.lineStyle(line * 2, colour(c.blueLine));
    const blue = t.rink.length * look.blueLineFraction;
    g.lineBetween(this.sx(-blue), this.sy(-hy), this.sx(-blue), this.sy(hy));
    g.lineBetween(this.sx(blue), this.sy(-hy), this.sx(blue), this.sy(hy));

    // Boards
    g.lineStyle(Math.max(2, look.boardWidth * z), colour(c.boards));
    g.strokeRoundedRect(this.sx(-hx), this.sy(-hy), t.rink.length * z, t.rink.width * z, corner);

    // Nets
    for (const net of nets(t)) {
      g.lineStyle(line, colour(c.net));
      for (const [a, b] of net.netting) g.lineBetween(this.sx(a.x), this.sy(a.y), this.sx(b.x), this.sy(b.y));
      g.fillStyle(colour(c.post));
      for (const post of net.posts) g.fillCircle(this.sx(post.x), this.sy(post.y), Math.max(2, t.net.postRadius * z));
    }

    // Skater: a circle, with a stick reaching to where the puck is carried.
    const s = this.world.skater;
    const blade = carrySpot(s, t);
    g.lineStyle(Math.max(2, line * 1.5), colour(c.stick));
    g.lineBetween(this.sx(s.pos.x), this.sy(s.pos.y), this.sx(blade.x), this.sy(blade.y));
    g.fillStyle(colour(s.sprinting ? c.skaterSprint : c.skater));
    g.fillCircle(this.sx(s.pos.x), this.sy(s.pos.y), t.skater.radius * z);
    g.lineStyle(line, colour(c.ice));
    g.lineBetween(
      this.sx(s.pos.x),
      this.sy(s.pos.y),
      this.sx(s.pos.x + Math.cos(s.facing) * t.skater.radius),
      this.sy(s.pos.y + Math.sin(s.facing) * t.skater.radius),
    );

    // Puck
    const p = this.world.puck;
    g.fillStyle(colour(c.puck));
    g.fillCircle(this.sx(p.pos.x), this.sy(p.pos.y), Math.max(2, t.puck.radius * z));

    // Shot charge, above the skater while winding up.
    const charge = chargeFraction(s.charge, t);
    if (s.charge > 0) {
      const w = t.skater.radius * 3 * z;
      const h = Math.max(3, 0.25 * z);
      const x = this.sx(s.pos.x) - w / 2;
      const y = this.sy(s.pos.y - t.skater.radius * 2);
      g.fillStyle(colour(c.barBack));
      g.fillRect(x, y, w, h);
      g.fillStyle(colour(c.charge));
      g.fillRect(x, y, w * charge, h);
    }

    // Stamina, bottom left.
    const barW = Math.min(width * 0.25, 220);
    const barH = Math.max(6, height * 0.02);
    const barX = look.marginPixels * 2;
    const barY = height - look.marginPixels * 2 - barH;
    g.fillStyle(colour(c.barBack));
    g.fillRect(barX, barY, barW, barH);
    g.fillStyle(colour(s.sprintLocked ? c.staminaLocked : c.stamina));
    g.fillRect(barX, barY, barW * s.stamina, barH);

    // Text
    this.scoreText.setFontSize(Math.max(12, height * 0.045));
    this.scoreText.setPosition(width / 2, this.sy(-hy) + look.marginPixels);
    this.scoreText.setText(`Goals ${this.world.goals}`);
    this.goalText.setFontSize(Math.max(24, height * 0.2));
    this.goalText.setPosition(width / 2, height / 2);
    this.goalText.setVisible(this.world.phase === 'goal');
  }
}
