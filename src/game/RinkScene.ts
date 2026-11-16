import type { Tactics } from '../sim/tactics';
import { Commentator, COMMENTARY_SHOW_SECONDS } from './commentary';
import * as Phaser from 'phaser';
import { teamCrest, type Crest } from '../core/crest';
import { lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';
import { braced, checkRules } from '../sim/check';
import { HINT_TIMING, hintDone, hintFor, hintText, type HintCounts, type HintId } from './hints';
import { benchDoor, lineEnergy, mayPull } from '../sim/lines';
import { onFire } from '../sim/momentum';
import { forfeitResult, gameResult, type GameResult } from '../sim/match';
import type { PowerupSpec } from '../sim/modifiers';
import { carrySpot } from '../sim/puck';
import { goalLineX, nets } from '../sim/rink';
import { chargeFraction } from '../sim/shot';
import { activeLabels } from '../sim/conditions';
import { passPreview } from '../sim/pass';
import { inkOn } from '../core/teamColours';
import { STEPS_PER_SECOND } from '../sim/clock';
import { newlyInForce, wordsFor } from './floatWords';
import { copyWorld, goalOfTheGame, Recorder, type Clip, type GoalNote } from './replay';
import { isMascot, mascotPlayer } from '../sim/mascot';
import type { Tuning } from '../sim/tuning';
import type { SimEvent, World, MatchRules, InputFrame } from '../sim/types';
import { NO_INPUT } from '../sim/types';
import { createGame, step, STEP_SECONDS, type TeamSetup } from '../sim/world';
import { Crowd } from './drawArena';
import { drawCrest } from './drawCrest';
import { FIGURE_BOX, paintFigure } from './drawFigure';
import { Effects, type View } from './effects';
import type { PlayerLook } from '../core/playerLook';
import { facingSide, figure, figureColours, lookKey, PLAIN_LOOK, skinTone, withStick, type Action, type FigureLook, type PoseInput } from './figure';
import { InputReader, type Controls } from './input';

const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);
const c = look.colours;
const fx = look.effects;
const arena = look.arena;
const FIG = look.figure;
const RET = look.reticle;
const TAU = Math.PI * 2;
/** What is drawn over what. Players sit between two graphics layers and are sorted among themselves by how far down the screen they are. */
const DEPTH = { ground: 1, players: 2, top: 3, labels: 4, hud: 5 };

/** Longest stretch of real time caught up in one frame, so a stalled tab does not fast-forward. */
const MAX_CATCH_UP_SECONDS = 0.25;

export interface RinkSceneOptions {
  /** The seed for this game. A game replays exactly from its seed. */
  seed: string;
  /** The two dressed teams: the human's first. */
  teams: [TeamSetup, TeamSetup];
  /** What to call each team on the scoreboard. */
  names: [string, string];
  /** Rules a rink or a mode changes for this game. Left out, the usual game. */
  rules?: MatchRules;
  /** Player one keeps his skater until he presses switch. */
  holdSwitch?: boolean;
  /** Draw the puck larger, with a bright edge. */
  bigPuck?: boolean;
  /** The announcer's line as the game begins. Left out, he says nothing. */
  opening?: string;
  /** A second player with a controller of his own: on team 0 (co-op) or team 1 (versus). Left out, one player. */
  second?: 0 | 1;
  /** Each team's dressed players' names, in order: six skaters, then the goalie. For the commentary. */
  playerNames?: [string[], string[]];
  /** What each dressed player looks like, by team and then in the order they are dressed. Left out, everyone is plain. */
  looks?: [PlayerLook[], PlayerLook[]];
  /** Whether commentary lines are wanted now; left out, there is none. */
  commentary?: () => boolean;
  /** Called with each commentary line as it is shown, for the spoken voice. */
  onCall?: (text: string, priority: number) => void;
  /** AI level per team, 0 to 1; null takes it from the tuning. */
  levels: [number | null, number | null];
  /** The powerups loaded on the human's two buttons. */
  powerups: (PowerupSpec | null)[];
  /** Each team's jersey colour, as "#rrggbb". Left out, the defaults are used. */
  homeColour?: string;
  awayColour?: string;
  /** The team in its white road jersey: the other wears its colour. Left out, both wear their colour. */
  whiteTeam?: 0 | 1;
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
  /** How often the player has done each move, for the on-screen hints; null (or left out) switches hints off. */
  hints?: () => HintCounts | null;
  /** Whether a goal is shown again in slow motion. Left out, it is not. */
  replays?: () => boolean;
  /** Told when a replay starts (true) and ends (false). */
  onReplay?: (on: boolean) => void;
  /** Called each time the player does a move a hint is about. */
  onHintDone?: (id: string) => void;
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
  private reader2: InputReader | null = null;
  /** The commentary: who makes the calls, the line on screen and when it comes down. */
  private commentator!: Commentator;
  private callText!: Phaser.GameObjects.Text;
  private callUntil = 0;
  /** The hint on screen, how long it has been up, and the wait before the next one. */
  private hint: HintId | null = null;
  private hintShown = 0;
  private hintGap = 0;
  private wasGiveGo = false;
  /** Player two's hint, kept the same way, and the line it is shown on. */
  private hint2: HintId | null = null;
  private hintShown2 = 0;
  private hintGap2 = 0;
  private hintText2!: Phaser.GameObjects.Text;
  /** Drawn above the players: the puck, sparks and the wind-up bar. */
  private top!: Phaser.GameObjects.Graphics;
  /** One picture per player, showing the texture of the pose he is in. */
  private sprites: Phaser.GameObjects.Image[] = [];
  /** Every pose painted so far, and the size they were painted at; repainted when the rink is resized. */
  /** Each figure picture kept, with the frame it was last shown on: the ones longest unused go when there are too many. */
  private readonly figureKeys = new Map<string, number>();
  private figureFrame = 0;
  private figurePixels = 0;
  /** Seconds left with everything frozen (a big hit, a goal), and seconds left of slow motion after a goal. */
  private freeze = 0;
  private slow = 0;
  /** Who scored last, while the goal is being celebrated. */
  private scorer: number | null = null;
  /** The real-time clock reading until which the on-fire banner shows, and for which team. */
  private fireBanner = { until: 0, team: 0 as 0 | 1 };
  /** The same for a mascot's arrival. */
  private mascotBanner = { until: 0, team: 0 as 0 | 1 };
  /** Things that happened before the first frame (a mascot there from the opening faceoff), to be told with it. */
  private pending: SimEvent[] = [];
  /** Words rising from the play, and the text objects that show them. */
  private floats: { text: string; x: number; y: number; age: number; item: boolean }[] = [];
  private floatTexts: Phaser.GameObjects.Text[] = [];
  /** The conditional items in force for the human's team last frame, to notice new ones. */
  private inForce: ReadonlySet<string> = new Set();
  /** Instant replay: the recorder, the clip being shown, the goal waiting to be shown, and every goal's clip. */
  private recorder = new Recorder(1, look.replay.keepSeconds);
  private replay: { world: World; inputs: [InputFrame, InputFrame][]; at: number; leftover: number } | null = null;
  private goalWaiting: number | null = null;
  private goalClips: (Clip | null)[] = [];
  private goalNotes: (GoalNote & { scorer: number | null })[] = [];
  private lastOneTimer = false;
  private replayText!: Phaser.GameObjects.Text;
  /** The stick as each player last held it, for the pass mark. */
  private lastFrames: [InputFrame, InputFrame] = [NO_INPUT, NO_INPUT];
  private pullText!: Phaser.GameObjects.Text;
  /** Which way each player faced on screen last frame: left or right. */
  private readonly sides = new Map<number, 1 | -1>();
  /** After a pause: the action buttons are ignored until all are let go, so the press that resumed does not also pass. */
  private holdButtons = false;
  private holdLeft = 0;
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
    this.effects.teamColours = [this.teamColour(0), this.teamColour(1)];
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
      ...(this.options.second !== undefined ? { second: this.options.second } : {}),
      ...(this.options.rules ? { rules: this.options.rules } : {}),
      ...(this.options.holdSwitch ? { holdSwitch: true } : {}),
    });
    if (this.options.second !== undefined) this.reader2 = new InputReader(1);
    for (const team of [0, 1] as const) {
      const visitor = mascotPlayer(this.world, team);
      if (visitor && isMascot(this.world, visitor)) this.pending.push({ type: 'mascot', team, player: visitor.id, arrived: true });
    }
    // Layers, bottom to top: the ice; shadows, rings and sticks; the players; the puck and sparks; labels; the scoreboard.
    this.g.setDepth(DEPTH.ground);
    this.sprites = this.world.players.map(() => this.add.image(0, 0, '__DEFAULT').setVisible(false).setDepth(DEPTH.players));
    this.top = this.add.graphics().setDepth(DEPTH.top);
    this.numbers = this.world.players.map((p) => this.add.text(0, 0, p.role === 'goalie' ? '1' : String(p.line * 3 + p.slot + 2), { ...heading, color: c.text }).setOrigin(0.5, 0.5).setVisible(false).setDepth(DEPTH.labels));
    this.labels = this.world.players.map(() => this.add.text(0, 0, '', { fontFamily: look.font, color: c.debugText }).setOrigin(0.5, 1).setVisible(false).setDepth(DEPTH.labels));

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
    this.replayText = this.add.text(0, 0, 'REPLAY', { ...heading, color: c.accent }).setOrigin(0, 0).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    this.floatTexts = Array.from({ length: look.floatWords.most }, () => this.add.text(0, 0, '', { ...heading, color: look.floatWords.colour }).setOrigin(0.5, 1).setDepth(DEPTH.hud).setStroke(c.panel, 4).setVisible(false));
    this.pullText = this.add.text(0, 0, '', { ...heading, color: c.accent }).setOrigin(0.5, 1).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    this.callText = this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    this.commentator = new Commentator(this.options.seed);
    this.hintText2 = this.add.text(0, 0, '', { ...heading, color: RET.colour2 }).setOrigin(0.5, 1).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    for (const item of [this.hud, ...this.nameTexts, ...this.scoreTexts, this.clockTextObject, ...this.barLabels, this.bigText, this.powerText]) item.setDepth(DEPTH.hud);
    this.events.once('destroy', () => {
      this.reader.dispose();
      this.reader2?.dispose();
    });
  }

  override update(time: number, deltaMs: number): void {
    const controls = this.reader.read(time);
    // A second player: his controller's frame, and his pause button counts too. If his controller goes, the AI takes his skater.
    const controls2 = this.reader2 ? this.reader2.read(time) : null;
    if (controls2) {
      if (controls2.menuPressed && !controls.menuPressed) {
        controls.menuPressed = true;
        controls.menuPlayer = 1;
      }
      if (!controls2.hasPad && this.world.human2) this.world.human2 = null;
    }
    const frame2 = controls2 && this.world.human2 ? controls2.frame : NO_INPUT;
    this.options.onControls(controls);
    if (this.done) return;
    if (controls.debugPressed) this.showDebug = !this.showDebug;
    const t = this.options.tuning();
    const real = Math.min(deltaMs / 1000, MAX_CATCH_UP_SECONDS);

    if (this.options.paused?.()) {
      this.holdButtons = true;
      this.holdLeft = fx.resumeHoldSeconds;
      this.passWasDown = controls.frame.pass;
      this.options.onFrame?.(this.world, t, real);
      this.draw(t, 0);
      return;
    }
    const f = controls.frame;
    if (this.holdButtons) {
      // Only the buttons that could have closed the pause menu are held back, and only for a moment: a button
      // that reads as stuck down must never lock the others out.
      this.holdLeft -= real;
      if ((f.pass || f.shoot || f.check) && this.holdLeft > 0) {
        controls.frame = { ...f, pass: false, shoot: false, check: false };
      } else {
        this.holdButtons = false;
      }
    }
    const passPressed = controls.frame.pass && !this.passWasDown;
    this.passWasDown = controls.frame.pass;

    this.clock += real;
    // The announcer opens the broadcast, once, as the game begins.
    if (!this.opened && this.options.opening && this.options.commentary?.()) {
      this.opened = true;
      this.callText.setText(this.options.opening.toUpperCase());
      this.callUntil = this.clock + COMMENTARY_SHOW_SECONDS * 1.6;
      this.options.onCall?.(this.options.opening, 1);
    }
    // A replay takes over the screen until it ends or a button skips it; the game itself waits.
    if (this.replay) {
      const skipping = controls.frame.pass || controls.frame.shoot || controls.frame.check;
      const skip = skipping && !this.replaySkipHeld;
      this.replaySkipHeld = skipping;
      this.passWasDown = controls.frame.pass;
      this.stepReplay(t, real, skip);
      return;
    }
    this.replaySkipHeld = controls.frame.pass || controls.frame.shoot || controls.frame.check;
    const happened: SimEvent[] = this.pending.splice(0);
    let played = 0;
    if (this.world.phase === 'final') {
      if (!this.reported) {
        this.reported = true;
        this.options.onResult(gameResult(this.world));
      } else if (controls.frame.shoot && !this.shootWasDown && !this.done && this.watchGoalOfTheGame()) {
        // Shoot at the summary: the goal of the game, once more.
      } else if (passPressed && !this.done) {
        this.done = true;
        this.options.onDone(gameResult(this.world));
        return;
      }
    } else {
      if (this.freeze > 0) {
        // A beat with nothing moving, so the hit or the goal lands.
        this.freeze -= real;
      } else {
        this.leftover += real * (this.slow > 0 ? fx.goalSlowScale : 1);
        this.slow = Math.max(0, this.slow - real);
        while (this.leftover >= STEP_SECONDS) {
          const controlled = this.world.human ? this.world.human.controlled : -1;
          const controlled2 = this.world.human2 ? this.world.human2.controlled : -1;
          this.recorder.before(this.world, controls.frame, frame2);
          const stepped = step(this.world, controls.frame, t, frame2);
          happened.push(...stepped);
          for (const e of stepped) {
            if (e.type === 'shot') this.lastOneTimer = e.oneTimer === true;
            if (e.type === 'goal') {
              this.goalNotes.push({ team: e.team, score: [this.world.score[0], this.world.score[1]], overtime: this.world.overtime, oneTimer: this.lastOneTimer, scorer: e.scorer });
              this.goalClips.push(null);
              this.goalWaiting = this.world.tick;
            }
          }
          // Once the celebration is over the goal's clip is cut, and shown if replays are on.
          if (this.goalWaiting !== null && this.world.phase !== 'goal') {
            const from = this.goalWaiting - Math.round(look.replay.beforeSeconds * STEPS_PER_SECOND);
            const clip = this.recorder.clip(from, this.goalWaiting + Math.round(look.replay.afterSeconds * STEPS_PER_SECOND));
            this.goalClips[this.goalClips.length - 1] = clip;
            this.goalWaiting = null;
            if (clip && (this.world.phase as string) !== 'final' && this.world.rules === 'game' && this.options.replays?.()) {
              this.startReplay(clip);
              this.leftover = 0;
              break;
            }
          }
          for (const e of stepped) {
            // A move by either player counts toward the same tallies.
            const id = hintDone(e, controlled) ?? (controlled2 >= 0 ? hintDone(e, controlled2) : null);
            if (id) this.countHint(id);
          }
          this.leftover -= STEP_SECONDS;
          played += STEP_SECONDS;
        }
      }
    }
    // Words rise from the play for the moves worth naming, and for an artifact of yours coming into force.
    for (const word of wordsFor(happened)) {
      const who = this.world.players[word.player];
      if (who) this.floatWord(word.text, who.pos.x, who.pos.y, false);
    }
    if (this.world.human) {
      const noted = newlyInForce(this.world, this.world.human.team, this.inForce);
      this.inForce = noted.now;
      for (const name of noted.fresh) this.floatWord(name.toUpperCase(), this.world.puck.pos.x, this.world.puck.pos.y, true);
    }
    for (const e of happened) {
      if (e.type === 'goal') {
        this.scorer = e.scorer;
        if (this.full) {
          this.freeze = fx.goalFreezeSeconds;
          this.slow = fx.goalSlowSeconds;
        }
      } else if (e.type === 'check' && e.big && this.full) {
        this.freeze = Math.max(this.freeze, fx.hitFreezeSeconds);
      } else if (e.type === 'fire') {
        this.fireBanner = { until: this.clock + fx.fireBannerSeconds, team: e.team };
      } else if (e.type === 'mascot' && e.arrived) {
        this.mascotBanner = { until: this.clock + fx.mascotBannerSeconds, team: e.team };
      }
    }
    if (this.world.phase !== 'goal') this.scorer = null;
    // Commentary: one short line for the most important thing that just happened.
    if (happened.length > 0 && this.options.commentary?.() && this.options.playerNames) {
      const names = this.options.playerNames;
      const call = this.commentator.call(
        happened,
        { name: (id) => names[id < 7 ? 0 : 1][id % 7] ?? null, teams: this.options.names, score: this.world.score, mascots: [this.mascotName(0), this.mascotName(1)] },
        this.clock,
      );
      if (call) {
        this.callText.setText(call.text.toUpperCase());
        this.callUntil = this.clock + COMMENTARY_SHOW_SECONDS;
        this.options.onCall?.(call.text, call.priority);
      }
    }
    const giveGo = Boolean(this.world.human?.giveGo);
    if (giveGo && !this.wasGiveGo) this.countHint('giveGo');
    this.wasGiveGo = giveGo;
    this.updateHint(real, t);
    this.updateHint2(real, t);

    // Effects and sound only watch: they are told what happened and never touch the simulation.
    this.effects.update(this.world, happened, t, played);
    if (this.effects.shake > 0) {
      if (this.full) this.cameras.main.shake(fx.shakeMs, this.effects.shake);
      this.effects.shake = 0;
    }
    if (happened.length > 0) this.options.onEvents?.(happened, this.world, t);
    this.options.onFrame?.(this.world, t, real);
    this.lastFrames = [controls.frame, frame2];
    this.shootWasDown = controls.frame.shoot;
    this.draw(t, real);
    this.drawFloats(real);
  }

  private opened = false;
  private replaySkipHeld = false;
  private shootWasDown = false;

  /** Starts showing a clip. The clip itself is left as it was, so it can be shown again. */
  private startReplay(clip: Clip): void {
    this.replay = { world: copyWorld(clip.start), inputs: clip.inputs, at: 0, leftover: 0 };
    this.floats = [];
    this.options.onReplay?.(true);
  }

  /** One frame of a replay: runs the copy on at its own speed, draws it in place of the game, and ends it when it is done or skipped. */
  private stepReplay(t: Tuning, real: number, skip: boolean): void {
    const replay = this.replay;
    if (!replay) return;
    const events: SimEvent[] = [];
    let played = 0;
    replay.leftover += real * look.replay.speed;
    while (replay.leftover >= STEP_SECONDS && replay.at < replay.inputs.length) {
      const [a, b] = replay.inputs[replay.at] as [InputFrame, InputFrame];
      events.push(...step(replay.world, a, t, b));
      replay.at += 1;
      replay.leftover -= STEP_SECONDS;
      played += 1;
    }
    const live = this.world;
    this.world = replay.world;
    this.effects.update(replay.world, events, t, played);
    this.effects.shake = 0;
    this.draw(t, real);
    this.world = live;
    this.drawFloats(real);
    this.replayText.setVisible(true);
    this.replayText.setFontSize(Math.max(12, this.scale.height * 0.05));
    this.replayText.setPosition(look.marginPixels + 10, look.topBarPixels + 8);
    this.replayText.setText('REPLAY  ·  ANY BUTTON SKIPS');
    if (skip || replay.at >= replay.inputs.length) {
      this.replay = null;
      this.replayText.setVisible(false);
      this.options.onReplay?.(false);
    }
  }

  /** The goal of the game, for the summary: who scored it and the score it made, or null if nobody scored. */
  goalOfTheGame(): { scorer: number | null; team: 0 | 1; score: [number, number]; canWatch: boolean } | null {
    const index = goalOfTheGame(this.goalNotes);
    if (index === null) return null;
    const note = this.goalNotes[index] as GoalNote & { scorer: number | null };
    return { scorer: note.scorer, team: note.team, score: note.score, canWatch: Boolean(this.goalClips[index]) };
  }

  /** Shows the goal of the game again. Returns false if there is none to show. */
  watchGoalOfTheGame(): boolean {
    const index = goalOfTheGame(this.goalNotes);
    const clip = index === null ? null : this.goalClips[index];
    if (!clip || this.replay) return false;
    this.startReplay(clip);
    return true;
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
  /** Starts a word rising from a spot on the ice (in metres). The oldest gives way when there are too many. */
  private floatWord(text: string, x: number, y: number, item: boolean): void {
    if (this.floats.length >= look.floatWords.most) this.floats.shift();
    this.floats.push({ text, x, y, age: 0, item });
  }

  /** Moves the rising words on and puts them on the screen. */
  private drawFloats(real: number): void {
    const fw = look.floatWords;
    this.floats = this.floats.filter((w) => (w.age += real) < fw.seconds);
    const size = Math.max(10, this.scale.height * fw.size);
    this.floatTexts.forEach((label, i) => {
      const w = this.floats[i];
      if (!w) {
        label.setVisible(false);
        return;
      }
      const k = w.age / fw.seconds;
      label.setText(w.text);
      label.setFontSize(size);
      label.setColor(w.item ? fw.itemColour : fw.colour);
      label.setPosition(this.sx(w.x), this.sy(w.y) - this.zoom * (1.6 + fw.rise * k));
      label.setAlpha(k < 0.7 ? 1 : (1 - k) / 0.3);
      label.setVisible(true);
    });
  }

  private mascotName(team: 0 | 1): string | null {
    return this.options.teams[team].mascot?.name ?? null;
  }

  private message(): string {
    const world = this.world;
    if (world.phase === 'goal') return world.shootout?.last === 'miss' ? 'NO GOAL' : 'GOAL!';
    // A mascot has arrived: said until the puck is about to drop, for whichever side he plays.
    if (this.clock < this.mascotBanner.until && world.phase !== 'break' && !(world.phase === 'faceoff' && world.faceoff?.dropped)) {
      return `${(this.mascotName(this.mascotBanner.team) ?? 'The mascot').toUpperCase()} IS HERE FOR THE ${this.options.names[this.mascotBanner.team].toUpperCase()}!`;
    }
    if (world.phase === 'play' && this.clock < this.fireBanner.until) return `${this.options.names[this.fireBanner.team].toUpperCase()} ON FIRE!`;
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
    this.top.clear();
    this.hud.clear();
    this.drawArena(t, width, height);
    this.drawRink(t);
    this.effects.drawUnder(this.ice, this.view);
    this.drawPlayers(t);
    this.drawPuck(t);
    this.effects.drawOver(this.top, this.view);
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
    // The boards carry the home team's colour between the white panels, and the visitors' here and there.
    const panels = [look.colours.boards, this.teamColour(0), look.colours.boards, this.teamColour(0), look.colours.boards, this.teamColour(1)];
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
   * Every player on the ice as an upright cartoon figure standing on the top-down rink: his feet and shadow
   * are where the simulation has him, and the body rises above that spot. The shapes come from figure.ts.
   */
  private drawPlayers(t: Tuning): void {
    const g = this.g;
    const z = this.zoom;
    const world = this.world;
    const line = Math.max(1, look.lineWidth * z);
    const controlled = world.human ? world.players[world.human.controlled] : undefined;

    // Each pose is painted once, at this many pixels to a footprint radius, and kept. A resized rink repaints them.
    const pixels = Math.min(FIG.maxTexturePixels, t.skater.radius * z * look.playerScale * FIG.textureScale);
    if (Math.abs(pixels - this.figurePixels) > 0.05) {
      for (const key of this.figureKeys.keys()) this.textures.remove(key);
      this.figureKeys.clear();
      this.figurePixels = pixels;
    }
    // Every player has his own pictures now, so they add up: past the limit, the ones not shown for longest are let go.
    this.figureFrame += 1;
    if (this.figureKeys.size > FIG.maxTextures) {
      const oldest = [...this.figureKeys.entries()].filter(([, used]) => used < this.figureFrame - 1).sort((a, b) => a[1] - b[1]);
      for (const [key] of oldest.slice(0, this.figureKeys.size - Math.round(FIG.maxTextures * 0.8))) {
        this.textures.remove(key);
        this.figureKeys.delete(key);
      }
    }
    // Where each human's pass would go right now.
    const passMarks = new Map<number, string>();
    [world.human, world.human2].forEach((human, n) => {
      const passer = human ? world.players[human.controlled] : undefined;
      const target = passer && world.phase === 'play' ? passPreview(world, passer, this.lastFrames[n] as InputFrame, t) : null;
      if (target) passMarks.set(target.id, n === 0 ? RET.colour : RET.colour2);
    });
    for (const [i, p] of world.players.entries()) {
      const label = this.labels[i];
      const number = this.numbers[i];
      if (!p.onIce) {
        label?.setVisible(false);
        number?.setVisible(false);
        this.sprites[i]?.setVisible(false);
        this.sides.delete(p.id);
        continue;
      }
      const x = this.sx(p.pos.x);
      const y = this.sy(p.pos.y);
      const goalie = p.role === 'goalie';
      const base = (goalie ? Math.max(t.goalie.bodyRadius, p.goalie!.fx.coverRadius) : t.skater.radius) * z;
      // One footprint radius of the figure, in pixels.
      const unit = base * look.playerScale;
      // A staggered skater, or one heading to the bench, is drawn faded.
      const alpha = p.stagger > 0 || p.leaving ? 0.45 : 1;
      const crest = this.crests[p.team];
      const side = facingSide(p.facing, this.sides.get(p.id));
      this.sides.set(p.id, side);
      const acting = this.effects.action.get(p.id)?.kind;
      // A glove save keeps him on his feet with the glove up; any other save puts the pads down.
      const down = goalie && acting !== 'glove' && (this.effects.padsDown.get(p.id) ?? 0) > 0;
      const speed = Math.min(1, Math.hypot(p.vel.x, p.vel.y) / FIG.fullSpeed);
      const stride = this.effects.stride.get(p.id) ?? 0;
      // The pose is rounded to one of a few steps, so the same few pictures are reused instead of painting him every frame.
      const strideStep = goalie ? 0 : Math.round((((stride % TAU) + TAU) % TAU) / TAU * FIG.poseSteps) % FIG.poseSteps;
      const speedStep = goalie ? 0 : Math.round(speed * FIG.speedSteps);
      // The stick stays up for the moment of a fake.
      const wound = !goalie && (p.fake > 0 || (p.charge > 0 && chargeFraction(p.charge, t) > FIG.windUpAt)) ? 1 : 0;
      const kneel = !goalie && braced(world, p, t);
      // The scorer throws his arms up while the goal is celebrated.
      const cheer = !goalie && world.phase === 'goal' && this.scorer === p.id;
      const scorer = this.scorer === null ? undefined : world.players[this.scorer];
      const mateCheer = !goalie && !cheer && world.phase === 'goal' && scorer !== undefined && scorer.team === p.team;
      // What he is doing this moment, most telling first: a hit or a poke thrown, a pass made, a deke, a tired glide.
      const action: Action | undefined = goalie
        ? acting === 'glove'
          ? 'glove'
          : undefined
        : cheer || mateCheer || kneel || wound
          ? undefined
          : acting === 'hit' || acting === 'poke' || acting === 'pass'
            ? acting
            : p.deke > 0
              ? 'deke'
              : p.energy < FIG.tiredBelow && speed < FIG.tiredSpeed
                ? 'tired'
                : undefined;
      // Who he is: his own look, or the mascot's while the mascot has his place.
      const own = this.options.looks?.[p.team]?.[p.id - p.team * 7];
      const who: FigureLook = !goalie && isMascot(world, p) ? { hair: 'bald', beard: 'none', build: 'heavy', mark: 'mascot' } : (own ?? PLAIN_LOOK);
      const pose: PoseInput = {
        side: 1,
        stride: (strideStep / FIG.poseSteps) * TAU,
        speed: speedStep / FIG.speedSteps,
        windUp: wound,
        goalie,
        down,
        tilt: 0,
        pattern: crest.pattern,
        cheer,
        mateCheer,
        kneel,
        ...(action ? { action } : {}),
      };
      const skin = own?.skin ?? skinTone(p.id);
      const key = `figure-${p.team}-${goalie ? (down ? 'gd' : 'g') : 's'}-${skin}-${own?.hairColour ?? ''}-${lookKey(who)}-${strideStep}-${speedStep}-${wound}${cheer ? '-cheer' : ''}${mateCheer ? '-mate' : ''}${kneel ? '-kneel' : ''}${action ? `-${action}` : ''}`;
      if (!this.textures.exists(key)) {
        const canvas = document.createElement('canvas');
        paintFigure(canvas, figure(pose, who).shapes, figureColours(crest, goalie, skin, this.options.whiteTeam === p.team ? 'away' : 'home', own?.hairColour), pixels);
        this.textures.addCanvas(key, canvas);
      }
      this.figureKeys.set(key, this.figureFrame);
      const fig = figure({ ...pose, side }, who);

      // His shadow on the ice marks where he really is, and how big.
      g.fillStyle(colour(c.shadow), 0.22 * alpha);
      g.fillEllipse(x, y, unit * FIG.shadowWidth * 2, unit * FIG.shadowHeight * 2);

      // A team on fire: a glow under each of its players.
      if (onFire(world, p.team)) {
        g.fillStyle(colour(c.fire), 0.3 + 0.2 * Math.sin(this.clock * 12 + p.id));
        g.fillEllipse(x, y, unit * FIG.shadowWidth * 2.9, unit * FIG.shadowHeight * 2.9);
      }
      // The Gale's burst: streaks behind him.
      if (p.burst > 0) {
        g.lineStyle(Math.max(1.5, unit * 0.14), colour(c.shield), 0.8);
        for (const off of [-0.5, 0, 0.5]) g.lineBetween(x - side * unit * 1.2, y - unit * (1.6 + off), x - side * unit * 2.6, y - unit * (1.6 + off));
      }
      // A mascot: a gold ring at his feet and a gold pip over his head, for either side, for as long as he is on.
      if (!goalie && isMascot(world, p)) {
        g.lineStyle(Math.max(2, unit * 0.22), colour(c.mascot), 0.95);
        g.strokeEllipse(x, y, unit * 3.6, unit * 3.6 * FIG.ringSquash);
        this.top.fillStyle(colour(c.mascot));
        this.top.fillCircle(x, y + fig.top * unit - unit * 0.55, Math.max(3, unit * 0.36));
      }
      // The marksman: a ring under him that closes in as he winds up; full means it cannot be saved.
      if (p.fx.unstoppableCharged > 0) {
        const charge = p.charge > 0 ? chargeFraction(p.charge, t) : 0;
        g.lineStyle(Math.max(2, unit * 0.2), colour(c.danger), 0.55 + 0.45 * charge);
        g.strokeEllipse(x, y, unit * (4.4 - 2.2 * charge), unit * (4.4 - 2.2 * charge) * FIG.ringSquash);
        this.top.fillStyle(colour(c.danger));
        this.top.fillCircle(x, y + fig.top * unit - unit * 0.5, Math.max(2.5, unit * 0.3));
      }
      // The Wall: a pip over the goalie for each automatic save he has left this period.
      if (goalie && p.goalie && p.goalie.fx.periodAutoSaves > 0) {
        const left = p.goalie.autoSavePeriod === world.period ? p.goalie.autoSavesLeft : Math.round(p.goalie.fx.periodAutoSaves);
        for (let k = 0; k < left; k++) {
          this.top.fillStyle(colour(c.shield));
          this.top.fillCircle(x + (k - (left - 1) / 2) * unit * 0.9, y + fig.top * unit - unit * 0.5, Math.max(2.5, unit * 0.32));
        }
      }

      // The spin move is ready: a thin ring at his feet. (Burn it with a poke before the real check.)
      if (!goalie && p.talents.includes('spinMove') && (p.talentCooldown.spinMove ?? 0) <= 0) {
        this.top.lineStyle(Math.max(1.5, unit * 0.12), colour(c.accent), 0.65);
        this.top.strokeCircle(x, y, base * 1.5);
      }
      // A boss trick's tell: faint lanes from an opposing carrier whose passes cannot be picked off.
      if (world.puck.carrier === p.id && p.fx.passThrough > 0 && world.human && p.team !== world.human.team) {
        this.top.lineStyle(Math.max(1.5, unit * 0.1), colour(c.accent), 0.28);
        for (const mate of world.players) {
          if (mate.onIce && mate.team === p.team && mate.role === 'skater' && mate.id !== p.id) this.top.lineBetween(x, y, this.sx(mate.pos.x), this.sy(mate.pos.y));
        }
      }
      // Boss tricks' tells. A skater who cannot be knocked down stands on a heavy ring; one who blocks standing up
      // shows a bar on the side the puck is on, while he is able to block.
      if (!goalie && p.fx.sureFooted > 0) {
        this.g.lineStyle(Math.max(2, unit * 0.3), colour(c.ice), 0.85);
        this.g.strokeEllipse(x, y, unit * 3.2, unit * 1.5);
      }
      if (!goalie && p.fx.alwaysBraced > 0 && braced(world, p, t)) {
        const toward = Math.atan2(world.puck.pos.y - p.pos.y, world.puck.pos.x - p.pos.x);
        const bx = x + Math.cos(toward) * unit * 1.5;
        const by = y + Math.sin(toward) * unit * 1.5;
        const across = toward + Math.PI / 2;
        this.top.lineStyle(Math.max(2, unit * 0.32), colour(c.ice), 0.9);
        this.top.lineBetween(bx - Math.cos(across) * unit, by - Math.sin(across) * unit, bx + Math.cos(across) * unit, by + Math.sin(across) * unit);
      }
      // A skater whose every hit is a knock-down flashes while he is winding one up.
      if (!goalie && p.fx.alwaysKnockdown > 0 && p.checkCharge > 0) {
        const pulse = 0.55 + 0.45 * Math.sin(this.clock * 30);
        this.top.lineStyle(Math.max(2, unit * 0.22), colour(c.fire), pulse);
        this.top.strokeCircle(x, y - unit * 1.6, unit * 2.4);
      }

      // The team-mate a pass would go to right now: a small diamond under him, in the passer's colour.
      const marked = passMarks.get(p.id);
      if (marked) {
        const half = unit * look.passMark.size;
        const tall = half * FIG.ringSquash;
        const diamond = [
          [x - half, y, x, y - tall],
          [x, y - tall, x + half, y],
          [x + half, y, x, y + tall],
          [x, y + tall, x - half, y],
        ] as const;
        g.lineStyle(Math.max(2, unit * look.passMark.width) + RET.edgePixels * 2, colour(RET.edge));
        for (const [ax, ay, bx, by] of diamond) g.lineBetween(ax, ay, bx, by);
        g.lineStyle(Math.max(2, unit * look.passMark.width), colour(marked));
        for (const [ax, ay, bx, by] of diamond) g.lineBetween(ax, ay, bx, by);
      }
      const second = world.human2 !== null && world.human2.controlled === p.id && p !== controlled;
      const ringColour = p === controlled ? RET.colour : second ? RET.colour2 : null;
      if (ringColour !== null) {
        // The ring lies flat on the ice under him, with a tick pointing the way he truly faces. Player two's is blue.
        const ring = base * look.controlRingScale;
        const width = Math.max(RET.minRingPixels, unit * RET.ringWidth);
        const tx = x + Math.cos(p.facing) * ring;
        const ty = y + Math.sin(p.facing) * ring * FIG.ringSquash;
        // A white edge first, then the bright ring on it, so it shows on the ice, on a red line and under a red team.
        for (const [w, hex] of [[width + RET.edgePixels * 2, RET.edge], [width, ringColour]] as const) {
          g.lineStyle(w, colour(hex));
          g.strokeEllipse(x, y, ring * 2, ring * 2 * FIG.ringSquash);
          // Player two's ring is doubled, so it differs in shape as well as colour.
          if (second) g.strokeEllipse(x, y, ring * 1.45, ring * 1.45 * FIG.ringSquash);
          g.lineBetween(tx, ty, tx + Math.cos(p.facing) * ring * FIG.ringTick, ty + Math.sin(p.facing) * ring * FIG.ringTick * FIG.ringSquash);
        }
      }

      if (world.puck.carrier === p.id) {
        // An arrow over the head of whoever has the puck, on either team, bobbing. Drawn above the players.
        const tipY = y + fig.top * unit - unit * RET.arrowGap + Math.sin(this.clock * RET.bobPerSecond) * unit * RET.bobUnits;
        const half = (unit * RET.arrowWidth) / 2;
        const tall = unit * RET.arrowHeight;
        const e = RET.edgePixels;
        this.top.fillStyle(colour(RET.edge));
        this.top.fillTriangle(x - half - e * 1.6, tipY - tall - e, x + half + e * 1.6, tipY - tall - e, x, tipY + e * 1.8);
        this.top.fillStyle(colour(RET.colour));
        this.top.fillTriangle(x - half, tipY - tall, x + half, tipY - tall, x, tipY);
      }

      // The stick: a skater's blade sits exactly where the puck is carried; a goalie's rests on the ice in front of him.
      let end = fig.stickEnd;
      // Celebrating, he holds the stick aloft.
      if (cheer) end = { x: fig.hand.x + side * 0.4, y: fig.hand.y - 1.3 };
      if (!end) {
        const blade = carrySpot(p, t);
        // Without the puck his stick sweeps a little with his stride.
        const sweep = this.full && world.puck.carrier !== p.id ? Math.sin(stride * 0.5) * fx.stickSweep : 0;
        end = { x: (this.sx(blade.x) - x) / unit + sweep * side, y: (this.sy(blade.y) - y) / unit };
      }
      for (const piece of withStick(fig, end, side)) {
        if (piece.tag !== 'stick' || piece.kind !== 'limb') continue;
        g.lineStyle(Math.max(1.5, piece.w * unit), colour(c.stick), alpha);
        g.lineBetween(x + piece.x1 * unit, y + piece.y1 * unit, x + piece.x2 * unit, y + piece.y2 * unit);
      }

      const sprite = this.sprites[i];
      sprite
        ?.setTexture(key)
        .setOrigin(0.5, FIGURE_BOX.feetY / FIGURE_BOX.height)
        .setPosition(x, y)
        .setScale(unit / pixels)
        .setFlipX(side === -1)
        .setRotation(p.knockedDown ? FIG.knockdownTilt * side : p.stagger > 0 ? FIG.staggerTilt * side : 0)
        .setAlpha(alpha)
        .setDepth(DEPTH.players + (p.pos.y + t.rink.width) / (t.rink.width * 4))
        .setVisible(true);

      // A number on his chest, when he is drawn big enough to read one.
      if (number) {
        const show = unit >= look.numberMinRadius && !down;
        number.setVisible(show);
        if (show) {
          number.setFontSize(unit * 0.7);
          number.setPosition(x, y - unit * FIG.numberHeight);
          number.setAlpha(alpha);
          number.setColor(crest.trim);
        }
      }

      if (label) {
        const isAi = !goalie && p !== controlled;
        label.setVisible(this.showDebug && isAi);
        if (this.showDebug && isAi) {
          label.setFontSize(Math.max(9, z * 0.9));
          label.setPosition(x, y + fig.top * unit - 2);
          label.setText(p.leaving ? 'bench' : p.ai.state);
        }
      }
    }

    // Shot or pass wind-up, above the controlled skater.
    if (controlled) {
      const held = Math.max(controlled.charge, controlled.passCharge, controlled.checkCharge);
      if (held > 0) {
        // A shot winding up, a pass on its way to being a saucer, or a check on its way to being a hit: full means it is.
        const fill =
          controlled.charge > 0
            ? chargeFraction(controlled.charge, t)
            : controlled.passCharge > 0
              ? Math.min(1, controlled.passCharge / t.pass.saucerHoldTime)
              : Math.min(1, controlled.checkCharge / checkRules(world, controlled, t).bodyHoldSeconds);
        const w = t.skater.radius * 4 * z;
        const h = Math.max(4, 0.3 * z);
        const bx = this.sx(controlled.pos.x) - w / 2;
        const by = this.sy(controlled.pos.y) - t.skater.radius * z * look.playerScale * (FIG.height + FIG.chargeBarGap);
        this.top.fillStyle(colour(c.panel), 0.85);
        this.top.fillRoundedRect(bx - 1, by - 1, w + 2, h + 2, (h + 2) / 2);
        this.top.fillStyle(colour(c.charge));
        this.top.fillRoundedRect(bx, by, Math.max(h, w * fill), h, h / 2);
      }
    }
  }

  /** The puck with a shadow; a ring while it is held for a faceoff, larger while it is in the air. */
  private drawPuck(t: Tuning): void {
    const g = this.top;
    const z = this.zoom;
    const world = this.world;
    const puck = world.puck;
    const x = this.sx(puck.pos.x);
    const y = this.sy(puck.pos.y);
    const radius = Math.max(2.5, t.puck.radius * z * 1.25) * (this.options.bigPuck ? look.bigPuckScale : 1);
    // The easier-to-see puck: a bright edge round it, always.
    if (this.options.bigPuck && !(world.phase === 'faceoff' && !world.faceoff?.dropped)) {
      g.lineStyle(Math.max(2, radius * 0.45), colour(c.charge), 0.95);
      g.strokeCircle(x, y, radius * 1.35);
    }
    if (world.phase === 'faceoff' && !world.faceoff?.dropped) {
      g.lineStyle(Math.max(2, look.lineWidth * z), colour(c.puck));
      g.strokeCircle(x, y, radius * 2.5);
      return;
    }
    // The passing chain: a bright ring round the puck for each pass in it.
    for (let k = 1; k <= puck.chain; k++) {
      g.lineStyle(Math.max(1.5, z * 0.09), colour(c.charge), 0.9);
      g.strokeCircle(x, y, radius * (1.4 + k * 0.7));
    }
    const lift = puck.air > 0 ? radius * 1.2 : radius * 0.35;
    g.fillStyle(colour(c.shadow), 0.3);
    g.fillCircle(x + lift * 0.6, y + lift, radius * (puck.air > 0 ? 1.3 : 1));
    g.fillStyle(colour(c.puck));
    g.fillCircle(x, y, radius * (puck.air > 0 ? 1.5 : 1));
  }

  /** The scoreboard, the bars at the bottom, the powerups, and any banner across the ice. */
  /** A boss trick's tell: the other team presses with everyone while you have the puck in your own end. */
  private fullPressOn(humanTeam: 0 | 1): boolean {
    const world = this.world;
    if (world.phase !== 'play') return false;
    const carrier = world.puck.carrier === null ? null : world.players[world.puck.carrier];
    if (!carrier || carrier.team !== humanTeam) return false;
    const ownEnd = humanTeam === 0 ? world.puck.pos.x < 0 : world.puck.pos.x > 0;
    return ownEnd && world.players.some((p) => p.onIce && p.team !== humanTeam && p.role === 'skater' && p.fx.fullPress > 0);
  }

  /** Changes how the first team's AI skaters are told to play, from now on (the pause menu does this). */
  setTactics(tactics: Tactics): void {
    this.world.teams[0].tactics = tactics;
  }

  /** The player has just done a move: count it, and take its hint down. */
  private countHint(id: HintId): void {
    if (!this.options.hints?.()) return;
    this.options.onHintDone?.(id);
    if (this.hint === id) {
      this.hint = null;
      this.hintGap = HINT_TIMING.gapSeconds;
    }
    if (this.hint2 === id) {
      this.hint2 = null;
      this.hintGap2 = HINT_TIMING.gapSeconds;
    }
  }

  /** One hint at a time: up for at least a moment, down when its move is no longer on, then a pause. */
  private updateHint(real: number, t: Tuning): void {
    const counts = this.options.hints?.() ?? null;
    if (!counts || this.world.phase === 'final') {
      this.hint = null;
      return;
    }
    if (this.hint) {
      this.hintShown += real;
      if (this.hintShown >= HINT_TIMING.minSeconds && hintFor(this.world, t, counts) !== this.hint) {
        this.hint = null;
        this.hintGap = HINT_TIMING.gapSeconds;
      }
      return;
    }
    this.hintGap -= real;
    if (this.hintGap > 0) return;
    const id = hintFor(this.world, t, counts);
    if (id) {
      this.hint = id;
      this.hintShown = 0;
    }
  }

  /** The same for player two, on his own line. */
  private updateHint2(real: number, t: Tuning): void {
    const counts = this.options.hints?.() ?? null;
    const human = this.world.human2;
    if (!counts || !human || this.world.phase === 'final') {
      this.hint2 = null;
      return;
    }
    if (this.hint2) {
      this.hintShown2 += real;
      if (this.hintShown2 >= HINT_TIMING.minSeconds && hintFor(this.world, t, counts, human) !== this.hint2) {
        this.hint2 = null;
        this.hintGap2 = HINT_TIMING.gapSeconds;
      }
      return;
    }
    this.hintGap2 -= real;
    if (this.hintGap2 > 0) return;
    const id = hintFor(this.world, t, counts, human);
    if (id) {
      this.hint2 = id;
      this.hintShown2 = 0;
    }
  }

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
        // Dark ink on a light team colour, white on a dark one.
        name.setColor(inkOn(this.teamColour(team)));
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
    const period = world.shootout
      ? `SHOT ${Math.min(world.shootout.taken[0], world.shootout.taken[1]) + 1}`
      : world.match.firstTo
        ? `TO ${world.match.firstTo}`
        : world.overtime && world.period > t.period.count
          ? 'OT'
          : `P${Math.min(world.period, t.period.count)}`;
    // The last seconds of regulation: the clock turns red and pulses.
    const lastSeconds = !world.overtime && world.period >= t.period.count && world.clock <= fx.lastSecondsPulse && world.phase !== 'final';
    this.clockTextObject.setColor(lastSeconds ? c.danger : c.accent);
    this.clockTextObject.setFontSize(Math.max(11, boardH * 0.5) * (lastSeconds ? 1 + 0.12 * Math.sin(this.clock * 10) : 1));
    // The periods as pips under the clock: filled for the ones played and the one being played.
    if (!world.shootout && !world.match.firstTo) {
      const pipR = Math.max(1.6, boardH * 0.07);
      const gap = pipR * 3.4;
      const cx = left + nameW + scoreW + midW / 2;
      for (let k = 0; k < t.period.count; k++) {
        const on = k < world.period;
        g.fillStyle(colour(on ? c.accent : c.panelLine), on ? 1 : 0.9);
        g.fillCircle(cx + (k - (t.period.count - 1) / 2) * gap, y0 + boardH - pipR - 2.5, pipR);
      }
    }

    // Momentum: a strip along the bottom of each team's name, bright and full while it is on fire.
    for (const team of [0, 1] as const) {
      const burning = onFire(world, team);
      const share = burning ? 1 : world.teams[team].heat;
      const barX = team === 0 ? left : left + boardW - nameW;
      g.fillStyle(colour(burning ? c.fire : c.accent), burning ? 0.7 + 0.3 * Math.sin(this.clock * 12) : 0.9);
      g.fillRect(team === 0 ? barX : barX + nameW * (1 - share), y0 + boardH - 3, nameW * share, 3);
    }

    // Pulling the goalie: a prompt when it is allowed, and a reminder while the net is empty.
    const humanTeam = world.human ? world.human.team : null;
    const prompt =
      humanTeam === null
        ? ''
        : world.human?.giveGo
          ? 'GIVE AND GO  ·  SHOOT OR CHECK TO CANCEL'
          : world.teams[humanTeam].pulled
            ? 'EMPTY NET  ·  VIEW: GOALIE BACK'
            : mayPull(world, humanTeam, t)
              ? 'VIEW: PULL THE GOALIE'
              : this.fullPressOn(humanTeam)
                ? 'FULL PRESS  ·  PASS THROUGH IT'
                : this.hint
                ? hintText(this.hint)
                : '';
    this.pullText.setVisible(prompt !== '');
    if (prompt !== '') {
      this.pullText.setText(prompt);
      this.pullText.setFontSize(Math.max(10, height * 0.034));
      this.pullText.setPosition(width / 2, height - look.marginPixels - 44);
    }
    // Player two's hint, in his ring's colour, on the line above player one's.
    this.hintText2.setVisible(this.hint2 !== null && world.phase === 'play');
    if (this.hint2 !== null) {
      this.hintText2.setText(`P2  ${hintText(this.hint2)}`);
      this.hintText2.setFontSize(Math.max(10, height * 0.034));
      this.hintText2.setPosition(width / 2, height - look.marginPixels - 44 - Math.max(14, height * 0.05));
    }
    // The commentary line sits just under the scoreboard and fades out at the end of its time.
    const callLeft = this.callUntil - this.clock;
    this.callText.setVisible(callLeft > 0);
    if (callLeft > 0) {
      this.callText.setFontSize(Math.max(10, height * 0.04));
      // During the goal banner the call moves to the lower part of the rink, so both can be read.
      this.callText.setPosition(width / 2, world.phase === 'goal' ? height * 0.74 : y0 + boardH + 6);
      this.callText.setAlpha(Math.min(1, callLeft / 0.4));
    }
    // A practice has no clock to show.
    this.clockTextObject.setText(world.match.practice ? look.practiceWord : `${period}  ${clockText(world.clock)}`);
    this.clockTextObject.setPosition(left + nameW + scoreW + midW / 2, !world.shootout && !world.match.firstTo ? midY - boardH * 0.1 : midY);

    // Bottom left: sprint bar of the controlled skater, then the energy of each line (the one on the ice is ringed).
    const barH = Math.max(7, height * 0.022);
    const barY = height - look.marginPixels - barH - 4;
    // Player two's sprint bar sits just above player one's, with a tick in his ring's colour.
    const second = world.human2 ? world.players[world.human2.controlled] : undefined;
    if (second) {
      const w2 = Math.min(width * 0.15, 140);
      const x2 = look.marginPixels + 8;
      const y2 = barY - barH - 8;
      g.fillStyle(colour(c.barBack));
      g.fillRoundedRect(x2, y2, w2, barH, barH / 2);
      g.fillStyle(colour(second.sprintLocked ? c.staminaLocked : c.stamina));
      g.fillRoundedRect(x2, y2, Math.max(barH, w2 * second.stamina), barH, barH / 2);
      g.fillStyle(colour(RET.colour2));
      g.fillRect(x2 - 6, y2, 3, barH);
      g.fillStyle(colour(RET.colour));
      g.fillRect(x2 - 6, barY, 3, barH);
    }
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
      // What is in force now: timed boosts with their seconds, and the artifacts whose moment it is.
      const running = [...mine.boosts.map((b) => `${b.name} ${Math.ceil(b.secondsLeft)}s`), ...activeLabels(world, world.human!.team)];
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
      // The goal banner sits in the upper part of the rink, clear of the scorer and the net-front.
      const cy = this.originY - t.rink.width * this.zoom * (goal ? look.goalBannerLift : 0.3);
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
