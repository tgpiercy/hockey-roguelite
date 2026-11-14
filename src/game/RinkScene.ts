import * as Phaser from 'phaser';
import { lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';
import { benchDoor, lineEnergy } from '../sim/lines';
import { gameResult, type GameResult } from '../sim/match';
import type { PowerupSpec } from '../sim/modifiers';
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
  /** AI level per team, 0 to 1; null takes it from the tuning. */
  levels: [number | null, number | null];
  /** The powerups loaded on the human's two buttons. */
  powerups: (PowerupSpec | null)[];
  /** Each team's jersey colour, as "#rrggbb". Left out, the defaults are used. */
  homeColour?: string;
  awayColour?: string;
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
 * A full game, 3 skaters and a goalie a side, drawn in code: no image files.
 * The human plays team 0, attacking right. Everything about the look is in src/data/rinkLook.json.
 */
export class RinkScene extends Phaser.Scene {
  private world!: World;
  private reader!: InputReader;
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private scoreTexts: Phaser.GameObjects.Text[] = [];
  private clockTextObject!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private barLabels: Phaser.GameObjects.Text[] = [];
  private powerText!: Phaser.GameObjects.Text;
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
    this.hud = this.add.graphics();
    const heading = { fontFamily: look.font, fontStyle: 'bold' };
    this.nameTexts = [0, 1].map(() => this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0.5));
    this.scoreTexts = [0, 1].map(() => this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0.5));
    this.clockTextObject = this.add.text(0, 0, '', { ...heading, color: c.accent }).setOrigin(0.5, 0.5);
    this.barLabels = [0, 1, 2].map(() => this.add.text(0, 0, '', { ...heading, color: c.dim }).setOrigin(0, 0.5));
    this.bigText = this.add
      .text(0, 0, '', { ...heading, color: c.text })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.world = createGame(this.options.tuning(), this.options.seed, {
      teams: this.options.teams,
      levels: this.options.levels,
      powerups: this.options.powerups,
    });
    this.powerText = this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(1, 0.5);
    this.events.once('destroy', () => this.reader.dispose());
    this.labels = this.world.players.map(() =>
      this.add.text(0, 0, '', { fontFamily: look.font, color: c.debugText }).setOrigin(0.5, 1).setVisible(false),
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

  /** Each team's jersey colour: the ones chosen in the menus, or the defaults. */
  private teamColour(team: 0 | 1): string {
    return team === 0 ? (this.options.homeColour ?? c.teamHome) : (this.options.awayColour ?? c.teamAway);
  }

  /** The big message in the middle of the ice, if any. */
  private message(): string {
    const world = this.world;
    if (world.phase === 'goal') return 'GOAL!';
    if (world.phase === 'faceoff') return world.faceoff?.dropped ? 'DROP!' : 'READY';
    if (world.phase === 'break') return world.overtime ? 'OVERTIME' : `END OF PERIOD ${world.period}`;
    return '';
  }

  private draw(t: Tuning): void {
    const { width, height } = this.scale;
    // The rink fills the screen below a strip kept for the scoreboard.
    const top = look.topBarPixels;
    const z = Math.min((width - look.marginPixels * 2) / t.rink.length, (height - top - look.marginPixels * 2) / t.rink.width);
    this.zoom = z;
    this.originX = width / 2;
    this.originY = top + (height - top) / 2;

    this.g.clear();
    this.hud.clear();
    this.drawRink(t);
    this.drawPlayers(t);
    this.drawPuck(t);
    this.drawHud(t, width, height);
  }

  /** The ice, its markings, the boards, the bench doors and the nets. */
  private drawRink(t: Tuning): void {
    const g = this.g;
    const z = this.zoom;
    const hx = t.rink.length / 2;
    const hy = t.rink.width / 2;
    const corner = Math.min(t.rink.cornerRadius, hx, hy) * z;
    const line = Math.max(1, look.lineWidth * z);
    const gx = goalLineX(t);
    const blue = t.rink.length * look.blueLineFraction;
    const ring = look.circleRadius * z;
    const dot = Math.max(2, look.dotRadius * z);

    // Ice, with the neutral zone a shade darker so the zones read at a glance.
    g.fillStyle(colour(c.ice));
    g.fillRoundedRect(this.sx(-hx), this.sy(-hy), t.rink.length * z, t.rink.width * z, corner);
    g.fillStyle(colour(c.iceZone));
    g.fillRect(this.sx(-blue), this.sy(-hy), blue * 2 * z, t.rink.width * z);

    // Creases
    g.fillStyle(colour(c.crease));
    g.slice(this.sx(-gx), this.sy(0), look.creaseRadius * z, -Math.PI / 2, Math.PI / 2, false);
    g.fillPath();
    g.slice(this.sx(gx), this.sy(0), look.creaseRadius * z, Math.PI / 2, -Math.PI / 2, false);
    g.fillPath();
    g.lineStyle(line, colour(c.redLine));
    g.beginPath();
    g.arc(this.sx(-gx), this.sy(0), look.creaseRadius * z, -Math.PI / 2, Math.PI / 2, false);
    g.strokePath();
    g.beginPath();
    g.arc(this.sx(gx), this.sy(0), look.creaseRadius * z, Math.PI / 2, -Math.PI / 2, false);
    g.strokePath();

    // Faceoff circles and dots: centre ice in blue, the four end-zone circles in red, four neutral dots.
    g.lineStyle(line, colour(c.blueLine));
    g.strokeCircle(this.sx(0), this.sy(0), ring);
    g.fillStyle(colour(c.blueLine));
    g.fillCircle(this.sx(0), this.sy(0), dot);
    const endX = gx - look.endCircleFromGoalLine;
    const sideY = look.circleFromCentreLine;
    g.lineStyle(line, colour(c.redLine));
    g.fillStyle(colour(c.redLine));
    for (const x of [-endX, endX]) {
      for (const y of [-sideY, sideY]) {
        g.strokeCircle(this.sx(x), this.sy(y), ring);
        g.fillCircle(this.sx(x), this.sy(y), dot);
      }
    }
    for (const x of [-blue + look.neutralDotFromBlueLine, blue - look.neutralDotFromBlueLine]) {
      for (const y of [-sideY, sideY]) g.fillCircle(this.sx(x), this.sy(y), dot);
    }

    // Lines. Goal lines are shortened where the rounded corners cut in.
    const inset = Math.max(0, t.rink.cornerRadius - t.rink.goalLineFromEnd);
    const cut = t.rink.cornerRadius - Math.sqrt(Math.max(0, t.rink.cornerRadius ** 2 - inset ** 2));
    g.lineStyle(line * 1.5, colour(c.redLine));
    g.lineBetween(this.sx(0), this.sy(-hy), this.sx(0), this.sy(hy));
    g.lineStyle(line, colour(c.redLine));
    g.lineBetween(this.sx(-gx), this.sy(-hy + cut), this.sx(-gx), this.sy(hy - cut));
    g.lineBetween(this.sx(gx), this.sy(-hy + cut), this.sx(gx), this.sy(hy - cut));
    g.lineStyle(line * 2.2, colour(c.blueLine));
    g.lineBetween(this.sx(-blue), this.sy(-hy), this.sx(-blue), this.sy(hy));
    g.lineBetween(this.sx(blue), this.sy(-hy), this.sx(blue), this.sy(hy));

    // Boards: a dark wall with a pale rail along its inside edge.
    const wall = Math.max(3, look.boardWidth * z);
    g.lineStyle(wall, colour(c.boards));
    g.strokeRoundedRect(this.sx(-hx) - wall / 2, this.sy(-hy) - wall / 2, t.rink.length * z + wall, t.rink.width * z + wall, corner + wall / 2);
    g.lineStyle(Math.max(1, wall * 0.25), colour(c.rail));
    g.strokeRoundedRect(this.sx(-hx), this.sy(-hy), t.rink.length * z, t.rink.width * z, corner);

    // Bench doors: a gap in the top boards in each team's colour.
    for (const team of [0, 1] as const) {
      const door = benchDoor(team, t);
      g.lineStyle(wall * 1.4, colour(this.teamColour(team)));
      g.lineBetween(this.sx(door.x - t.bench.doorRadius), this.sy(-hy) - wall / 2, this.sx(door.x + t.bench.doorRadius), this.sy(-hy) - wall / 2);
    }

    // Nets
    for (const net of nets(t)) {
      g.lineStyle(Math.max(1.5, line), colour(c.net));
      for (const [a, b] of net.netting) g.lineBetween(this.sx(a.x), this.sy(a.y), this.sx(b.x), this.sy(b.y));
      g.fillStyle(colour(c.post));
      for (const post of net.posts) g.fillCircle(this.sx(post.x), this.sy(post.y), Math.max(2, t.net.postRadius * z));
    }
  }

  /**
   * Every player on the ice, seen from above: shoulders across the way he faces, a helmet, a stick.
   * Goalies are wider, in a lighter shade of their team's colour.
   */
  private drawPlayers(t: Tuning): void {
    const g = this.g;
    const z = this.zoom;
    const world = this.world;
    const line = Math.max(1, look.lineWidth * z);
    const controlled = world.human ? world.players[world.human.controlled] : undefined;

    world.players.forEach((p, i) => {
      const label = this.labels[i];
      if (!p.onIce) {
        label?.setVisible(false);
        return;
      }
      const x = this.sx(p.pos.x);
      const y = this.sy(p.pos.y);
      const goalie = p.role === 'goalie';
      const base = (goalie ? Math.max(t.goalie.bodyRadius, p.goalie!.fx.coverRadius) : t.skater.radius) * z;
      const r = base * look.playerScale;
      // A staggered skater, or one heading to the bench, is drawn faded.
      const alpha = p.stagger > 0 || p.leaving ? 0.45 : 1;
      const team = this.teamColour(p.team);
      const jersey = colour(goalie ? lighten(team, look.goalieLighten) : team);
      const helmet = colour(lighten(team, goalie ? 0.15 : look.helmetLighten));
      const fx = Math.cos(p.facing);
      const fy = Math.sin(p.facing);
      // Across his shoulders: at right angles to the way he faces.
      const ax = -fy;
      const ay = fx;
      const spread = r * (goalie ? 0.85 : 0.55);
      const shoulder = r * (goalie ? 0.62 : 0.7);

      // Shadow on the ice.
      g.fillStyle(colour(c.shadow), 0.2 * alpha);
      g.fillCircle(x + r * 0.18, y + r * 0.28, r * 1.05);

      if (p === controlled) {
        g.lineStyle(Math.max(2, line * 1.8), colour(c.controlRing));
        g.strokeCircle(x, y, base * look.controlRingScale);
      }
      if (!goalie) {
        const blade = carrySpot(p, t);
        const bx = this.sx(blade.x);
        const by = this.sy(blade.y);
        g.lineStyle(Math.max(2, line * 1.6), colour(c.stick), alpha);
        g.lineBetween(x, y, bx, by);
        g.lineStyle(Math.max(3, line * 2.6), colour(c.stick), alpha);
        g.lineBetween(bx, by, bx + ax * r * 0.35, by + ay * r * 0.35);
      }

      // A white outline first, then the jersey on top of it.
      const edge = Math.max(1, r * 0.14);
      g.fillStyle(colour(c.outline), alpha);
      g.fillCircle(x + ax * spread, y + ay * spread, shoulder + edge);
      g.fillCircle(x - ax * spread, y - ay * spread, shoulder + edge);
      g.fillCircle(x, y, r * 0.8 + edge);
      g.fillStyle(jersey, alpha);
      g.fillCircle(x + ax * spread, y + ay * spread, shoulder);
      g.fillCircle(x - ax * spread, y - ay * spread, shoulder);
      g.fillCircle(x, y, r * 0.8);

      // Helmet, a little forward of centre, with a visor line showing which way he faces.
      const hx = x + fx * r * 0.12;
      const hy = y + fy * r * 0.12;
      g.fillStyle(helmet, alpha);
      g.fillCircle(hx, hy, r * 0.46);
      g.lineStyle(Math.max(1, r * 0.14), jersey, alpha);
      g.lineBetween(hx + fx * r * 0.3 + ax * r * 0.28, hy + fy * r * 0.3 + ay * r * 0.28, hx + fx * r * 0.3 - ax * r * 0.28, hy + fy * r * 0.3 - ay * r * 0.28);

      if (label) {
        const isAi = !goalie && p !== controlled;
        label.setVisible(this.showDebug && isAi);
        if (this.showDebug && isAi) {
          label.setFontSize(Math.max(9, z * 0.9));
          label.setPosition(x, y - r * 1.5);
          label.setText(p.leaving ? 'bench' : p.ai.state);
        }
      }
    });

    // Shot or pass wind-up, above the controlled skater.
    if (controlled) {
      const held = Math.max(controlled.charge, controlled.passCharge);
      if (held > 0) {
        const fill = controlled.charge > 0 ? chargeFraction(controlled.charge, t) : Math.min(1, controlled.passCharge / t.pass.saucerHoldTime);
        const w = t.skater.radius * 4 * z;
        const h = Math.max(4, 0.3 * z);
        const bx = this.sx(controlled.pos.x) - w / 2;
        const by = this.sy(controlled.pos.y - t.skater.radius * 3);
        g.fillStyle(colour(c.panel), 0.85);
        g.fillRoundedRect(bx - 1, by - 1, w + 2, h + 2, (h + 2) / 2);
        g.fillStyle(colour(c.charge));
        g.fillRoundedRect(bx, by, Math.max(h, w * fill), h, h / 2);
      }
    }
  }

  /** The puck with a shadow; a ring while it is held for a faceoff, larger while it is in the air. */
  private drawPuck(t: Tuning): void {
    const g = this.g;
    const z = this.zoom;
    const world = this.world;
    const puck = world.puck;
    const x = this.sx(puck.pos.x);
    const y = this.sy(puck.pos.y);
    const radius = Math.max(2.5, t.puck.radius * z * 1.25);
    if (world.phase === 'faceoff' && !world.faceoff?.dropped) {
      g.lineStyle(Math.max(2, look.lineWidth * z), colour(c.puck));
      g.strokeCircle(x, y, radius * 2.5);
      return;
    }
    const lift = puck.air > 0 ? radius * 1.2 : radius * 0.35;
    g.fillStyle(colour(c.shadow), 0.3);
    g.fillCircle(x + lift * 0.6, y + lift, radius * (puck.air > 0 ? 1.3 : 1));
    g.fillStyle(colour(c.puck));
    g.fillCircle(x, y, radius * (puck.air > 0 ? 1.5 : 1));
  }

  /** The scoreboard, the bars at the bottom, the powerups, and any banner across the ice. */
  private drawHud(t: Tuning, width: number, height: number): void {
    const g = this.hud;
    const world = this.world;
    const controlled = world.human ? world.players[world.human.controlled] : undefined;

    // Scoreboard: each team's name on its colour, the two scores, and the period and clock between them.
    const boardH = look.topBarPixels - 6;
    const boardW = Math.min(width * look.scoreboardWidthShare, look.scoreboardMaxWidth);
    const left = width / 2 - boardW / 2;
    const y0 = 3;
    const nameW = boardW * 0.31;
    const scoreW = boardW * 0.095;
    const midW = boardW - nameW * 2 - scoreW * 2;
    g.fillStyle(colour(c.panel));
    g.fillRoundedRect(left, y0, boardW, boardH, 6);
    g.fillStyle(colour(this.teamColour(0)));
    g.fillRoundedRect(left, y0, nameW, boardH, { tl: 6, bl: 6, tr: 0, br: 0 });
    g.fillStyle(colour(this.teamColour(1)));
    g.fillRoundedRect(left + boardW - nameW, y0, nameW, boardH, { tl: 0, bl: 0, tr: 6, br: 6 });
    g.lineStyle(1, colour(c.panelLine));
    g.strokeRoundedRect(left, y0, boardW, boardH, 6);

    const midY = y0 + boardH / 2;
    const nameSize = Math.max(10, boardH * 0.5);
    const names = this.options.names;
    const xs = [left + nameW / 2, left + boardW - nameW / 2];
    const scoreXs = [left + nameW + scoreW / 2, left + boardW - nameW - scoreW / 2];
    for (const team of [0, 1] as const) {
      const name = this.nameTexts[team];
      const score = this.scoreTexts[team];
      if (name) {
        name.setFontSize(nameSize);
        name.setText(names[team].toUpperCase());
        // A long name is squeezed to fit its block.
        name.setScale(Math.min(1, (nameW - 10) / Math.max(1, name.width / name.scaleX)), 1);
        name.setPosition(xs[team] as number, midY);
      }
      if (score) {
        score.setFontSize(Math.max(12, boardH * 0.72));
        score.setText(String(world.score[team]));
        score.setPosition(scoreXs[team] as number, midY);
      }
    }
    const period = world.overtime && world.period > t.period.count ? 'OT' : `P${Math.min(world.period, t.period.count)}`;
    this.clockTextObject.setFontSize(Math.max(11, boardH * 0.58));
    this.clockTextObject.setText(`${period}  ${clockText(world.clock)}`);
    this.clockTextObject.setPosition(left + nameW + scoreW + midW / 2, midY);

    // Bottom left: sprint bar of the controlled skater, then the energy of each line (the one on the ice is ringed).
    const barH = Math.max(7, height * 0.022);
    const barY = height - look.marginPixels - barH - 4;
    const fontSize = Math.max(9, height * 0.03);
    if (controlled) {
      const bars: { label: string; width: number; fill: number; colour: string; ringed: boolean }[] = [
        {
          label: 'SPRINT',
          width: Math.min(width * 0.15, 140),
          fill: controlled.stamina,
          colour: controlled.sprintLocked ? c.staminaLocked : c.stamina,
          ringed: false,
        },
        ...([0, 1] as const).map((which) => {
          const energy = lineEnergy(world, controlled.team, which);
          return {
            label: `LINE ${which + 1}`,
            width: Math.min(width * 0.085, 76),
            fill: energy,
            colour: energy < t.energy.changeBelow ? c.charge : c.stamina,
            ringed: world.teams[controlled.team].line === which,
          };
        }),
      ];
      let x = look.marginPixels + 8;
      const startX = x - 6;
      const measured = bars.map((bar, i) => {
        const label = this.barLabels[i];
        if (label) {
          label.setFontSize(fontSize);
          label.setText(bar.label);
        }
        return (label?.width ?? 0) + barH * 0.6 + bar.width + barH * 1.6;
      });
      const total = measured.reduce((sum, w) => sum + w, 0);
      g.fillStyle(colour(c.panel), 0.82);
      g.fillRoundedRect(startX, barY - 6, total + 4, barH + 12, (barH + 12) / 2);
      bars.forEach((bar, i) => {
        const label = this.barLabels[i];
        if (label) {
          label.setColor(bar.ringed ? c.text : c.dim);
          label.setPosition(x, barY + barH / 2);
          x += label.width + barH * 0.6;
        }
        g.fillStyle(colour(c.barBack));
        g.fillRoundedRect(x, barY, bar.width, barH, barH / 2);
        g.fillStyle(colour(bar.colour));
        g.fillRoundedRect(x, barY, Math.max(barH, bar.width * bar.fill), barH, barH / 2);
        if (bar.ringed) {
          g.lineStyle(1.5, colour(c.controlRing));
          g.strokeRoundedRect(x - 2, barY - 2, bar.width + 4, barH + 4, (barH + 4) / 2);
        }
        x += bar.width + barH * 1.6;
      });
    } else {
      for (const label of this.barLabels) label.setText('');
    }

    // Bottom right: the powerup on each button, and any boost that is running.
    const mine = world.human ? world.teams[world.human.team] : null;
    if (mine) {
      const buttons = ['LT', 'RB'].map((button, slot) => `${button} ${mine.powerups[slot]?.name ?? '—'}`);
      const running = mine.boosts.map((b) => `${b.name} ${Math.ceil(b.secondsLeft)}s`);
      this.powerText.setFontSize(fontSize);
      this.powerText.setText([...running, ...buttons].join('    ').toUpperCase());
      this.powerText.setColor(running.length > 0 ? c.charge : c.dim);
      const px = width - look.marginPixels - 12;
      this.powerText.setPosition(px, barY + barH / 2);
      g.fillStyle(colour(c.panel), 0.82);
      g.fillRoundedRect(px - this.powerText.width - 10, barY - 6, this.powerText.width + 20, barH + 12, (barH + 12) / 2);
    }

    // A banner across the ice: in the scoring team's colour for a goal, a dark pill for anything else.
    const message = this.message();
    this.bigText.setVisible(message !== '');
    if (message !== '') {
      const goal = world.phase === 'goal';
      const size = Math.max(18, height * (goal ? 0.17 : 0.07));
      this.bigText.setFontSize(size);
      this.bigText.setText(message);
      const cy = this.originY - (goal ? 0 : t.rink.width * this.zoom * 0.3);
      this.bigText.setPosition(width / 2, cy);
      if (goal) {
        // The team that leads after this goal is not known here, so the banner uses the accent colour.
        g.fillStyle(colour(c.panel), 0.88);
        g.fillRect(0, cy - size * 0.75, width, size * 1.5);
        g.fillStyle(colour(c.accent));
        g.fillRect(0, cy - size * 0.75, width, Math.max(3, size * 0.07));
        g.fillRect(0, cy + size * 0.75 - Math.max(3, size * 0.07), width, Math.max(3, size * 0.07));
        this.bigText.setColor(c.accent);
      } else {
        const w = this.bigText.width + size * 1.6;
        g.fillStyle(colour(c.panel), 0.88);
        g.fillRoundedRect(width / 2 - w / 2, cy - size * 0.85, w, size * 1.7, size * 0.85);
        this.bigText.setColor(c.text);
      }
    }
  }
}
