import type { Tactics } from '../sim/tactics';
import { Commentator, COMMENTARY_SHOW_SECONDS } from './commentary';
import * as Phaser from 'phaser';
import { mascotKind } from '../core/mascotKind';
import { teamCrest, type Crest } from '../core/crest';
import { lighten } from '../core/teamColours';
import look from '../data/rinkLook.json';
import { braced, checkRules } from '../sim/check';
import { FailWatch, HINT_TIMING, hintDone, hintFor, hintText, type HintCounts, type HintId } from './hints';
import { LESSON_TIMING, LESSON_WORDS, lessonAdvance, lessonLine, lessonOver, lessonStep, newLesson, slowStep, type Lesson, type LessonId } from './lesson';
import { stageDrill, type Drill } from '../sim/drill';
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
import { awayFrom, burstPoints, covers, placed, popScale } from './burst';
import { tenseNow } from './voicePlan';
import { newlyInForce, wordsFor, type FloatKind } from './floatWords';
import { copyWorld, goalOfTheGame, Recorder, type Clip, type GoalNote } from './replay';
import { isMascot, mascotPlayer } from '../sim/mascot';
import type { Tuning } from '../sim/tuning';
import type { SimEvent, World, MatchRules, InputFrame } from '../sim/types';
import { NO_INPUT } from '../sim/types';
import { createGame, step, STEP_SECONDS, type TeamSetup } from '../sim/world';
import { Crowd, crowdMoods } from './drawArena';
import { venueLook, type Venue } from './venue';
import { drawCrest } from './drawCrest';
import { FIGURE_BOX, paintFigure } from './drawFigure';
import { Effects, type View } from './effects';
import type { PlayerLook } from '../core/playerLook';
import { facingSide, figure, figureColours, lookKey, PLAIN_LOOK, skinTone, viewOf, withStick, type Action, type FigureLook, type PoseInput, type View as Seen, STANDING } from './figure';
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
  /** True to leave out the screen shake, the crowd's camera flashes and the pulsing of marks: they hold steady. */
  calm?: boolean;
  /** The building the game is played in (`venues` in `rinkLook.json`); the standard look when not given. */
  venue?: string;
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
  /** A line of commentary to be said: its words, how much it matters, what kind of call it is, and whether the game is close and late. */
  onCall?: (text: string, priority: number, kind: string, tense: boolean) => void;
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
  /** A game kept from before, to be picked up where it was in place of a new one. */
  resume?: World;
  /** A skate (the first, or the second for the later moves): the practice rink with a lesson run on it, which ends the game when it is done. */
  lesson?: LessonId;
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
  private venue: Venue = venueLook();
  private frameTimes: number[] = [];
  private frameSum = 0;
  private crowd = new Crowd();
  /** How the arena is inked: a heavy line, a hard shadow, people in the stands and printed dots. */
  private comic = look.comicArena;
  /** The words on the signs in the crowd, the comic card's second line, and the scorer's panel. */
  private signTexts: Phaser.GameObjects.Text[] = [];
  private cardSub!: Phaser.GameObjects.Text;
  private panelName!: Phaser.GameObjects.Text;
  private panelLine!: Phaser.GameObjects.Text;
  private panelSprite!: Phaser.GameObjects.Image;
  private panelKey = '';
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
  /** The first skate, if this is one; when the next situation is to be set up; and when the whole thing ends. */
  private lesson: Lesson | null = null;
  private lessonStage: number | null = null;
  private lessonEnd: number | null = null;
  private failWatch = new FailWatch();
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
  private floats: { text: string; x: number; y: number; age: number; kind: FloatKind | null; way: { x: number; y: number } }[] = [];
  /** The jagged shapes behind shouted words, kept by their words. */
  private readonly burstShapes = new Map<string, [number, number][]>();
  /** Where the shapes behind the rising words are drawn: under the words, over everything else. */
  private wordArt!: Phaser.GameObjects.Graphics;
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
  /** How each player on the ice is seen now, and when he last turned. */
  private readonly views = new Map<number, Seen>();
  private readonly turnedAt = new Map<number, number>();
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

    this.venue = venueLook(this.options.venue);
    this.crowd = new Crowd(this.venue, this.comic.heads);
    this.ice = this.add.graphics();
    this.adverts = this.venue.iceAdverts.map((text) =>
      this.add
        .text(0, 0, text, { ...heading, color: c.iceShade })
        .setOrigin(0.5, 0.5)
        .setAlpha(arena.iceAdvertAlpha),
    );
    // Signs held up in the crowd: lettered here, placed each frame where the crowd says they are.
    this.signTexts = Array.from({ length: look.signs.count }, (_, k) => {
      const team = k % 2 === 0 ? 0 : 1;
      const club = this.shortNames()[team] as string;
      const words = look.signs.words[(k >> 1) % look.signs.words.length] as string;
      return this.add.text(0, 0, words.replace('{club}', club), { ...heading, fontStyle: 'bold', color: look.signs.ink, fontSize: `${look.signs.size}px` }).setOrigin(0.5, 0.5).setVisible(false);
    });
    this.g = this.add.graphics();
    this.world = this.options.resume ?? createGame(this.options.tuning(), this.options.seed, {
      teams: this.options.teams,
      levels: this.options.levels,
      powerups: this.options.powerups,
      ...(this.options.second !== undefined ? { second: this.options.second } : {}),
      ...(this.options.rules ? { rules: this.options.rules } : {}),
      ...(this.options.holdSwitch ? { holdSwitch: true } : {}),
    });
    if (this.options.second !== undefined) this.reader2 = new InputReader(1);
    for (const team of this.options.resume ? [] : ([0, 1] as const)) {
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
    this.wordArt = this.add.graphics().setDepth(DEPTH.hud);
    this.nameTexts = [0, 1].map(() => this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0.5));
    this.scoreTexts = [0, 1].map(() => this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0.5));
    this.clockTextObject = this.add.text(0, 0, '', { ...heading, color: c.accent }).setOrigin(0.5, 0.5);
    this.barLabels = [0, 1, 2].map(() => this.add.text(0, 0, '', { ...heading, color: c.dim }).setOrigin(0, 0.5));
    this.bigText = this.add
      .text(0, 0, '', { ...heading, fontStyle: 'bold italic', color: c.text })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.powerText = this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(1, 0.5);
    this.cardSub = this.add.text(0, 0, '', { ...heading, color: look.titleCard.ink }).setOrigin(0.5, 0.5).setDepth(DEPTH.hud).setVisible(false);
    this.panelName = this.add.text(0, 0, '', { ...heading, fontStyle: 'bold italic', color: look.goalPanel.ink }).setOrigin(0.5, 0.5).setDepth(DEPTH.hud).setVisible(false);
    this.panelLine = this.add.text(0, 0, '', { ...heading, color: look.goalPanel.ink }).setOrigin(0.5, 0.5).setDepth(DEPTH.hud).setVisible(false);
    this.panelSprite = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setDepth(DEPTH.hud).setVisible(false);
    this.replayText = this.add.text(0, 0, 'REPLAY', { ...heading, color: c.accent }).setOrigin(0, 0).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    this.floatTexts = Array.from({ length: look.floatWords.most }, () => this.add.text(0, 0, '', { ...heading, fontStyle: 'bold italic', color: look.floatWords.colour }).setOrigin(0.5, 0.5).setDepth(DEPTH.hud).setVisible(false));
    this.pullText = this.add.text(0, 0, '', { ...heading, color: c.accent }).setOrigin(0.5, 1).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    this.callText = this.add.text(0, 0, '', { ...heading, color: c.text }).setOrigin(0.5, 0).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    this.commentator = new Commentator(this.options.seed);
    if (this.options.lesson) {
      this.lesson = newLesson(this.options.lesson);
      this.stage(lessonStep(this.lesson)?.drill ?? 'loose', this.options.tuning());
    }
    this.hintText2 = this.add.text(0, 0, '', { ...heading, color: RET.colour2 }).setOrigin(0.5, 1).setDepth(DEPTH.hud).setStroke(c.panel, 5).setVisible(false);
    for (const item of [this.hud, ...this.nameTexts, ...this.scoreTexts, this.clockTextObject, ...this.barLabels, this.bigText, this.powerText]) item.setDepth(DEPTH.hud);
    this.events.once('destroy', () => {
      this.reader.dispose();
      this.reader2?.dispose();
    });
  }

  override update(time: number, deltaMs: number): void {
    // The last ten seconds of frame times, for the read-out in the pause menu. Frames drawn while paused do not count.
    if (!this.options.paused?.()) {
      this.frameTimes.push(deltaMs);
      this.frameSum += deltaMs;
      while (this.frameSum > look.frameWindowMs && this.frameTimes.length > 1) this.frameSum -= this.frameTimes.shift() as number;
    }
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
      this.options.onCall?.(this.options.opening, 1, 'opening', false);
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
        if (this.lessonHold) {
          const fr = controls.frame;
          const touched = Math.hypot(fr.moveX, fr.moveY) > LESSON_TIMING.startStick || fr.shoot || fr.pass || fr.check || fr.switchPlayer || fr.sprint;
          if (touched) this.lessonHold = false;
        }
        // In a lesson, on a step that is learned slowed down: time runs slow while the person's own pass is on its way.
        const passTo = this.world.puck.carrier === null && this.world.puck.passTarget !== null ? this.world.players[this.world.puck.passTarget] : undefined;
        const learning = this.lesson && slowStep(this.lesson) && passTo !== undefined && this.world.human !== null && passTo.team === this.world.human.team ? LESSON_TIMING.slowScale : 1;
        this.leftover += this.lessonHold ? 0 : real * (this.slow > 0 ? fx.goalSlowScale : 1) * learning;
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
          if (this.lesson) this.stepLesson(stepped, controlled);
          if (controlled >= 0 && controls.frame.switchPlayer && this.world.human && this.world.human.controlled !== controlled && this.world.puck.carrier !== this.world.human.controlled) this.countHint('switchTo');
          if ((this.options.hints?.() || this.lesson) && controlled >= 0) {
            for (const word of this.failWatch.note(stepped, controlled, this.world.tick * STEP_SECONDS)) {
              const who = this.world.players[word.player];
              if (who) this.floatWord(word.text, who.pos.x, who.pos.y, null);
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
      if (who) this.floatWord(word.text, who.pos.x, who.pos.y, word.kind);
    }
    if (this.world.human) {
      const noted = newlyInForce(this.world, this.world.human.team, this.inForce);
      this.inForce = noted.now;
      for (const name of noted.fresh) this.floatWord(name.toUpperCase(), this.world.puck.pos.x, this.world.puck.pos.y, null);
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
        { name: (id) => names[id < 7 ? 0 : 1][id % 7] ?? null, teams: this.options.names, score: this.world.score, mascots: [this.mascotName(0), this.mascotName(1)], overtime: this.world.overtime },
        this.clock,
      );
      if (call) {
        this.callText.setText(call.text.toUpperCase());
        this.callUntil = this.clock + COMMENTARY_SHOW_SECONDS;
        this.options.onCall?.(call.text, call.priority, call.kind, tenseNow(this.world.period, this.world.score, this.world.overtime));
      }
    }
    // The lesson: the next situation is set up a moment after the last move, and the game ends a moment after the last step.
    if (this.lesson && this.world.phase === 'play') {
      if (!this.lessonSaid) {
        this.lessonSaid = true;
        this.sayWhy();
      }
      if (this.lessonStage !== null && this.clock >= this.lessonStage) {
        this.lessonStage = null;
        const step = lessonStep(this.lesson);
        const mine = this.world.human ? this.world.human.team : 0;
        const carrier = this.world.puck.carrier === null ? null : this.world.players[this.world.puck.carrier];
        // A new step always starts from its own situation; a step half done only when the puck has got away.
        if (step && (this.lesson.count === 0 || step.drill === 'defend' || !carrier || carrier.team !== mine || carrier.role !== 'skater')) this.stage(step.drill, t);
      }
      // The puck with the wrong side for a while (his, in a defending step; theirs, in any other): start the situation again.
      const now = lessonStep(this.lesson);
      const holder = this.world.puck.carrier === null ? null : this.world.players[this.world.puck.carrier];
      const mineNow = this.world.human ? this.world.human.team : 0;
      const wrong = now !== null && holder !== null && holder !== undefined && holder.role === 'skater' && (holder.team === mineNow) === (now.drill === 'defend');
      this.lessonWrong = wrong && this.lessonStage === null ? this.lessonWrong + real : 0;
      if (now && this.lessonWrong >= LESSON_TIMING.resetSeconds) {
        this.lessonWrong = 0;
        this.stage(now.drill, t);
      }
      if (this.lessonEnd !== null && this.clock >= this.lessonEnd && !this.done) {
        this.done = true;
        this.options.onDone(gameResult(this.world));
        return;
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
      if (this.full && !this.options.calm) this.cameras.main.shake(fx.shakeMs, this.effects.shake);
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

  private lessonSaid = false;
  private lessonWrong = 0;

  /** Sets a situation up, and holds the play still until the person moves the stick or presses a button: nobody loses the puck while reading. */
  private stage(drill: Drill, t: Tuning): void {
    stageDrill(this.world, t, drill);
    this.lessonHold = true;
    this.lessonWrong = 0;
  }

  private lessonHold = false;

  /** The lesson's sentence of why, where the commentary goes. */
  private sayWhy(): void {
    const step = this.lesson ? lessonStep(this.lesson) : null;
    if (!step) return;
    this.callText.setText(step.why.toUpperCase());
    this.callUntil = this.clock + LESSON_TIMING.whySeconds;
  }

  /** Counts a step of the simulation toward the lesson, and after a goal sets the situation up again. */
  private stepLesson(stepped: readonly SimEvent[], controlled: number): void {
    const lesson = this.lesson;
    if (!lesson || lessonOver(lesson)) return;
    const self = this.world.human ? this.world.players[this.world.human.controlled] : undefined;
    const went = lessonAdvance(lesson, stepped, controlled, this.world, self !== undefined && braced(this.world, self, this.options.tuning()));
    if (went !== 'none') {
      const me = this.world.human ? this.world.players[this.world.human.controlled] : undefined;
      if (me) this.floatWord(LESSON_WORDS.good, me.pos.x, me.pos.y, null);
      this.lessonStage = this.clock + LESSON_TIMING.stageSeconds;
      if (went === 'step') {
        if (lessonOver(lesson)) {
          this.lessonStage = null;
          this.lessonEnd = this.clock + LESSON_TIMING.doneSeconds;
          this.callUntil = 0;
        } else this.sayWhy();
      }
    }
    // A goal lines everyone up with the puck loose: put the step's own situation back.
    if (stepped.some((e) => e.type === 'goal') && this.lessonStage === null && this.lessonEnd === null) this.lessonStage = this.clock + LESSON_TIMING.stageSeconds * 2;
  }

  /** A mark's pulse, from -1 to 1; with the calm setting it holds at full instead of flashing. */
  private pulse(perSecond: number, offset = 0): number {
    return this.options.calm ? 1 : Math.sin(this.clock * perSecond + offset);
  }

  /** The game as it stands, for keeping. (A replay only borrows `world` while it is being drawn.) */
  snapshot(): World {
    return this.world;
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
  /**
   * Starts a word rising from a spot on the ice (in metres): a shouted word of some kind, on a comic burst,
   * or (with no kind) the name of an item coming into force. The oldest gives way when there are too many.
   */
  private floatWord(text: string, x: number, y: number, kind: FloatKind | null): void {
    if (this.floats.length >= look.floatWords.most) this.floats.shift();
    // A shouted word is put on the side of the player away from the puck, so the play is not hidden.
    const way = kind ? awayFrom({ x, y }, this.world.puck.pos, look.floatWords.upBias) : { x: 0, y: -1 };
    this.floats.push({ text, x, y, age: 0, kind, way });
  }

  /** The jagged shape for these words: worked out once and kept. */
  private burstFor(words: string, spec: { spikes: number; depth: number; jitter: number }): [number, number][] {
    let shape = this.burstShapes.get(words);
    if (!shape) {
      shape = burstPoints(words, spec.spikes, spec.depth, spec.jitter);
      this.burstShapes.set(words, shape);
    }
    return shape;
  }

  /** A comic burst: its hard shadow, its ink edge, then its colour. `size` is the height of the letters on it. */
  private drawBurst(g: Phaser.GameObjects.Graphics, shape: readonly [number, number][], x: number, y: number, rx: number, ry: number, size: number, fill: string, spec: { tilt: number; edge: number; shadow: number; ink: string }, alpha: number): void {
    const edge = size * spec.edge;
    const drop = size * spec.shadow;
    g.fillStyle(colour(spec.ink), alpha);
    g.fillPoints(placed(shape, x + drop, y + drop, rx + edge, ry + edge, spec.tilt) as Phaser.Math.Vector2[], true);
    g.fillPoints(placed(shape, x, y, rx + edge, ry + edge, spec.tilt) as Phaser.Math.Vector2[], true);
    g.fillStyle(colour(fill), alpha);
    g.fillPoints(placed(shape, x, y, rx, ry, spec.tilt) as Phaser.Math.Vector2[], true);
  }

  /** Moves the rising words on and puts them on the screen, each shouted word on its burst. */
  private drawFloats(real: number): void {
    const fw = look.floatWords;
    const B = fw.burst;
    this.floats = this.floats.filter((w) => (w.age += real) < fw.seconds);
    const size = Math.max(10, this.scale.height * fw.size);
    this.wordArt.clear();
    this.floatTexts.forEach((label, i) => {
      const w = this.floats[i];
      if (!w) {
        label.setVisible(false);
        return;
      }
      const k = w.age / fw.seconds;
      const pop = this.options.calm ? 1 : popScale(w.age, B.popSeconds, B.pop);
      label.setText(w.text);
      label.setFontSize(size * pop);
      label.setAngle(w.kind ? B.tilt : 0);
      const rx = label.width * B.wide;
      const ry = size * pop * B.tall;
      // Off to the side away from the puck (an item's name: straight above), kept inside the picture.
      const out = this.zoom * ((w.kind ? fw.away : 2.4) + fw.rise * k);
      const x = Math.max(rx, Math.min(this.scale.width - rx, this.sx(w.x) + w.way.x * out));
      const y = Math.max(this.scale.height * fw.topShare + ry, Math.min(this.scale.height - ry, this.sy(w.y) + w.way.y * out));
      // If the puck comes under it all the same, it goes faint so the play shows through.
      const puck = { x: this.sx(this.world.puck.pos.x), y: this.sy(this.world.puck.pos.y) };
      const over = w.kind !== null && covers(x, y, rx, ry, fw.clearOf, puck);
      const alpha = (k < 0.7 ? 1 : (1 - k) / 0.3) * (over ? fw.overPlay : 1);
      label.setPosition(x, y);
      label.setAlpha(alpha);
      label.setVisible(true);
      if (w.kind) {
        label.setColor(B.ink);
        label.setStroke(B.ink, 0);
        this.drawBurst(this.wordArt, this.burstFor(w.text, B), x, y, rx, ry, size, fw.fills[w.kind], B, alpha);
      } else {
        label.setColor(fw.itemColour);
        label.setStroke(B.ink, Math.max(3, size * 0.3));
      }
    });
  }

  /** Each club in a word: what it is called (the Comets), or where it is from when both are called the same. */
  private shortNames(): [string, string] {
    const last = this.options.names.map((name) => (name.split(' ').pop() ?? name).toUpperCase());
    if (last[0] !== last[1]) return [last[0] as string, last[1] as string];
    const first = this.options.names.map((name) => (name.split(' ')[0] ?? name).toUpperCase());
    return [first[0] as string, first[1] as string];
  }

  /**
   * The comic title card, when one is up: at the opening faceoff and in the break between periods.
   * Its second line is the score, or at the start the two clubs.
   */
  private titleCard(): { title: string; sub: string } | null {
    const world = this.world;
    const TC = look.titleCard;
    if (world.rules !== 'game' || this.options.lesson) return null;
    const clubs = this.shortNames();
    if (world.phase === 'break') {
      const title = world.overtime || world.period >= TC.titles.length ? TC.overtime : (TC.titles[world.period] as string);
      return { title, sub: `${clubs[0]} ${world.score[0]}  ·  ${world.score[1]} ${clubs[1]}` };
    }
    if (world.period === 1 && world.phase === 'faceoff' && !world.faceoff?.dropped && this.clock < TC.openingSeconds && world.score[0] + world.score[1] === 0) {
      return { title: TC.titles[0] as string, sub: `${clubs[0]}  v  ${clubs[1]}` };
    }
    return null;
  }

  /**
   * While a goal is celebrated, a comic panel at the side of the screen away from the scorer: the man himself
   * drawn large with his arms up, his name, and which goal of his it is.
   */
  private drawGoalPanel(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
    const world = this.world;
    const GP = look.goalPanel;
    const p = world.phase === 'goal' && this.scorer !== null && !world.shootout ? world.players[this.scorer] : undefined;
    const on = p !== undefined && this.full;
    for (const item of [this.panelName, this.panelLine, this.panelSprite]) item.setVisible(on);
    if (!p || !on) return;
    const crest = this.crests[p.team];
    const pw = width * GP.width;
    const ph = height * GP.height;
    // On the side of the screen he is not on, sliding in from off it.
    const right = this.sx(p.pos.x) < width / 2;
    const slide = this.options.calm ? 1 : Math.min(1, this.bannerAge / GP.slideSeconds);
    const rest = right ? width - GP.margin - pw : GP.margin;
    const x = rest + (1 - slide) * (right ? pw + GP.margin * 2 : -(pw + GP.margin * 2));
    const y = (height - ph) / 2 + look.topBarPixels * 0.3;
    g.fillStyle(colour(GP.ink), 0.6);
    g.fillRect(x + GP.shadow, y + GP.shadow, pw, ph);
    g.fillStyle(colour(GP.ink));
    g.fillRect(x - 3, y - 3, pw + 6, ph + 6);
    g.fillStyle(colour(crest.primary));
    g.fillRect(x, y, pw, ph);
    // Rays behind him, from where his feet are.
    g.fillStyle(colour(crest.secondary), GP.rayAlpha);
    const fx = x + pw / 2;
    const fy = y + ph * 0.72;
    for (let i = 0; i < GP.rays; i++) {
      const a = Math.PI + (i + 0.25) * (Math.PI / GP.rays);
      const b = a + Math.PI / GP.rays / 2;
      const reach = ph;
      const clip = (px: number, py: number): [number, number] => [Math.max(x, Math.min(x + pw, px)), Math.max(y, Math.min(y + ph, py))];
      const [ax, ay] = clip(fx + Math.cos(a) * reach, fy + Math.sin(a) * reach);
      const [bx, by] = clip(fx + Math.cos(b) * reach, fy + Math.sin(b) * reach);
      g.fillTriangle(fx, fy, ax, ay, bx, by);
    }
    // The caption box across the foot of the panel.
    const capH = ph * 0.26;
    g.fillStyle(colour(GP.ink));
    g.fillRect(x, y + ph - capH - 2, pw, 2);
    g.fillStyle(colour(GP.caption));
    g.fillRect(x, y + ph - capH, pw, capH);

    // The man himself, painted once at this size.
    const mascot = isMascot(world, p);
    const own = this.options.looks?.[p.team]?.[p.id - p.team * 7];
    const who: FigureLook = mascot ? { hair: 'bald', beard: 'none', build: 'heavy', mark: 'mascot', costume: mascotKind(this.options.names[p.team]) } : (own ?? PLAIN_LOOK);
    const tall = ph * GP.figure;
    const pixels = Math.max(8, Math.round((tall / FIGURE_BOX.height) * 2));
    const key = `goal-panel-${p.id}-${mascot ? 'm' : 's'}-${pixels}`;
    if (key !== this.panelKey) {
      if (this.panelKey && this.textures.exists(this.panelKey)) this.textures.remove(this.panelKey);
      const canvas = document.createElement('canvas');
      const skin = own?.skin ?? skinTone(p.id);
      paintFigure(canvas, figure({ ...STANDING, cheer: true, pattern: crest.pattern }, who).shapes, figureColours(crest, false, skin, this.options.whiteTeam === p.team ? 'away' : 'home', own?.hairColour, who.costume), pixels);
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
      this.panelKey = key;
    }
    this.panelSprite.setTexture(key).setDisplaySize((tall * FIGURE_BOX.width) / FIGURE_BOX.height, tall).setPosition(fx, y + ph - capH + tall * (1 - FIGURE_BOX.feetY / FIGURE_BOX.height));
    const names = this.options.playerNames;
    const name = mascot ? (this.mascotName(p.team) ?? 'The mascot') : (names?.[p.team]?.[p.id % 7] ?? this.options.names[p.team]);
    this.panelName.setText(name.toUpperCase()).setFontSize(Math.max(11, height * GP.nameSize));
    if (this.panelName.width > pw - 8) this.panelName.setFontSize((Math.max(11, height * GP.nameSize) * (pw - 8)) / this.panelName.width);
    this.panelName.setPosition(fx, y + ph - capH * 0.64);
    const count = p.stats.goals;
    this.panelLine.setText(mascot ? GP.mascot : (GP.words[count - 1] ?? GP.more)).setFontSize(Math.max(8, height * GP.lineSize));
    if (this.panelLine.width > pw - 8) this.panelLine.setFontSize((Math.max(8, height * GP.lineSize) * (pw - 8)) / this.panelLine.width);
    this.panelLine.setPosition(fx, y + ph - capH * 0.26);
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
    this.effects.drawUnder(this.ice, this.view, { length: t.rink.length, width: t.rink.width, periodSeconds: t.period.seconds });
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
    const v = this.venue;
    const tier = arena.rowGap * 3;
    if (v.wall) {
      // A smaller building: the wall behind the seats, planked or plain, and the seating only as deep as its rows.
      g.fillStyle(colour(v.wall));
      g.fillRect(0, look.topBarPixels, width, height - look.topBarPixels);
      if (v.plankGap > 0) {
        g.lineStyle(1, colour(v.standsEdge), v.plankAlpha);
        for (let x = v.plankGap / 2; x < width; x += v.plankGap) g.lineBetween(x, look.topBarPixels, x, height);
      }
      const deep = arena.firstRowOffset + v.rows * arena.rowGap;
      g.fillStyle(colour(v.stands));
      g.fillRoundedRect(left - deep, topEdge - deep, w + deep * 2, h + deep * 2, corner + deep);
    } else {
      g.fillStyle(colour(v.stands));
      g.fillRect(0, look.topBarPixels, width, height - look.topBarPixels);
    }
    for (let i = Math.min(3, Math.ceil(v.rows / 3)); i >= 1; i--) {
      g.lineStyle(tier, colour(v.standsEdge), 0.35);
      const d = tier * i - tier / 2 + arena.firstRowOffset * 0.5;
      g.strokeRoundedRect(left - d, topEdge - d, w + d * 2, h + d * 2, corner + d);
    }
    const CA = this.comic;
    // A comic's printed dots across the stands, outside the boards.
    if (CA.dots > 0 && this.full) {
      const pad = Math.max(4, look.boardWidth * z * 1.2) * 2;
      g.fillStyle(colour(v.standsEdge), look.comicArena.dotAlpha);
      const size = look.comicArena.dotSize;
      for (let y = look.topBarPixels + CA.dots / 2, row = 0; y < height; y += CA.dots * 0.87, row++) {
        const inY = y > topEdge - pad && y < topEdge + h + pad;
        for (let x = (row % 2) * CA.dots * 0.5; x < width; x += CA.dots) {
          if (inY && x > left - pad && x < left + w + pad) continue;
          g.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
    }
    this.crowd.layout(left, topEdge, w, h, corner, width, height, look.topBarPixels);
    this.crowd.draw(g, this.clock, this.effects.excitement, this.effects.cheering, [this.teamColour(0), this.teamColour(1)], !this.full, this.options.calm === true, crowdMoods(this.world.score));
    // The signs: a board on a stick over the holder's head, lettered by a text of its own. Their side's are up
    // and bouncing when it scores; the rest are held a little lower.
    const SG = look.signs;
    for (const [k, text] of this.signTexts.entries()) {
      // Each text belongs to a side; it takes the next sign that side's fans are holding.
      const post = this.crowd.signs.filter((sign) => sign.team === k % 2)[k >> 1];
      text.setVisible(post !== undefined && this.full);
      if (!post || !this.full) continue;
      const cy = post.y - SG.lift - (post.up ? SG.jump : 0);
      const bw = text.width + SG.padX * 2;
      const bh = text.height + SG.padY * 2;
      g.lineStyle(1.5, colour(SG.ink));
      g.lineBetween(post.x, post.y, post.x, cy);
      g.fillStyle(colour(SG.ink));
      g.fillRect(post.x - bw / 2 - 1.5, cy - bh / 2 - 1.5, bw + 3, bh + 3);
      g.fillStyle(colour(SG.fill));
      g.fillRect(post.x - bw / 2, cy - bh / 2, bw, bh);
      text.setPosition(post.x, cy);
    }
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

    // A hard shadow under the whole rink, as a comic panel has.
    const CA = this.comic;
    const outer = Math.max(4, look.boardWidth * z * 1.2) * 1.9;
    if (CA.hard > 0) {
      g.fillStyle(colour(look.comicArena.inkColour), look.comicArena.hardAlpha);
      g.fillRoundedRect(this.sx(-hx) - outer + CA.hard, this.sy(-hy) - outer + CA.hard, t.rink.length * z + outer * 2, t.rink.width * z + outer * 2, corner + outer);
    }
    // Ice, with the neutral zone a shade darker so the zones read at a glance.
    g.fillStyle(colour(this.venue.ice));
    g.fillRoundedRect(this.sx(-hx), this.sy(-hy), t.rink.length * z, t.rink.width * z, corner);
    g.fillStyle(colour(this.venue.iceZone));
    g.fillRect(this.sx(-blue), this.sy(-hy), blue * 2 * z, t.rink.width * z);

    // Lighting: soft pools of light over the middle of the sheet.
    for (const [share, alpha] of this.venue.lightPools) {
      if (alpha <= 0) continue;
      g.fillStyle(colour(c.light), alpha);
      g.fillEllipse(this.sx(0), this.sy(0), t.rink.length * z * share, t.rink.width * z * share * 0.92);
    }
    // Hanging lamps down the middle of a small rink: a pool of light under each, the ice duller between them.
    for (let k = 0; k < this.venue.lamps; k++) {
      const x = -hx + ((k + 0.5) / this.venue.lamps) * t.rink.length;
      const size = t.rink.width * z * this.venue.lampSize;
      g.fillStyle(colour(c.light), this.venue.lampAlpha);
      g.fillEllipse(this.sx(x), this.sy(0), size, size * 1.25);
      g.fillEllipse(this.sx(x), this.sy(0), size * 0.55, size * 0.7);
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
    const panels = this.venue.teamPanels ? [look.colours.boards, this.teamColour(0), look.colours.boards, this.teamColour(0), look.colours.boards, this.teamColour(1)] : [look.colours.boards];
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
    // Depth: the far boards stand over the ice and shade a strip of it; a yellow kick plate runs round their foot.
    const RD = look.rinkDetail;
    g.fillStyle(colour(c.boardShade), RD.boardShadeAlpha);
    g.fillRect(this.sx(-hx) + corner, this.sy(-hy), t.rink.length * z - corner * 2, RD.boardShade * z);
    const plate = Math.max(1, RD.kickPlate * z);
    g.lineStyle(plate, colour(c.kickPlate), 0.9);
    g.strokeRoundedRect(this.sx(-hx) + plate, this.sy(-hy) + plate, t.rink.length * z - plate * 2, t.rink.width * z - plate * 2, Math.max(0, corner - plate));

    // Glass above the boards: a pale band outside them, with a few glints of light along the top and bottom.
    const pane = wall * 0.9;
    g.lineStyle(pane, colour(c.glass), look.glassAlpha);
    g.strokeRoundedRect(this.sx(-hx) - wall * 0.5 - pane * 0.5, this.sy(-hy) - wall * 0.5 - pane * 0.5, t.rink.length * z + wall + pane, t.rink.width * z + wall + pane, corner + wall);
    g.lineStyle(Math.max(1, pane * 0.3), colour(c.glass), look.glassAlpha * 2.6);
    for (let k = 0; k < look.glassGlints; k++) {
      const gx0 = this.sx(-hx + corner / z + ((k + 0.5) / look.glassGlints) * (t.rink.length - (2 * corner) / z));
      for (const edge of [this.sy(-hy) - wall * 0.5 - pane * 0.5, this.sy(hy) + wall * 0.5 + pane * 0.5]) g.lineBetween(gx0 - pane * 1.6, edge, gx0 + pane * 0.4, edge);
    }

    // Ink: a heavy line round the outside of the glass and a finer one where the boards meet the ice.
    if (CA.ink > 0) {
      g.lineStyle(CA.ink, colour(look.comicArena.inkColour));
      g.strokeRoundedRect(this.sx(-hx) - outer, this.sy(-hy) - outer, t.rink.length * z + outer * 2, t.rink.width * z + outer * 2, corner + outer);
      g.lineStyle(Math.max(1, CA.ink * 0.5), colour(look.comicArena.inkColour), 0.85);
      g.strokeRoundedRect(this.sx(-hx) - 0.5, this.sy(-hy) - 0.5, t.rink.length * z + 1, t.rink.width * z + 1, corner);
    }
    // Printed dots shading the ice along the near boards, smaller the further out they are.
    if (CA.iceDots > 0 && this.full) {
      const rowsOf = look.comicArena.iceDotRows;
      g.fillStyle(colour(c.iceShade), look.comicArena.iceDotAlpha);
      for (let k = 0; k < rowsOf; k++) {
        const y = this.sy(hy) - plate * 2 - (k + 0.5) * CA.iceDots * 0.87;
        const r = (CA.iceDots * 0.34 * (rowsOf - k)) / rowsOf;
        for (let x = this.sx(-hx) + corner * 0.6 + (k % 2) * CA.iceDots * 0.5; x < this.sx(hx) - corner * 0.6; x += CA.iceDots) g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    // The posts that hold the glass, along the straights.
    if (this.full) {
      g.lineStyle(Math.max(1, wall * 0.16), colour(c.rail), RD.glassPostAlpha);
      for (let x = -straight; x <= straight + 0.01; x += RD.glassPosts) {
        for (const [edge, dir] of [[this.sy(-hy) - wall * 0.5, -1], [this.sy(hy) + wall * 0.5, 1]] as const) g.lineBetween(this.sx(x), edge, this.sx(x), edge + dir * pane);
      }
    }

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
      // The mesh: a lattice of cord across the top of the net, seen from above.
      const mouth = t.net.mouthWidth / 2;
      const back = out * (gx + t.net.depth);
      g.lineStyle(Math.max(1, line * 0.5), colour(c.net), look.rinkDetail.meshAlpha);
      for (let y = -mouth + look.rinkDetail.meshGap; y < mouth - 0.01; y += look.rinkDetail.meshGap) g.lineBetween(this.sx(out * gx), this.sy(y), this.sx(bx(back)), this.sy(y));
      for (let k = look.rinkDetail.meshGap; k < t.net.depth - 0.01; k += look.rinkDetail.meshGap) g.lineBetween(this.sx(out * (gx + k)), this.sy(-mouth), this.sx(out * (gx + k)), this.sy(mouth));
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
    // The lights come up as the game begins: a dark veil over the building that lifts in the first moments.
    if (this.full && this.clock < look.openingLightSeconds) {
      const left = 1 - this.clock / look.openingLightSeconds;
      this.top.fillStyle(colour(FIG.colours.outline), look.openingDark * left * left);
      this.top.fillRect(0, 0, this.scale.width, this.scale.height);
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
    // The spare line sits on its bench, behind the boards by its door: a row of helmets in the team's colour.
    for (const team of [0, 1] as const) {
      const spare = world.players.filter((p) => p.team === team && p.role === 'skater' && !p.onIce);
      const door = benchDoor(team, t);
      const white = this.options.whiteTeam === team;
      spare.forEach((p, k) => {
        const bx = this.sx(door.x + (k - (spare.length - 1) / 2) * look.benchGap);
        const r = look.benchHead * z;
        // Their side has just scored: the bench is on its feet.
        const scoredBy = world.phase === 'goal' && this.scorer !== null ? world.players[this.scorer]?.team : undefined;
        const up = scoredBy === team ? Math.abs(Math.sin(this.clock * 11 + k * 1.7)) * r * fx.benchJump : 0;
        const by = this.sy(-t.rink.width / 2) - look.benchBehind * z - up;
        g.fillStyle(colour(FIG.colours.outline));
        g.fillCircle(bx, by, r + Math.max(1, r * 0.18));
        g.fillStyle(colour(this.options.looks?.[team]?.[p.id - team * 7]?.skin ?? skinTone(p.id)));
        g.fillCircle(bx, by + r * 0.25, r * 0.85);
        g.fillStyle(colour(lighten(this.crests[team].primary, white ? FIG.awayKit.helmetLighten : FIG.helmetLighten)));
        g.fillCircle(bx, by - r * 0.12, r * 0.92);
        g.fillStyle(colour(white ? this.crests[team].primary : this.crests[team].secondary));
        g.fillRect(bx - r * 0.7, by - r * 0.55, r * 1.4, Math.max(1, r * 0.22));
      });
    }
    for (const [i, p] of world.players.entries()) {
      const label = this.labels[i];
      const number = this.numbers[i];
      if (!p.onIce) {
        label?.setVisible(false);
        number?.setVisible(false);
        this.sprites[i]?.setVisible(false);
        this.sides.delete(p.id);
        this.views.delete(p.id);
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
      const sideBefore = this.sides.get(p.id);
      const side = facingSide(p.facing, sideBefore);
      this.sides.set(p.id, side);
      // Skating down or up the rink he is seen from the front or from behind; a goalie is always side-on.
      const viewBefore = this.views.get(p.id);
      const view: Seen = goalie ? 'side' : viewOf(p.facing, viewBefore);
      this.views.set(p.id, view);
      // A turn (to the other side, or from one view to another) is drawn as a quick squeeze, not one sudden change.
      if ((sideBefore !== undefined && sideBefore !== side) || (viewBefore !== undefined && viewBefore !== view)) this.turnedAt.set(p.id, this.clock);
      const acting = this.effects.action.get(p.id)?.kind;
      // A glove save keeps him on his feet with the glove up; any other save puts the pads down.
      const down = goalie && acting !== 'glove' && acting !== 'kick' && (this.effects.padsDown.get(p.id) ?? 0) > 0;
      const speed = Math.min(1, Math.hypot(p.vel.x, p.vel.y) / FIG.fullSpeed);
      const stride = this.effects.stride.get(p.id) ?? 0;
      // The pose is rounded to one of a few steps, so the same few pictures are reused instead of painting him every frame.
      // A goalie moving across his crease shuffles; otherwise he stands.
      const shuffling = goalie && !down && Math.hypot(p.vel.x, p.vel.y) >= FIG.goalie.shuffleSpeed;
      const speedStep = goalie ? (shuffling ? 1 : 0) : Math.round(speed * FIG.speedSteps);
      // Standing or gliding slowly he takes no strides, so there is one picture of it.
      const glide = !goalie && speedStep > 0 && this.effects.gliding(p.id);
      const steps = goalie ? FIG.goalie.shuffleSteps : FIG.poseSteps;
      const strideStep = speedStep === 0 || glide ? 0 : Math.round((((stride % TAU) + TAU) % TAU) / TAU * steps) % steps;
      // The stick stays up for the moment of a fake.
      const wound = !goalie && (p.fake > 0 || (p.charge > 0 && chargeFraction(p.charge, t) > FIG.windUpAt)) ? 1 : 0;
      const kneel = !goalie && braced(world, p, t);
      // The scorer throws his arms up while the goal is celebrated.
      const cheer = !goalie && world.phase === 'goal' && this.scorer === p.id;
      const scorer = this.scorer === null ? undefined : world.players[this.scorer];
      const mateCheer = !goalie && !cheer && world.phase === 'goal' && scorer !== undefined && scorer.team === p.team;
      // A goalie reads the play: easy with the puck at the other end, set as it comes, tight to his post when it is
      // behind the net or at a sharp angle close by, and sliding when he has to cross his crease in a hurry.
      const KG = FIG.goalie;
      const netX = (p.team === 0 ? -1 : 1) * goalLineX(t);
      const fromNet = Math.hypot(world.puck.pos.x - netX, world.puck.pos.y);
      const alertStep = !goalie ? 2 : fromNet <= KG.alertNear ? 2 : fromNet <= KG.alertFar ? 1 : 0;
      const beside = (Math.atan2(Math.abs(world.puck.pos.y), Math.max(0.01, Math.abs(world.puck.pos.x - netX))) * 180) / Math.PI;
      const keeperMove: Action | undefined = !goalie
        ? undefined
        : Math.hypot(p.vel.x, p.vel.y) >= KG.slideSpeed
          ? 'slide'
          : Math.abs(world.puck.pos.x) > Math.abs(netX) - KG.postX || (fromNet < KG.postRange && beside > KG.postAngle)
            ? 'post'
            : undefined;
      // What he is doing this moment, most telling first: a hit or a poke thrown, a pass made, a deke, a tired glide.
      const action: Action | undefined = goalie
        ? acting === 'glove' || acting === 'kick'
          ? acting
          : down
            ? undefined
            : acting === 'rise'
              ? 'rise'
              : keeperMove
        : cheer || mateCheer || kneel || wound
          ? undefined
          : acting === 'hit' || acting === 'poke' || acting === 'pass' || acting === 'shot' || acting === 'stop'
            ? acting
            : p.deke > 0
              ? 'deke'
              : p.energy < FIG.tiredBelow && speed < FIG.tiredSpeed
                ? 'tired'
                : undefined;
      // Who he is: his own look, or the mascot's while the mascot has his place.
      const own = this.options.looks?.[p.team]?.[p.id - p.team * 7];
      const costumed = !goalie && isMascot(world, p);
      const who: FigureLook = costumed ? { hair: 'bald', beard: 'none', build: 'heavy', mark: 'mascot', costume: mascotKind(this.options.names[p.team]) } : (own ?? PLAIN_LOOK);
      // Flat on the ice after a big hit: a pose of his own, not a standing man turned over.
      const fallen = !goalie && p.knockedDown && p.stagger > 0;
      const pose: PoseInput = {
        side: 1,
        stride: (strideStep / steps) * TAU,
        speed: speedStep / FIG.speedSteps,
        windUp: wound,
        goalie,
        down,
        ...(view !== 'side' ? { view } : {}),
        ...(fallen ? { fallen } : {}),
        tilt: 0,
        pattern: crest.pattern,
        cheer,
        mateCheer,
        kneel,
        ...(glide ? { glide } : {}),
        ...(action ? { action } : {}),
        ...(goalie && alertStep < 2 ? { alert: alertStep / 2 } : {}),
      };
      const skin = own?.skin ?? skinTone(p.id);
      const key = `figure-${p.team}-${goalie ? (down ? 'gd' : 'g') : 's'}-${skin}-${own?.hairColour ?? ''}-${lookKey(who)}-${view}-${strideStep}-${speedStep}-${wound}${cheer ? '-cheer' : ''}${mateCheer ? '-mate' : ''}${kneel ? '-kneel' : ''}${glide ? '-glide' : ''}${fallen ? '-fallen' : ''}${action ? `-${action}` : ''}${goalie ? `-a${alertStep}` : ''}`;
      if (!this.textures.exists(key)) {
        const canvas = document.createElement('canvas');
        paintFigure(canvas, figure(pose, who).shapes, figureColours(crest, goalie, skin, this.options.whiteTeam === p.team ? 'away' : 'home', own?.hairColour, who.costume), pixels);
        this.textures.addCanvas(key, canvas);
      }
      this.figureKeys.set(key, this.figureFrame);
      const fig = figure({ ...pose, side }, who);

      // His shadow on the ice marks where he really is, and how big.
      g.fillStyle(colour(c.shadow), 0.22 * alpha);
      g.fillEllipse(x, y, unit * FIG.shadowWidth * 2, unit * FIG.shadowHeight * 2);

      // A team on fire: a glow under each of its players.
      if (onFire(world, p.team)) {
        g.fillStyle(colour(c.fire), 0.3 + 0.2 * this.pulse(12, p.id));
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
        const pulse = 0.55 + 0.45 * this.pulse(30);
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
      if (world.match.practice && world.human && p.team === world.human.team && world.puck.carrier === null && world.puck.passTarget === p.id) {
        // On the practice rink: a gold ring round the man a pass is on its way to. Shoot held now is a one-timer.
        g.lineStyle(Math.max(2, unit * 0.16), colour(c.accent), 0.9);
        g.strokeEllipse(x, y, unit * 3.4, unit * 3.4 * FIG.ringSquash);
      }
      if (p === controlled && world.match.practice && world.puck.carrier !== null && world.players[world.puck.carrier]?.team !== p.team) {
        // On the practice rink: how far his poke reaches, as a circle the puck must be inside.
        const rules = checkRules(world, p, t);
        const reach = rules.pokeSureReach > 0 ? rules.pokeSureReach : t.check.pokeRange;
        g.lineStyle(Math.max(1.5, unit * 0.1), colour(RET.colour), 0.55);
        g.strokeCircle(x, y, reach * z);
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
      // Following a shot through, the blade comes up off the ice and points after the puck.
      else if (action === 'shot') end = { x: fig.hand.x + side * FIG.shotStick[0]!, y: fig.hand.y + FIG.shotStick[1]! };
      if (!end) {
        const blade = carrySpot(p, t);
        // Without the puck his stick sweeps a little with his stride.
        const sweep = this.full && world.puck.carrier !== p.id ? Math.sin(stride * 0.5) * fx.stickSweep : 0;
        end = { x: (this.sx(blade.x) - x) / unit + sweep * side, y: (this.sy(blade.y) - y) / unit };
      }
      // He tips into the way he is heading: forward down the screen, back up it. Square on to us he stays upright.
      const leans = !goalie && !fallen && !cheer && view !== 'front' && view !== 'back' && speed >= FIG.leanFromSpeed;
      const lean = leans ? Math.sin(p.facing) * side * ((FIG.leanDegrees * Math.PI) / 180) * speed : 0;
      const leanCos = Math.cos(lean);
      const leanSin = Math.sin(lean);
      // The blade stays where the puck is: the stick is laid out as if he stood straight, then turned with him.
      const upright = { x: end.x * leanCos + end.y * leanSin, y: -end.x * leanSin + end.y * leanCos };
      for (const piece of withStick(fig, upright, side)) {
        if (piece.tag !== 'stick' || piece.kind !== 'limb') continue;
        g.lineStyle(Math.max(1.5, piece.w * unit), colour(c.stick), alpha);
        // The stick turns with him when he leans.
        g.lineBetween(x + (piece.x1 * leanCos - piece.y1 * leanSin) * unit, y + (piece.x1 * leanSin + piece.y1 * leanCos) * unit, x + (piece.x2 * leanCos - piece.y2 * leanSin) * unit, y + (piece.x2 * leanSin + piece.y2 * leanCos) * unit);
      }

      const sinceTurn = this.clock - (this.turnedAt.get(p.id) ?? -Infinity);
      const squeeze = this.options.calm || sinceTurn >= FIG.front.turnSeconds ? 1 : FIG.front.turnSquash + (1 - FIG.front.turnSquash) * (sinceTurn / FIG.front.turnSeconds);
      const sprite = this.sprites[i];
      sprite
        ?.setTexture(key)
        .setOrigin(0.5, FIGURE_BOX.feetY / FIGURE_BOX.height)
        .setPosition(x, y)
        .setScale((unit / pixels) * squeeze, unit / pixels)
        .setFlipX(side === -1)
        .setRotation(p.stagger > 0 && !p.knockedDown ? FIG.staggerTilt * side : lean)
        .setAlpha(alpha)
        .setDepth(DEPTH.players + (p.pos.y + t.rink.width) / (t.rink.width * 4))
        .setVisible(true);

      // A number on his chest, when he is drawn big enough to read one.
      if (number) {
        // Seen from behind, his number is on his back, and is shown at a smaller size than the chest's.
        const onBack = view === 'back' && !fallen && unit >= FIG.backNumber.minUnit;
        const show = (unit >= look.numberMinRadius && !down) || onBack;
        number.setVisible(show);
        if (show) {
          number.setFontSize(unit * (onBack ? FIG.backNumber.size : 0.7));
          number.setPosition(x, y - unit * (onBack ? FIG.backNumber.height : FIG.numberHeight));
          number.setDepth(DEPTH.players + 0.9);
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

  /** Frames a second over the last ten seconds of play, and the slowest single frame among them in milliseconds; null before any play. */
  frameStats(): { fps: number; worstMs: number } | null {
    if (this.frameTimes.length < 2 || this.frameSum <= 0) return null;
    return { fps: Math.round((this.frameTimes.length * 1000) / this.frameSum), worstMs: Math.round(Math.max(...this.frameTimes)) };
  }

  /** Changes, from now on, whether control stays on player one's skater until he presses switch (the pause menu does this). */
  setHoldSwitch(on: boolean): void {
    if (this.world.human) this.world.human.hold = on;
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

  /** A panel of the heads-up display: a dark pill, or a comic's caption box with a line of ink and a hard shadow. */
  private hudBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: typeof look.hud): void {
    if (style.ink > 0) {
      const ink = colour(look.hud.inkColour);
      g.fillStyle(ink, 0.6);
      g.fillRect(x + style.shadow, y + style.shadow, w, h);
      g.fillStyle(ink);
      g.fillRect(x - style.ink * 0.7, y - style.ink * 0.7, w + style.ink * 1.4, h + style.ink * 1.4);
      g.fillStyle(colour(style.bar), style.barAlpha);
      g.fillRect(x, y, w, h);
      return;
    }
    g.fillStyle(colour(style.bar), style.barAlpha);
    g.fillRoundedRect(x, y, w, h, h / 2);
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
    // How the scoreboard and the bars are inked: as plain panels, or as a comic's caption boxes.
    const HS = look.hud;
    const inkHex = colour(look.hud.inkColour);
    if (HS.ink > 0) {
      g.fillStyle(inkHex, 0.6);
      g.fillRect(left + HS.shadow, y0 + HS.shadow, boardW, boardH);
      g.fillStyle(inkHex);
      g.fillRect(left - HS.ink, y0 - HS.ink + 1, boardW + HS.ink * 2, boardH + HS.ink * 2 - 2);
    }
    g.fillStyle(colour(HS.mid));
    g.fillRoundedRect(left, y0, boardW, boardH, HS.round);
    // The name blocks: square-ended, or cut on the slant toward the middle.
    const cut = boardH * HS.slant;
    g.fillStyle(colour(this.teamColour(0)));
    if (cut > 0) g.fillPoints([{ x: left, y: y0 }, { x: left + nameW + cut / 2, y: y0 }, { x: left + nameW - cut / 2, y: y0 + boardH }, { x: left, y: y0 + boardH }] as Phaser.Math.Vector2[], true);
    else g.fillRoundedRect(left, y0, nameW, boardH, { tl: HS.round, bl: HS.round, tr: 0, br: 0 });
    g.fillStyle(colour(this.teamColour(1)));
    if (cut > 0) g.fillPoints([{ x: left + boardW - nameW + cut / 2, y: y0 }, { x: left + boardW, y: y0 }, { x: left + boardW, y: y0 + boardH }, { x: left + boardW - nameW - cut / 2, y: y0 + boardH }] as Phaser.Math.Vector2[], true);
    else g.fillRoundedRect(left + boardW - nameW, y0, nameW, boardH, { tl: 0, bl: 0, tr: HS.round, br: HS.round });
    if (HS.ink > 0) {
      // A line of ink where each name block meets the middle.
      g.lineStyle(Math.max(1, HS.ink * 0.7), inkHex);
      g.lineBetween(left + nameW + cut / 2, y0, left + nameW - cut / 2, y0 + boardH);
      g.lineBetween(left + boardW - nameW + cut / 2, y0, left + boardW - nameW - cut / 2, y0 + boardH);
    } else {
      g.lineStyle(1, colour(c.panelLine));
      g.strokeRoundedRect(left, y0, boardW, boardH, HS.round);
    }

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
        score.setColor(HS.score);
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
    this.clockTextObject.setColor(lastSeconds ? c.danger : HS.clock);
    this.clockTextObject.setFontSize(Math.max(11, boardH * 0.5) * (lastSeconds ? 1 + 0.12 * Math.sin(this.clock * 10) : 1));
    // The periods as pips under the clock: filled for the ones played and the one being played.
    if (!world.shootout && !world.match.firstTo) {
      const pipR = Math.max(1.6, boardH * 0.07);
      const gap = pipR * 3.4;
      const cx = left + nameW + scoreW + midW / 2;
      for (let k = 0; k < t.period.count; k++) {
        const on = k < world.period;
        g.fillStyle(colour(on ? HS.clock : c.panelLine), on ? 1 : 0.9);
        g.fillCircle(cx + (k - (t.period.count - 1) / 2) * gap, y0 + boardH - pipR - 2.5, pipR);
      }
    }

    // Momentum: a strip along the bottom of each team's name, bright and full while it is on fire.
    for (const team of [0, 1] as const) {
      const burning = onFire(world, team);
      const share = burning ? 1 : world.teams[team].heat;
      const barX = team === 0 ? left : left + boardW - nameW;
      g.fillStyle(colour(burning ? c.fire : c.accent), burning ? 0.7 + 0.3 * this.pulse(12) : 0.9);
      g.fillRect(team === 0 ? barX : barX + nameW * (1 - share), y0 + boardH - 3, nameW * share, 3);
    }

    // Pulling the goalie: a prompt when it is allowed, and a reminder while the net is empty.
    const humanTeam = world.human ? world.human.team : null;
    const prompt =
      humanTeam === null
        ? ''
        : this.lesson
          ? lessonLine(this.lesson, this.reader.device())
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
      // The lesson's line is what the screen is for: it is drawn larger than a hint.
      this.pullText.setFontSize(Math.max(10, height * (this.lesson ? LESSON_TIMING.lineSize : 0.034)));
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
      this.hudBox(g, startX, barY - 6, total + 4, barH + 12, HS);
      bars.forEach((bar, i) => {
        const label = this.barLabels[i];
        if (label) {
          label.setColor(bar.ringed ? HS.barOn : HS.barText);
          label.setPosition(x, barY + barH / 2);
          x += label.width + barH * 0.6;
        }
        const r = HS.ink > 0 ? 0 : barH / 2;
        g.fillStyle(colour(HS.barBack));
        g.fillRoundedRect(x, barY, bar.width, barH, r);
        g.fillStyle(colour(bar.colour));
        g.fillRoundedRect(x + (HS.ink > 0 ? 1 : 0), barY + (HS.ink > 0 ? 1 : 0), Math.max(barH, bar.width * bar.fill) - (HS.ink > 0 ? 2 : 0), barH - (HS.ink > 0 ? 2 : 0), r);
        if (bar.ringed) {
          g.lineStyle(HS.ink > 0 ? 2 : 1.5, colour(HS.ink > 0 ? c.danger : c.controlRing));
          g.strokeRoundedRect(x - 2, barY - 2, bar.width + 4, barH + 4, HS.ink > 0 ? 0 : (barH + 4) / 2);
        }
        x += bar.width + barH * 1.6;
      });
    } else {
      for (const label of this.barLabels) label.setText('');
    }

    // Bottom right: the powerup on each button, and any boost that is running.
    const mine = world.human ? world.teams[world.human.team] : null;
    if (mine) {
      const buttons = ['LT', 'RB'].map((button, slot) => {
        const wait = mine.powerupWait[slot] ?? 0;
        const running = mine.boosts.some((b) => b.id === mine.powerups[slot]?.id);
        // A recharging powerup counts down to ready once its boost has ended.
        return `${button} ${mine.powerups[slot]?.name ?? '—'}${wait > 0 && !running ? ` ${Math.ceil(wait)}s` : ''}`;
      });
      // What is in force now: timed boosts with their seconds, and the artifacts whose moment it is.
      const running = [...mine.boosts.map((b) => `${b.name} ${Math.ceil(b.secondsLeft)}s`), ...activeLabels(world, world.human!.team)];
      this.powerText.setFontSize(fontSize);
      this.powerText.setText([...running, ...buttons].join('    ').toUpperCase());
      this.powerText.setColor(running.length > 0 ? (HS.ink > 0 ? HS.barOn : c.charge) : HS.barText);
      const px = width - look.marginPixels - 12;
      this.powerText.setPosition(px, barY + barH / 2);
      this.hudBox(g, px - this.powerText.width - 10, barY - 6, this.powerText.width + 20, barH + 12, HS);
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
    const card = this.titleCard();
    this.cardSub.setVisible(card !== null);
    this.drawGoalPanel(g, width, height);
    if (card) {
      // A comic's title card: the period in big letters on a slanted band, and the score under it.
      const TC = look.titleCard;
      const pop = this.full && !this.options.calm ? popScale(this.bannerAge, TC.popSeconds, TC.pop) : 1;
      const cw = width * TC.width * pop;
      const ch = height * TC.height * pop;
      const cx = width / 2;
      const cy = this.originY;
      const tilt = (TC.tilt * Math.PI) / 180;
      const corner = (dx: number, dy: number, grow = 0, ox = 0, oy = 0): Phaser.Math.Vector2 => {
        const px = dx * (cw / 2 + grow);
        const py = dy * (ch / 2 + grow);
        return { x: cx + ox + px * Math.cos(tilt) - py * Math.sin(tilt), y: cy + oy + px * Math.sin(tilt) + py * Math.cos(tilt) } as Phaser.Math.Vector2;
      };
      const box = (grow: number, ox = 0, oy = 0, top = -1, bottom = 1): Phaser.Math.Vector2[] => [corner(-1, top, grow, ox, oy), corner(1, top, grow, ox, oy), corner(1, bottom, grow, ox, oy), corner(-1, bottom, grow, ox, oy)];
      g.fillStyle(colour(TC.ink), 0.6);
      g.fillPoints(box(3, TC.shadow, TC.shadow), true);
      g.fillStyle(colour(TC.ink));
      g.fillPoints(box(3), true);
      g.fillStyle(colour(TC.fill));
      g.fillPoints(box(0), true);
      g.fillStyle(colour(TC.band));
      g.fillPoints(box(0, 0, 0, -1, 0.22), true);
      this.bigText.setText(card.title);
      this.bigText.setFontSize(Math.max(18, height * TC.titleSize * pop));
      this.bigText.setAngle(TC.tilt);
      this.bigText.setColor(TC.ink);
      this.bigText.setStroke(TC.ink, 0);
      this.bigText.setPosition(cx + Math.sin(tilt) * ch * 0.2, cy - Math.cos(tilt) * ch * 0.2);
      this.bigText.setVisible(true);
      this.cardSub.setText(card.sub);
      this.cardSub.setFontSize(Math.max(11, height * TC.subSize * pop));
      this.cardSub.setAngle(TC.tilt);
      this.cardSub.setPosition(cx - Math.sin(tilt) * ch * 0.3, cy + Math.cos(tilt) * ch * 0.3);
    } else if (message !== '') {
      const goal = world.phase === 'goal';
      const size = Math.max(18, height * (goal ? look.goalBannerSize : 0.07));
      this.bigText.setFontSize(size);
      this.bigText.setText(message);
      // The goal banner sits in the upper part of the rink, clear of the scorer and the net-front.
      const cy = this.originY - t.rink.width * this.zoom * (goal ? look.goalBannerLift : 0.3);
      if (goal) {
        // A comic burst in the scoring team's colour, with rays behind it, that lands with a bump.
        const GB = look.goalBurst;
        const scorer = this.effects.cheering;
        const pop = this.full && !this.options.calm ? popScale(this.bannerAge, GB.popSeconds, GB.pop) : 1;
        const fill = scorer === null ? c.accent : this.crests[scorer].primary;
        const second = scorer === null ? c.text : this.crests[scorer].secondary;
        this.bigText.setFontSize(size * pop);
        this.bigText.setAngle(GB.tilt);
        this.bigText.setColor('#ffffff');
        this.bigText.setStroke(GB.ink, Math.max(4, size * GB.stroke));
        // The crest sits to the left of the word, inside the burst.
        const crestRoom = scorer === null ? 0 : size * 1.2 * pop;
        const cx = width / 2;
        this.bigText.setPosition(cx + crestRoom / 2, cy);
        const rx = (this.bigText.width + crestRoom) * GB.wide + size * 0.5 * pop;
        const ry = size * pop * GB.tall;
        if (this.full) {
          // Rays out from behind the burst, as far as the boards.
          g.fillStyle(colour(second), GB.rayAlpha);
          const reach = width * 0.6 * pop;
          for (let i = 0; i < GB.rays; i++) {
            const a = (i / GB.rays) * TAU + (GB.tilt * Math.PI) / 180;
            g.fillTriangle(cx, cy, cx + Math.cos(a - GB.rayWidth) * reach, cy + Math.sin(a - GB.rayWidth) * reach * 0.45, cx + Math.cos(a + GB.rayWidth) * reach, cy + Math.sin(a + GB.rayWidth) * reach * 0.45);
          }
        }
        const shape = this.burstFor('GOAL!', GB);
        this.drawBurst(g, shape, cx, cy, rx * 1.08, ry * 1.12, size, second, GB, 1);
        g.fillStyle(colour(fill));
        g.fillPoints(placed(shape, cx, cy, rx, ry, GB.tilt) as Phaser.Math.Vector2[], true);
        if (scorer !== null) drawCrest(g, this.crests[scorer], cx - this.bigText.width / 2 - crestRoom / 2 + size * 0.1, cy, size * 1.05 * pop);
      } else {
        // Anything else is said in a caption box, as the narrator of a comic speaks.
        const CAP = look.caption;
        this.bigText.setAngle(0);
        this.bigText.setStroke(CAP.ink, 0);
        this.bigText.setPosition(width / 2, cy);
        const w = this.bigText.width + size * 1.4;
        const h = size * 1.6;
        g.fillStyle(colour(CAP.ink));
        g.fillRect(width / 2 - w / 2 + size * CAP.shadow, cy - h / 2 + size * CAP.shadow, w, h);
        g.fillRect(width / 2 - w / 2 - size * CAP.edge, cy - h / 2 - size * CAP.edge, w + size * CAP.edge * 2, h + size * CAP.edge * 2);
        g.fillStyle(colour(CAP.fill));
        g.fillRect(width / 2 - w / 2, cy - h / 2, w, h);
        this.bigText.setColor(CAP.ink);
      }
    }
  }
}
