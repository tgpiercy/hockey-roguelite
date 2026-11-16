import { assistTuning, type AssistKind } from '../core/assists';
import { venueFor } from '../game/venue';
import { readGamepad } from '../game/gamepad';
import { MatchIntro, type IntroWords } from './MatchIntro';
import { rumble } from '../game/rumble';
import { teamLooks } from '../core/playerLook';
import { rinkInfo, rinkTuning, SHOOTOUT } from '../core/rinks';
import type { Tuning } from '../sim/tuning';
import type { MatchRules } from '../sim/types';
import { BALANCED, type Tactics } from '../sim/tactics';
import { music } from '../game/music';
import { resultPiece, stingFor } from '../game/musicScore';
import { hush, speak } from '../game/voice';
import * as Phaser from 'phaser';
import { render } from 'preact';
import { teamCrest } from '../core/crest';
import type { DressedTeam } from '../core/matchup';
import look from '../data/rinkLook.json';
import seasonRules from '../data/season.json';
import { gameAudio } from '../game/audio';
import type { Controls } from '../game/input';
import { RinkScene } from '../game/RinkScene';
import type { GameResult } from '../sim/match';
import type { PowerupSpec } from '../sim/modifiers';
import { GameSummary } from './GameSummary';
import { menuInput } from './menuInput';
import { PauseMenu } from './PauseMenu';
import { loadHintCounts, loadPrefs, saveHintCounts } from './prefs';
import { TouchControls } from './TouchControls';
import { TuningPanel } from './TuningPanel';
import { tuningStore } from './tuningStore';

const panel = document.getElementById('panel') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const tuneButton = document.getElementById('tune') as HTMLElement;
const summary = document.getElementById('summary') as HTMLElement;
const touch = document.getElementById('touch-root') as HTMLElement;
const pauseRoot = document.getElementById('pause') as HTMLElement;

/** How long after the pause menu opens or closes the pause key is ignored: Escape both closes the menu and is the pause key. */
const PAUSE_DEBOUNCE_MS = 300;

let wired = false;
/** What the on-screen pause button does in the game being played. */
let onPauseButton: (() => void) | null = null;

/** One-time wiring of the tuning panel, which stays available during every game. */
function wireTuningPanel(): void {
  if (wired) return;
  wired = true;
  const showPanel = (): void => {
    document.body.classList.toggle('panel-open', tuningStore.open);
    render(<TuningPanel />, panel);
  };
  tuningStore.subscribe(showPanel);
  showPanel();
  tuneButton.addEventListener('click', () => onPauseButton?.());
}

export interface MatchOptions {
  /** The human's team. */
  home: DressedTeam;
  away: DressedTeam;
  /**
   * How sharp the opponent's AI is for this game, 0 to 1. The tuning panel's difficulty shifts it up or
   * down. Left out, the tuning panel's difficulty is used as it is.
   */
  level?: number;
  /** The powerups loaded on the two buttons. */
  powerups?: (PowerupSpec | null)[];
  /** Each team's jersey colour, as "#rrggbb". */
  homeColour?: string;
  awayColour?: string;
  /** False when the human's team is on the road: it then wears white and the opponent its colour. Left out, it is a home game. */
  userAtHome?: boolean;
  /** What giving the game up costs, shown before the player confirms. Left out for a game that does not count. */
  forfeitNote?: string;
  /** A second player: 0 puts him on your team (co-op), 1 on the other team (versus). Left out, one player. */
  second?: 0 | 1;
  /** The rink to play on (rinks.json). Left out, the standard rink. */
  rink?: string;
  /** How far into the season the game is (the region, or past the last one for the playoffs), which decides the building it is played in. Not given: the standard arena. */
  stage?: number;
  /** True for a shootout in place of a game. */
  shootout?: boolean;
  /** Rules changed on top of the rink's (a season's charter). */
  rules?: MatchRules;
  /** The announcer's line as the game begins. */
  opening?: string;
  /** True for a practice in place of a game: endless, nothing settled. */
  practice?: boolean;
  /** How long a period lasts, in seconds. Left out, what the tuning says. */
  periodSeconds?: number;
  /** The share of each kind of help the first team's person gets (`core/assists.ts`). Not given: all of it. */
  assists?: Record<AssistKind, number>;
  /** Shown over the rink before the puck drops: the two teams' starters and these words. Left out, the game starts at once. */
  intro?: IntroWords;
}

/**
 * Plays one game on the ice between two dressed teams.
 * Calls `onDone` with the result once the player leaves the summary screen.
 */
export function playMatch({ home, away, level, powerups, homeColour, awayColour, forfeitNote, userAtHome = true, second, rink, shootout, rules, opening, practice, periodSeconds, intro, stage, assists }: MatchOptions, onDone: (result: GameResult) => void): void {
  wireTuningPanel();
  // The rink's own numbers sit on top of whatever the tuning panel holds; worked out again only when that changes.
  const where = rinkInfo(shootout ? null : rink);
  let tunedFrom: Tuning | null = null;
  let tuned: Tuning = tuningStore.tuning;
  const rinkTuned = (): Tuning => {
    if (tunedFrom !== tuningStore.tuning) {
      tunedFrom = tuningStore.tuning;
      tuned = rinkTuning(tuningStore.tuning, where);
      // The franchise's own length of game, on a copy: the tuning panel's numbers are left as they are.
      if (periodSeconds !== undefined && periodSeconds !== tuned.period.seconds) tuned = { ...tuned, period: { ...tuned.period, seconds: periodSeconds } };
      // The help as this franchise has it set, as shares of what the tuning gives in full.
      if (assists) tuned = assistTuning(tuned, assists);
    }
    return tuned;
  };
  const shift = tuningStore.tuning.game.opponentDifficulty - seasonRules.defaultDifficulty;
  const opponentLevel = level === undefined ? null : Math.max(0, Math.min(1, level + shift));
  document.body.className = 'mode-rink';
  if (tuningStore.open) tuningStore.toggle();
  // The menu theme stops for the game; the organ plays it in.
  music.stop();
  music.sting('organ');

  // The on-screen controls show once the screen is touched, and step aside for a controller or keyboard.
  let touchHidden = false;
  let touchMode = loadPrefs().touch;
  // Hints: on or off, and how often each move has been done on this device.
  let hintsOn = loadPrefs().hints;
  rumble.configure(loadPrefs().rumble);
  // How your linemates are told to play: from the lineup, and changeable in the pause menu for this game.
  let tactics: Tactics = home.setup.tactics ?? BALANCED;
  // Commentary: off, text, or text read aloud.
  let commentary = loadPrefs().commentary;
  let voiceVolume = loadPrefs().sound ? loadPrefs().volume : 0;
  const lastName = (name: string): string => name.split(' ').slice(-1)[0] ?? name;
  const hintCounts = loadHintCounts();
  const showTouch = (): void => render(<TouchControls hidden={touchHidden} mode={touchMode} />, touch);
  showTouch();

  // The introduction: the rink waits behind it for a few seconds, or until any press.
  let introOn = intro !== undefined;
  const introBox = document.createElement('div');
  introBox.id = 'intro';
  let introTimer = 0;
  let introPoll = 0;
  const endIntro = (): void => {
    if (!introOn) return;
    introOn = false;
    window.clearTimeout(introTimer);
    window.clearInterval(introPoll);
    window.removeEventListener('keydown', endIntro);
    window.removeEventListener('pointerdown', endIntro);
    render(null, introBox);
    introBox.remove();
  };
  if (intro) {
    document.body.append(introBox);
    render(<MatchIntro home={home} away={away} homeColour={homeColour ?? teamCrest(home.name).primary} awayColour={awayColour ?? teamCrest(away.name).primary} words={intro} />, introBox);
    introTimer = window.setTimeout(endIntro, look.introSeconds * 1000);
    // A press ends it, once it has been up long enough not to be skipped by the press that started the game.
    window.setTimeout(() => {
      if (!introOn) return;
      window.addEventListener('keydown', endIntro);
      window.addEventListener('pointerdown', endIntro);
      introPoll = window.setInterval(() => {
        if (readGamepad(0)?.buttons.some((b) => b.pressed)) endIntro();
      }, 60);
    }, look.introGraceSeconds * 1000);
  }

  // Pausing: the game freezes and the pause menu, an ordinary menu screen, opens over the rink.
  let paused = false;
  let toggledAt = 0;
  const setPaused = (on: boolean): void => {
    if (on === paused || (on && scene.over)) return;
    paused = on;
    toggledAt = performance.now();
    gameAudio.hush(on);
    if (on) hush();
    document.body.classList.toggle('paused', on);
    if (on) {
      menuInput.start();
      render(
        <PauseMenu
          frames={scene.frameStats()}
          {...(forfeitNote ? { endNote: forfeitNote } : {})}
          onResume={() => {
            menuInput.setPlayer(0);
            setPaused(false);
          }}
          onTuning={() => {
            setPaused(false);
            if (!tuningStore.open) tuningStore.toggle();
          }}
          onEnd={() => scene.forfeit()}
          tactics={tactics}
          onTactics={(next) => {
            tactics = next;
            scene.setTactics(next);
          }}
          onPrefs={(prefs) => {
            touchMode = prefs.touch;
            hintsOn = prefs.hints;
            scene.setHoldSwitch(prefs.holdSwitch);
            rumble.configure(prefs.rumble);
            commentary = prefs.commentary;
            voiceVolume = prefs.sound ? prefs.volume : 0;
            showTouch();
          }}
        />,
        pauseRoot,
      );
    } else {
      menuInput.stop();
      render(null, pauseRoot);
    }
  };
  /** The pause button or key: closes the tuning panel if that is open, otherwise pauses or resumes. */
  const pausePressed = (by: 0 | 1 = 0): void => {
    if (performance.now() - toggledAt < PAUSE_DEBOUNCE_MS) return;
    if (tuningStore.open) tuningStore.toggle();
    else {
      // Whoever pauses works the pause menu with his own controller.
      menuInput.setPlayer(paused ? 0 : by);
      setPaused(!paused);
    }
  };
  onPauseButton = () => pausePressed(0);
  // A locked phone or a switch to another app pauses the game.
  const onHidden = (): void => {
    if (document.hidden) setPaused(true);
  };
  document.addEventListener('visibilitychange', onHidden);
  // So does a controller that drops out: nobody should lose a game to a flat battery.
  const onPadGone = (): void => setPaused(true);
  window.addEventListener('gamepaddisconnected', onPadGone);

  const onControls = (controls: Controls): void => {
    hint.hidden = controls.hasPad || controls.hasKeyboard || controls.hasTouch;
    const hide = controls.hasPad || controls.hasKeyboard;
    if (hide !== touchHidden) {
      touchHidden = hide;
      showTouch();
    }
    if (controls.menuPressed) pausePressed(controls.menuPlayer ?? 0);
    if (!tuningStore.open) return;
    if (controls.navY !== 0) tuningStore.select(tuningStore.selected + controls.navY);
    if (controls.navX !== 0) tuningStore.adjust(tuningStore.selected, controls.navX);
  };

  const scene: RinkScene = new RinkScene({
      // The clock only picks which game this is; the game itself replays exactly from its seed.
      seed: String(Date.now()),
      teams: [home.setup, away.setup],
      names: [home.name, away.name],
      ...(second !== undefined ? { second } : {}),
      levels: [null, opponentLevel],
      powerups: powerups ?? [],
      ...(homeColour ? { homeColour } : {}),
      ...(awayColour ? { awayColour } : {}),
      whiteTeam: userAtHome ? 1 : 0,
      detail: loadPrefs().detail,
      playerNames: [home.players.map((p) => lastName(p.name)), away.players.map((p) => lastName(p.name))],
      looks: [teamLooks(home.players), teamLooks(away.players)],
      commentary: () => commentary !== 'off',
      onCall: (text, priority) => {
        if (commentary === 'voice' && voiceVolume > 0) speak(text, priority, voiceVolume);
      },
      hints: () => (hintsOn || practice ? hintCounts : null),
      replays: () => loadPrefs().replays,
      holdSwitch: loadPrefs().holdSwitch,
      ...(opening ? { opening } : {}),
      // The summary steps aside while the goal of the game is shown again.
      onReplay: (on) => {
        summary.style.visibility = on ? 'hidden' : '';
      },
      onHintDone: (id) => {
        hintCounts[id] = (hintCounts[id] ?? 0) + 1;
        saveHintCounts(hintCounts);
      },
      tuning: rinkTuned,
      rules: practice ? { practice: true } : shootout ? { shootout: SHOOTOUT } : { ...where.rules, ...(rules ?? {}) },
      bigPuck: loadPrefs().bigPuck,
      ...(stage !== undefined ? { venue: venueFor(stage) } : {}),
      onControls,
      paused: () => paused || introOn,
      onEvents: (events, world, t) => {
        gameAudio.onEvents(events, world, t);
        rumble.onEvents(events, world);
        const piece = stingFor(events, world.human?.team ?? 0);
        if (piece) music.sting(piece);
      },
      onFrame: (world, t, seconds) => {
        // A one-goal game in the last period: the crowd is on its feet.
        gameAudio.tension(world.phase !== 'final' && world.period >= t.period.count && Math.abs(world.score[0] - world.score[1]) <= 1);
        gameAudio.onFrame(seconds);
      },
      onResult: (result) => {
        music.sting(resultPiece(result.winner === 0));
        render(
          <GameSummary
            result={result}
            teams={[home, away]}
            crests={[teamCrest(home.name, homeColour ?? look.colours.teamHome), teamCrest(away.name, awayColour ?? look.colours.teamAway)]}
            best={(() => {
              const best = scene.goalOfTheGame();
              if (!best) return null;
              const side = best.team === 0 ? home : away;
              const who = best.scorer === null ? null : (side.players[best.scorer % 7]?.name ?? null);
              return { text: `${who ? `${who} for ${side.name}` : `${side.name}`}, to make it ${best.score[0]}-${best.score[1]}`, canWatch: best.canWatch };
            })()}
          />,
          summary,
        );
      },
      onDone: (result) => {
        document.removeEventListener('visibilitychange', onHidden);
        endIntro();
        window.removeEventListener('gamepaddisconnected', onPadGone);
        onPauseButton = null;
        paused = false;
        document.body.classList.remove('paused');
        render(null, pauseRoot);
        render(null, summary);
        summary.style.visibility = '';
        render(null, touch);
        gameAudio.stopBeds();
        menuInput.setPlayer(0);
        hush();
        music.loop('theme');
        if (tuningStore.open) tuningStore.toggle();
        game.destroy(true);
        onDone(result);
      },
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: look.colours.background,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene,
  });
  // Local development only: lets a debugging session drive frames by hand.
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}
