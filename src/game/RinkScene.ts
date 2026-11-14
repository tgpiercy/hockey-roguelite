import * as Phaser from 'phaser';
import { teamCrest, type Crest } from '../core/crest';
import { lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';
import { benchDoor, lineEnergy } from '../sim/lines';
import { forfeitResult, gameResult, type GameResult } from '../sim/match';
import type { PowerupSpec } from '../sim/modifiers';
import { carrySpot } from '../sim/puck';
import { goalLineX, nets } from '../sim/rink';
import { chargeFraction } from '../sim/shot';
import type { Tuning } from '../sim/tuning';
import type { SimEvent, World } from '../sim/types';
import { createGame, step, STEP_SECONDS, type TeamSetup } from '../sim/world';
import { Crowd } from './drawArena';
import { drawCrest } from './drawCrest';
import { Effects, type View } from './effects';
import { InputReader, type Controls } from './input';

const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);
const c = look.colours;
const fx = look.effects;
const arena = look.arena;

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
  /** "low" drops the skate marks, snow and crowd movement, for a phone that struggles. */
  detail?: 'full' | 'low';
  /** The live tuning values; read every step, so the tuning panel takes effect at once. */
  tuning: () => Tuning;
  /** Called once per frame with the controls, for the menus. */
  onControls: (controls: Controls) => void;
  /** True while the game is paused: it is still drawn, but nothing moves and no time passes. */
  paused?: () => boolean;
  /** Called with what happened in the simulation this frame, and once per frame with the world: for sound. */
  onEvents?: (events: SimEvent[], world: World, t: Tuning) => void;
  onFrame?: (world: World, t: Tuning, seconds: number) => void;
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
  /** Drawn in this order: the arena and ice, the adverts painted on it, the players, the heads-up display. */
  private ice!: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private adverts: Phaser.GameObjects.Text[] = [];
  private numbers: Phaser.GameObjects.Text[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private scoreTexts: Phaser.GameObjects.Text[] = [];
  private clockTextObject!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private barLabels: Phaser.GameObjects.Text[] = [];
  private powerText!: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private effects!: Effects;
  private crowd = new Crowd();
  private crests!: [Crest, Crest];
  private showDebug = false;
  private leftover = 0;
  private reported = false;
  private done = false;
  private passWasDown = false;
  /** After a pause: the action buttons are ignored until all are let go, so the press that resumed does not also pass. */
  private holdButtons = false;
  /** Seconds of real time since the game started, for anything that only animates. */
  private clock = 0;
  /** Seconds the current banner has been showing, so it can slide in. */
  private bannerAge = 0;
  private bannerText = '';

  // World-to-screen transform, recalculated every frame so resizing just works.
  private zoom = 1;
  private originX = 0;
  private originY = 0;

  constructor(private readonly options: RinkSceneOptions) {
    super('rink');
  }

  private get full(): boolean {
    return this.options.detail !== 'low';
  }

  create(): void {
    this.reader = new InputReader();
    this.effects = new Effects(this.full);
    this.crests = [teamCrest(this.options.names[0], this.teamColour(0)), teamCrest(this.options.names[1], this.teamColour(1))];
    const heading = { fontFamily: look.font, fontStyle: 'bold' };

    this.ice = this.add.graphics();
    this.adverts = arena.iceAdverts.map((text) =>
      this.add
        .text(0, 0, text, { ...heading, color: c.iceShade })
        .setOrigin(0.5, 0.5)
        .setAlpha(arena.iceAdvertAlpha),
    );
    this.g = this.add.graphics();
    this.world = createGame(this.options.tuning(), this.options.seed, {
      teams: this.options.teams,
      levels: this.options.levels,
      powerups: this.options.powerups,
    });
    this.numbers = this.world.players.map((p) => this.add.text(0, 0, p.role === 'goalie' ? '1' : String(p.line * 3 + p.slot + 2), { ...heading, color: c.text }).setOrigin(0.5, 0.5).setVisible(false));
    this.labels = this.world.players.map(() => this.add.text(0, 0, '', { fontFamily: look.font, color: c.debugText }).setOrigin(0.5, 1).setVisible(false));

    this.hud = this.add.graphics();
    this.nameTexts = [0, 1].map(() => this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0.5));
    this.scoreTexts = [0, 1].map(() => this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0.5));
    this.clockTextObject = this.add.text(0, 0, '', { ...heading, color: c.accent }).setOrigin(0.5, 0.5);
    this.barLabels = [0, 1, 2].map(() => this.add.text(0, 0, '', { ...heading, color: c.dim }).setOrigin(0, 0.5));
    this.bigText = this.add
      .text(0, 0, '', { ...heading, color: c.text })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.powerText = this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(1, 0.5);
    this.events.once('destroy', () => this.reader.dispose());
  }

  override update(time: number, deltaMs: number): void {
    const controls = this.reader.read(time);
    this.options.onControls(controls);
    if (this.done) return;
    if (controls.debugPressed) this.showDebug = !this.showDebug;
    const t = this.options.tuning();
    const real = Math.min(deltaMs / 1000, MAX_CATCH_UP_SECONDS);

    if (this.options.paused?.()) {
      this.holdButtons = true;
      this.passWasDown = controls.frame.pass;
      this.options.onFrame?.(this.world, t, real);
      this.draw(t, 0);
      return;
    }
    const f = controls.frame;
    if (this.holdButtons) {
      if (f.pass || f.shoot || f.check || f.switchPlayer || f.lineChange || f.powerupA || f.powerupB) {
        controls.frame = { ...f, pass: false, shoot: false, check: false, switchPlayer: false, lineChange: false, powerupA: false, powerupB: false };
      } else {
        this.holdButtons = false;
      }
    }
    const passPressed = controls.frame.pass && !this.passWasDown;
    this.passWasDown = controls.frame.pass;

    this.clock += real;
    const happened: SimEvent[] = [];
    let played = 0;
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
      this.leftover += real;
      while (this.leftover >= STEP_SECONDS) {
        happened.push(...step(this.world, controls.frame, t));
        this.leftover -= STEP_SECONDS;
        played += STEP_SECONDS;
      }
    }

    // Effects and sound only watch: they are told what happened and never touch the simulation.
    this.effects.update(this.world, happened, t, played);
    if (this.effects.shake > 0) {
      if (this.full) this.cameras.main.shake(fx.shakeMs, this.effects.shake);
      this.effects.shake = 0;
    }
    if (happened.length > 0) this.options.onEvents?.(happened, this.world, t);
    this.options.onFrame?.(this.world, t, real);
    this.draw(t, real);
  }

  /** Gives the game up: it ends now as a loss for the human's team, without the summary screen. */
  forfeit(): void {
    if (this.done) return;
    this.done = true;
    this.options.onDone(forfeitResult(gameResult(this.world), 0));
  }

  /** True once the final whistle has gone: the summary is showing, so there is nothing left to pause. */
  get over(): boolean {
    return this.reported || this.done;
  }

  private sx(x: number): number {
    return this.originX + x * this.zoom;
  }

  private sy(y: number): number {
    return this.originY + y * this.zoom;
  }

  private get view(): View {
    return { sx: (x) => this.sx(x), sy: (y) => this.sy(y), zoom: this.zoom };
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

  private draw(t: Tuning, real: number): void {
    const { width, height } = this.scale;
    // The rink sits below a strip kept for the scoreboard, with room above and below it for the front rows.
    const top = look.topBarPixels;
    const vertical = look.marginPixels + look.standsVerticalPixels;
    const z = Math.min((width - look.marginPixels * 2) / t.rink.length, (height - top - vertical * 2) / t.rink.width);
    this.zoom = z;
    this.originX = width / 2;
    this.originY = top + (height - top) / 2;

    this.ice.clear();
    this.g.clear();
    this.hud.clear();
    this.drawArena(t, width, height);
    this.drawRink(t);
    this.effects.drawUnder(this.ice, this.view);
    this.drawPlayers(t);
    this.drawPuck(t);
    this.effects.drawOver(this.g, this.view);
    this.drawHud(t, width, height, real);
  }

  /** The stands and the crowd in them, around the outside of the boards. */
  private drawArena(t: Tuning, width: number, height: number): void {
    const g = this.ice;
    const z = this.zoom;
    const hx = t.rink.length / 2;
    const hy = t.rink.width / 2;
    const corner = Math.min(t.rink.cornerRadius, hx, hy) * z;
    const left = this.sx(-hx);
    const topEdge = this.sy(-hy);
    const w = t.rink.length * z;
    const h = t.rink.width * z;

    // Tiers of seating as bands that get lighter toward the ice.
    g.fillStyle(colour(c.stands));
    g.fillRect(0, look.topBarPixels, width, height - look.topBarPixels);
    const tier = arena.rowGap * 3;
    for (let i = 3; i >= 1; i--) {
      g.lineStyle(tier, colour(c.standsEdge), 0.35);
      const d = tier * i - tier / 2 + arena.firstRowOffset * 0.5;
      g.strokeRoundedRect(left - d, topEdge - d, w + d * 2, h + d * 2, corner + d);
    }
    this.crowd.layout(left, topEdge, w, h, corner, width, height, look.topBarPixels);
    this.crowd.draw(g, this.clock, this.effects.excitement, this.effects.cheering, [this.teamColour(0), this.teamColour(1)], !this.full);
  }

  /** The ice, its markings, the boards, the bench doors and the nets. */
  private drawRink(t: Tuning): void {
    const g = this.ice;
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

    // Lighting: soft pools of light over the middle of the sheet.
    for (const [share, alpha] of arena.lightPools) {
      g.fillStyle(colour(c.light), alpha as number);
      g.fillEllipse(this.sx(0), this.sy(0), t.rink.length * z * (share as number), t.rink.width * z * (share as number) * 0.92);
    }

    // The home team's crest at centre ice, under the lines.
    drawCrest(g, this.crests[0], this.sx(0), this.sy(0), look.centreCrestSize * z, look.centreCrestAlpha);

    // Adverts painted on the ice, two in each end zone's corners of the neutral zone.
    const advertX = blue * 0.55;
    const advertY = hy * 0.72;
    const spots: [number, number][] = [
      [-advertX, -advertY],
      [advertX, -advertY],
      [-advertX, advertY],
      [advertX, advertY],
    ];
    this.adverts.forEach((text, i) => {
      const spot = spots[i % spots.length] as [number, number];
      text.setFontSize(Math.max(8, z * 0.95));
      text.setPosition(this.sx(spot[0]), this.sy(spot[1]));
    });

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

    // Boards: a dark wall with a pale rail along its inside edge, and advert panels along the straights.
    const wall = Math.max(4, look.boardWidth * z * 1.2);
    g.lineStyle(wall, colour(c.boards));
    g.strokeRoundedRect(this.sx(-hx) - wall / 2, this.sy(-hy) - wall / 2, t.rink.length * z + wall, t.rink.width * z + wall, corner + wall / 2);
    const panel = arena.boardPanel;
    const straight = hx - t.rink.cornerRadius;
    const panels = arena.boardPanelColours;
    let n = 0;
    for (let x = -straight; x < straight - 0.01; x += panel) {
      const hex = panels[n++ % panels.length] as string;
      g.lineStyle(wall * 0.55, colour(hex), 0.9);
      const x1 = this.sx(x) + 1;
      const x2 = this.sx(Math.min(straight, x + panel)) - 1;
      for (const y of [this.sy(-hy) - wall / 2, this.sy(hy) + wall / 2]) g.lineBetween(x1, y, x2, y);
    }
    g.lineStyle(Math.max(1, wall * 0.2), colour(c.rail));
    g.strokeRoundedRect(this.sx(-hx), this.sy(-hy), t.rink.length * z, t.rink.width * z, corner);

    // Bench doors: a gap in the top boards in each team's colour.
    for (const team of [0, 1] as const) {
      const door = benchDoor(team, t);
      g.lineStyle(wall, colour(this.teamColour(team)));
      g.lineBetween(this.sx(door.x - t.bench.doorRadius), this.sy(-hy) - wall / 2, this.sx(door.x + t.bench.doorRadius), this.sy(-hy) - wall / 2);
    }

    // Nets, and the red light behind one that has just been scored on.
    nets(t).forEach((net, side) => {
      const lit = this.effects.goalLight[side as 0 | 1];
      if (lit > 0) {
        const pulse = 0.55 + 0.45 * Math.sin(this.clock * 18);
        const lx = this.sx((side === 0 ? -1 : 1) * (gx + t.net.depth + 1.1));
        g.fillStyle(colour(c.goalLight), 0.25 * pulse);
        g.fillCircle(lx, this.sy(0), 2.4 * z);
        g.fillStyle(colour(c.goalLight), 0.9 * pulse);
        g.fillCircle(lx, this.sy(0), 0.55 * z);
      }
      // The back of the net bulges outward for a moment as the puck hits it.
      const sinceGoal = lit > 0 ? fx.goalLightSeconds - lit : Number.POSITIVE_INFINITY;
      const bulge = this.full && sinceGoal < fx.netBulgeSeconds ? fx.netBulge * Math.sin((sinceGoal / fx.netBulgeSeconds) * Math.PI) : 0;
      const out = side === 0 ? -1 : 1;
      const bx = (x: number): number => (Math.abs(x) > gx + 0.05 ? x + out * bulge : x);
      g.lineStyle(Math.max(1.5, line), colour(c.net));
      for (const [a, b] of net.netting) g.lineBetween(this.sx(bx(a.x)), this.sy(a.y), this.sx(bx(b.x)), this.sy(b.y));
      g.fillStyle(colour(c.post));
      for (const post of net.posts) g.fillCircle(this.sx(post.x), this.sy(post.y), Math.max(2, t.net.postRadius * z));
    });
  }

  /**
   * Every player on the ice, seen from above: skates striding under him, shoulders across the way he faces,
   * his team's second colour worn as its jersey pattern, a helmet, a stick. Goalies are wider, in a lighter shade.
   */
  private drawPlayers(t: Tuning): void {
    const g = this.g;
    const z = this.zoom;
    const world = this.world;
    const line = Math.max(1, look.lineWidth * z);
    const controlled = world.human ? world.players[world.human.controlled] : undefined;

    world.players.forEach((p, i) => {
      const label = this.labels[i];
      const number = this.numbers[i];
      if (!p.onIce) {
        label?.setVisible(false);
        number?.setVisible(false);
        return;
      }
      const x = this.sx(p.pos.x);
      const y = this.sy(p.pos.y);
      const goalie = p.role === 'goalie';
      const base = (goalie ? Math.max(t.goalie.bodyRadius, p.goalie!.fx.coverRadius) : t.skater.radius) * z;
      const r = base * look.playerScale;
      // A staggered skater, or one heading to the bench, is drawn faded.
      const alpha = p.stagger > 0 || p.leaving ? 0.45 : 1;
      const crest = this.crests[p.team];
      const jersey = colour(goalie ? lighten(crest.primary, look.goalieLighten) : crest.primary);
      const second = colour(crest.secondary);
      const fxDir = Math.cos(p.facing);
      const fyDir = Math.sin(p.facing);
      // Across his shoulders: at right angles to the way he faces.
      const ax = -fyDir;
      const ay = fxDir;
      const down = goalie && (this.effects.padsDown.get(p.id) ?? 0) > 0;
      const spread = r * (goalie ? (down ? 1.15 : 0.85) : 0.55);
      const shoulder = r * (goalie ? 0.62 : 0.7);

      // Shadow on the ice.
      g.fillStyle(colour(c.shadow), 0.2 * alpha);
      g.fillCircle(x + r * 0.18, y + r * 0.28, r * 1.05);

      if (p === controlled) {
        g.lineStyle(Math.max(2, line * 1.8), colour(c.controlRing));
        g.strokeCircle(x, y, base * look.controlRingScale);
      }

      // Skates: one forward and one back, swapping as he strides.
      if (!goalie) {
        const stride = Math.sin(this.effects.stride.get(p.id) ?? 0) * r * fx.strideReach;
        g.fillStyle(colour(c.skate), alpha);
        for (const side of [-1, 1]) {
          const along = stride * side;
          g.fillCircle(x + ax * r * 0.38 * side + fxDir * along, y + ay * r * 0.38 * side + fyDir * along, Math.max(1.5, r * 0.26));
        }
        const blade = carrySpot(p, t);
        // Without the puck his stick sweeps a little with his stride. With it, the blade stays exactly on the puck.
        const sweep = this.full && world.puck.carrier !== p.id ? Math.sin((this.effects.stride.get(p.id) ?? 0) * 0.5) * r * fx.stickSweep : 0;
        const bx = this.sx(blade.x) + ax * sweep;
        const by = this.sy(blade.y) + ay * sweep;
        g.lineStyle(Math.max(2, line * 1.6), colour(c.stick), alpha);
        g.lineBetween(x, y, bx, by);
        g.lineStyle(Math.max(3, line * 2.6), colour(c.stick), alpha);
        g.lineBetween(bx, by, bx + ax * r * 0.35, by + ay * r * 0.35);
      }

      // An outline first, then the jersey on top of it. The main colour always dominates, so the two teams
      // are told apart at a glance; the second colour is an accent worn one of three ways.
      const edge = Math.max(1, r * 0.14);
      g.fillStyle(crest.pattern === 'yoke' ? second : colour(c.outline), alpha);
      g.fillCircle(x + ax * spread, y + ay * spread, shoulder + edge);
      g.fillCircle(x - ax * spread, y - ay * spread, shoulder + edge);
      g.fillCircle(x, y, r * 0.8 + edge);
      g.fillStyle(jersey, alpha);
      g.fillCircle(x + ax * spread, y + ay * spread, shoulder);
      g.fillCircle(x - ax * spread, y - ay * spread, shoulder);
      g.fillCircle(x, y, r * 0.8);
      if (crest.pattern === 'hoop') {
        // A band round the body.
        g.lineStyle(Math.max(1.5, r * 0.16), second, alpha);
        g.strokeCircle(x, y, r * 0.66);
      } else if (crest.pattern === 'sash') {
        // A patch on each shoulder.
        g.fillStyle(second, alpha);
        g.fillCircle(x + ax * spread * 1.15, y + ay * spread * 1.15, shoulder * 0.42);
        g.fillCircle(x - ax * spread * 1.15, y - ay * spread * 1.15, shoulder * 0.42);
      }

      // Helmet, a little forward of centre and leaning into his skating, with a visor line showing which way he faces.
      const lean = Math.min(1, Math.hypot(p.vel.x, p.vel.y) / 9) * r * 0.1;
      const hxp = x + fxDir * (r * 0.12 + lean);
      const hyp = y + fyDir * (r * 0.12 + lean);
      g.fillStyle(colour(lighten(crest.primary, goalie ? 0.15 : look.helmetLighten)), alpha);
      g.fillCircle(hxp, hyp, r * 0.46);
      g.lineStyle(Math.max(1, r * 0.14), jersey, alpha);
      g.lineBetween(hxp + fxDir * r * 0.3 + ax * r * 0.28, hyp + fyDir * r * 0.3 + ay * r * 0.28, hxp + fxDir * r * 0.3 - ax * r * 0.28, hyp + fyDir * r * 0.3 - ay * r * 0.28);

      // A number on his back, when he is drawn big enough to read one.
      if (number) {
        const show = r >= look.numberMinRadius;
        number.setVisible(show);
        if (show) {
          number.setFontSize(r * 0.8);
          number.setPosition(x - fxDir * r * 0.42, y - fyDir * r * 0.42);
          number.setAlpha(alpha);
          number.setColor(crest.trim);
        }
      }

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
  private drawHud(t: Tuning, width: number, height: number, real: number): void {
    const g = this.hud;
    const world = this.world;
    const controlled = world.human ? world.players[world.human.controlled] : undefined;

    // Scoreboard: each team's crest and name on its colour, the two scores, and the period and clock between them.
    g.fillStyle(colour(c.background));
    g.fillRect(0, 0, width, look.topBarPixels);
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
    const crestSize = boardH - 4;
    const nameSize = Math.max(10, boardH * 0.5);
    const names = this.options.names;
    // The crest sits at the outer end of each name block; the name takes the rest.
    const crestXs = [left + crestSize / 2 + 4, left + boardW - crestSize / 2 - 4];
    const textW = nameW - crestSize - 12;
    const xs = [left + crestSize + 8 + textW / 2, left + boardW - crestSize - 8 - textW / 2];
    const scoreXs = [left + nameW + scoreW / 2, left + boardW - nameW - scoreW / 2];
    for (const team of [0, 1] as const) {
      drawCrest(g, this.crests[team], crestXs[team] as number, midY, crestSize);
      const name = this.nameTexts[team];
      const score = this.scoreTexts[team];
      if (name) {
        name.setFontSize(nameSize);
        name.setText(names[team].toUpperCase());
        // A long name is squeezed to fit its block.
        name.setScale(1, 1);
        name.setScale(Math.min(1, textW / Math.max(1, name.width)), 1);
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

    // A banner across the ice: a full-width band that slides in for a goal, a dark pill for anything else.
    const message = this.message();
    if (message !== this.bannerText) {
      this.bannerText = message;
      this.bannerAge = 0;
    } else {
      this.bannerAge += real;
    }
    this.bigText.setVisible(message !== '');
    if (message !== '') {
      const goal = world.phase === 'goal';
      const size = Math.max(18, height * (goal ? 0.17 : 0.07));
      this.bigText.setFontSize(size);
      this.bigText.setText(message);
      const cy = this.originY - (goal ? 0 : t.rink.width * this.zoom * 0.3);
      if (goal) {
        // The band and the word slide in from the left and settle.
        const k = this.full ? Math.min(1, this.bannerAge / look.bannerSlideSeconds) : 1;
        const eased = 1 - (1 - k) ** 3;
        const bandW = width * eased;
        const scorer = this.effects.cheering;
        // The band's edges wear the scoring team's second colour, which always shows against the dark band.
        const band = scorer === null ? c.accent : this.crests[scorer].secondary;
        g.fillStyle(colour(c.panel), 0.9);
        g.fillRect(0, cy - size * 0.75, bandW, size * 1.5);
        g.fillStyle(colour(band));
        g.fillRect(0, cy - size * 0.75, bandW, Math.max(4, size * 0.1));
        g.fillRect(0, cy + size * 0.75 - Math.max(4, size * 0.1), bandW, Math.max(4, size * 0.1));
        this.bigText.setPosition(width / 2 - (1 - eased) * width * 0.6, cy);
        this.bigText.setColor(c.accent);
        if (scorer !== null) {
          drawCrest(g, this.crests[scorer], width / 2 - (1 - eased) * width * 0.6 - this.bigText.width / 2 - size * 0.7, cy, size * 1.05);
        }
      } else {
        this.bigText.setPosition(width / 2, cy);
        const w = this.bigText.width + size * 1.6;
        g.fillStyle(colour(c.panel), 0.88);
        g.fillRoundedRect(width / 2 - w / 2, cy - size * 0.85, w, size * 1.7, size * 0.85);
        this.bigText.setColor(c.text);
      }
    }
  }
}
