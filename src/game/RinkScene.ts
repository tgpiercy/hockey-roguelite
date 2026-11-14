import * as Phaser from 'phaser';
import look from '../data/rinkLook.json';
import { benchDoor, lineEnergy } from '../sim/lines';
import { gameResult, type GameResult } from '../sim/match';
import { carrySpot } from '../sim/puck';
import { goalLineX, nets } from '../sim/rink';
import { chargeFraction } from '../sim/shot';
import type { Tuning } from '../sim/tuning';
import type { Player, World } from '../sim/types';
import { createGame, step, STEP_SECONDS, type TeamSetup } from '../sim/world';
import { InputReader, type Controls } from './input';

const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);
const c = look.colours;

/** Longest stretch of real time caught up in one frame, so a stalled tab does not fast-forward. */
const MAX_CATCH_UP_SECONDS = 0.25;

export interface RinkSceneOptions {
  /** The seed for this game. A game replays exactly from its seed. */
  seed: string;
  /** The two dressed teams: the human's first. */
  teams: [TeamSetup, TeamSetup];
  /** What to call each team on the scoreboard. */
  names: [string, string];
  /** The live tuning values; read every step, so the tuning panel takes effect at once. */
  tuning: () => Tuning;
  /** Called once per frame with the controls, for the menus. */
  onControls: (controls: Controls) => void;
  /** Called with the result when the game ends, to show the summary. */
  onResult: (result: GameResult) => void;
  /** Called when the player presses A on the summary: the game is over and can be torn down. */
  onDone: (result: GameResult) => void;
}

const clockText = (seconds: number): string => {
  const whole = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * A full game, 3 skaters and a goalie a side, drawn with placeholder shapes.
 * The human plays team 0, in dark blue, attacking right.
 */
export class RinkScene extends Phaser.Scene {
  private world!: World;
  private reader!: InputReader;
  private g!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private barLabels: Phaser.GameObjects.Text[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private showDebug = false;
  private leftover = 0;
  private reported = false;
  private done = false;
  private passWasDown = false;

  // World-to-screen transform, recalculated every frame so resizing just works.
  private zoom = 1;
  private originX = 0;
  private originY = 0;

  constructor(private readonly options: RinkSceneOptions) {
    super('rink');
  }

  create(): void {
    this.reader = new InputReader();
    this.g = this.add.graphics();
    const font = 'system-ui, sans-serif';
    this.scoreText = this.add.text(0, 0, '', { fontFamily: font, fontStyle: 'bold', color: c.boards }).setOrigin(0.5, 0);
    this.barLabels = [0, 1, 2].map(() =>
      this.add.text(0, 0, '', { fontFamily: font, fontStyle: 'bold', color: c.text }).setOrigin(0, 0.5).setStroke(c.boards, 3),
    );
    this.bigText = this.add
      .text(0, 0, '', { fontFamily: font, fontStyle: 'bold', color: c.redLine })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.world = createGame(this.options.tuning(), this.options.seed, { teams: this.options.teams });
    this.events.once('destroy', () => this.reader.dispose());
    this.labels = this.world.players.map(() =>
      this.add.text(0, 0, '', { fontFamily: font, color: c.debugText }).setOrigin(0.5, 1).setVisible(false),
    );
  }

  override update(time: number, deltaMs: number): void {
    const controls = this.reader.read(time);
    this.options.onControls(controls);
    if (controls.debugPressed) this.showDebug = !this.showDebug;
    const passPressed = controls.frame.pass && !this.passWasDown;
    this.passWasDown = controls.frame.pass;

    const t = this.options.tuning();
    if (this.world.phase === 'final') {
      if (!this.reported) {
        this.reported = true;
        this.options.onResult(gameResult(this.world));
      } else if (passPressed && !this.done) {
        this.done = true;
        this.options.onDone(gameResult(this.world));
        return;
      }
    } else {
      this.leftover += Math.min(deltaMs / 1000, MAX_CATCH_UP_SECONDS);
      while (this.leftover >= STEP_SECONDS) {
        step(this.world, controls.frame, t);
        this.leftover -= STEP_SECONDS;
      }
    }
    this.draw(t);
  }

  private sx(x: number): number {
    return this.originX + x * this.zoom;
  }

  private sy(y: number): number {
    return this.originY + y * this.zoom;
  }

  private playerColour(p: Player): number {
    if (p.team === 0) return colour(p.role === 'goalie' ? c.teamHomeGoalie : c.teamHome);
    return colour(p.role === 'goalie' ? c.teamAwayGoalie : c.teamAway);
  }

  /** The big message in the middle of the ice, if any. */
  private message(): string {
    const world = this.world;
    if (world.phase === 'goal') return 'GOAL!';
    if (world.phase === 'faceoff') return world.faceoff?.dropped ? 'DROP!' : 'Ready…';
    if (world.phase === 'break') return world.overtime ? 'Overtime' : `End of period ${world.period}`;
    return '';
  }

  private draw(t: Tuning): void {
    const g = this.g;
    const world = this.world;
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

    // Bench doors: a gap in the top boards in each team's colour.
    for (const team of [0, 1] as const) {
      const door = benchDoor(team, t);
      g.lineStyle(Math.max(3, look.boardWidth * z * 1.6), colour(team === 0 ? c.teamHome : c.teamAway));
      g.lineBetween(this.sx(door.x - t.bench.doorRadius), this.sy(-hy), this.sx(door.x + t.bench.doorRadius), this.sy(-hy));
    }

    // Nets
    for (const net of nets(t)) {
      g.lineStyle(line, colour(c.net));
      for (const [a, b] of net.netting) g.lineBetween(this.sx(a.x), this.sy(a.y), this.sx(b.x), this.sy(b.y));
      g.fillStyle(colour(c.post));
      for (const post of net.posts) g.fillCircle(this.sx(post.x), this.sy(post.y), Math.max(2, t.net.postRadius * z));
    }

    // Players on the ice
    const controlled = world.human ? world.players[world.human.controlled] : undefined;
    world.players.forEach((p, i) => {
      const label = this.labels[i];
      if (!p.onIce) {
        label?.setVisible(false);
        return;
      }
      const x = this.sx(p.pos.x);
      const y = this.sy(p.pos.y);
      const radius = (p.role === 'goalie' ? Math.max(t.goalie.bodyRadius, p.goalie!.fx.coverRadius) : t.skater.radius) * z;

      if (p === controlled) {
        g.lineStyle(Math.max(2, line * 1.5), colour(c.controlRing));
        g.strokeCircle(x, y, radius * look.controlRingScale);
      }
      if (p.role === 'skater') {
        const blade = carrySpot(p, t);
        g.lineStyle(Math.max(2, line * 1.5), colour(c.stick));
        g.lineBetween(x, y, this.sx(blade.x), this.sy(blade.y));
      }
      // A staggered skater, or one heading to the bench, is drawn faded.
      g.fillStyle(this.playerColour(p), p.stagger > 0 || p.leaving ? 0.45 : 1);
      g.fillCircle(x, y, radius);
      g.lineStyle(line, colour(c.ice));
      g.lineBetween(x, y, x + Math.cos(p.facing) * radius, y + Math.sin(p.facing) * radius);

      if (label) {
        const isAi = p.role === 'skater' && p !== controlled;
        label.setVisible(this.showDebug && isAi);
        if (this.showDebug && isAi) {
          label.setFontSize(Math.max(9, z * 0.9));
          label.setPosition(x, y - radius * 1.3);
          label.setText(p.leaving ? 'bench' : p.ai.state);
        }
      }
    });

    // Puck: a ring while it is held for a faceoff, larger while it is in the air.
    const puck = world.puck;
    const puckRadius = Math.max(2, t.puck.radius * z);
    if (world.phase === 'faceoff' && !world.faceoff?.dropped) {
      g.lineStyle(Math.max(2, line), colour(c.puck));
      g.strokeCircle(this.sx(puck.pos.x), this.sy(puck.pos.y), puckRadius * 2.5);
    } else {
      g.fillStyle(colour(c.puck));
      g.fillCircle(this.sx(puck.pos.x), this.sy(puck.pos.y), puckRadius * (puck.air > 0 ? 1.6 : 1));
    }

    if (controlled) {
      // Shot or pass wind-up, above the controlled skater.
      const held = Math.max(controlled.charge, controlled.passCharge);
      if (held > 0) {
        const fill =
          controlled.charge > 0 ? chargeFraction(controlled.charge, t) : Math.min(1, controlled.passCharge / t.pass.saucerHoldTime);
        const w = t.skater.radius * 3 * z;
        const h = Math.max(3, 0.25 * z);
        const x = this.sx(controlled.pos.x) - w / 2;
        const y = this.sy(controlled.pos.y - t.skater.radius * 2.4);
        g.fillStyle(colour(c.barBack));
        g.fillRect(x, y, w, h);
        g.fillStyle(colour(c.charge));
        g.fillRect(x, y, w * fill, h);
      }

      // Bottom left: sprint bar of the controlled skater, then the energy of each line (the one on the ice is ringed).
      const barH = Math.max(6, height * 0.02);
      const barY = height - look.marginPixels * 2 - barH;
      const fontSize = Math.max(9, height * 0.028);
      const bars: { label: string; width: number; fill: number; colour: string; ringed: boolean }[] = [
        {
          label: 'Sprint',
          width: Math.min(width * 0.16, 150),
          fill: controlled.stamina,
          colour: controlled.sprintLocked ? c.staminaLocked : c.stamina,
          ringed: false,
        },
        ...([0, 1] as const).map((which) => {
          const energy = lineEnergy(world, controlled.team, which);
          return {
            label: `Line ${which + 1}`,
            width: Math.min(width * 0.09, 80),
            fill: energy,
            colour: energy < t.energy.changeBelow ? c.charge : c.stamina,
            ringed: world.teams[controlled.team].line === which,
          };
        }),
      ];
      let x = look.marginPixels * 2;
      bars.forEach((bar, i) => {
        const label = this.barLabels[i];
        if (label) {
          label.setFontSize(fontSize);
          label.setText(bar.label);
          label.setPosition(x, barY + barH / 2);
          x += label.width + barH * 0.6;
        }
        g.fillStyle(colour(c.barBack));
        g.fillRect(x, barY, bar.width, barH);
        g.fillStyle(colour(bar.colour));
        g.fillRect(x, barY, bar.width * bar.fill, barH);
        if (bar.ringed) {
          g.lineStyle(2, colour(c.controlRing));
          g.strokeRect(x - 2, barY - 2, bar.width + 4, barH + 4);
        }
        x += bar.width + barH * 2;
      });
    }

    // Text
    const period = world.overtime && world.period > t.period.count ? 'OT' : `P${Math.min(world.period, t.period.count)}`;
    this.scoreText.setFontSize(Math.max(12, height * 0.045));
    this.scoreText.setPosition(width / 2, this.sy(-hy) + look.marginPixels);
    const [home, away] = this.options.names;
    this.scoreText.setText(`${home} ${world.score[0]} – ${world.score[1]} ${away}     ${period} ${clockText(world.clock)}`);

    const message = this.message();
    this.bigText.setVisible(message !== '');
    if (message !== '') {
      this.bigText.setFontSize(Math.max(18, height * (world.phase === 'goal' ? 0.18 : 0.08)));
      this.bigText.setPosition(width / 2, height * 0.23);
      this.bigText.setText(message);
    }
  }
}
