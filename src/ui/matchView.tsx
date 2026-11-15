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
}

/**
 * Plays one game on the ice between two dressed teams.
 * Calls `onDone` with the result once the player leaves the summary screen.
 */
export function playMatch({ home, away, level, powerups, homeColour, awayColour, forfeitNote, userAtHome = true }: MatchOptions, onDone: (result: GameResult) => void): void {
  wireTuningPanel();
  const shift = tuningStore.tuning.game.opponentDifficulty - seasonRules.defaultDifficulty;
  const opponentLevel = level === undefined ? null : Math.max(0, Math.min(1, level + shift));
  document.body.className = 'mode-rink';
  if (tuningStore.open) tuningStore.toggle();

  // The on-screen controls show once the screen is touched, and step aside for a controller or keyboard.
  let touchHidden = false;
  let touchMode = loadPrefs().touch;
  // Hints: on or off, and how often each move has been done on this device.
  let hintsOn = loadPrefs().hints;
  // Commentary: off, text, or text read aloud.
  let commentary = loadPrefs().commentary;
  let voiceVolume = loadPrefs().sound ? loadPrefs().volume : 0;
  const lastName = (name: string): string => name.split(' ').slice(-1)[0] ?? name;
  const hintCounts = loadHintCounts();
  const showTouch = (): void => render(<TouchControls hidden={touchHidden} mode={touchMode} />, touch);
  showTouch();

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
          {...(forfeitNote ? { endNote: forfeitNote } : {})}
          onResume={() => setPaused(false)}
          onTuning={() => {
            setPaused(false);
            if (!tuningStore.open) tuningStore.toggle();
          }}
          onEnd={() => scene.forfeit()}
          onPrefs={(prefs) => {
            touchMode = prefs.touch;
            hintsOn = prefs.hints;
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
  const pausePressed = (): void => {
    if (performance.now() - toggledAt < PAUSE_DEBOUNCE_MS) return;
    if (tuningStore.open) tuningStore.toggle();
    else setPaused(!paused);
  };
  onPauseButton = pausePressed;
  // A locked phone or a switch to another app pauses the game.
  const onHidden = (): void => {
    if (document.hidden) setPaused(true);
  };
  document.addEventListener('visibilitychange', onHidden);

  const onControls = (controls: Controls): void => {
    hint.hidden = controls.hasPad || controls.hasKeyboard || controls.hasTouch;
    const hide = controls.hasPad || controls.hasKeyboard;
    if (hide !== touchHidden) {
      touchHidden = hide;
      showTouch();
    }
    if (controls.menuPressed) pausePressed();
    if (!tuningStore.open) return;
    if (controls.navY !== 0) tuningStore.select(tuningStore.selected + controls.navY);
    if (controls.navX !== 0) tuningStore.adjust(tuningStore.selected, controls.navX);
  };

  const scene: RinkScene = new RinkScene({
      // The clock only picks which game this is; the game itself replays exactly from its seed.
      seed: String(Date.now()),
      teams: [home.setup, away.setup],
      names: [home.name, away.name],
      levels: [null, opponentLevel],
      powerups: powerups ?? [],
      ...(homeColour ? { homeColour } : {}),
      ...(awayColour ? { awayColour } : {}),
      whiteTeam: userAtHome ? 1 : 0,
      detail: loadPrefs().detail,
      playerNames: [home.players.map((p) => lastName(p.name)), away.players.map((p) => lastName(p.name))],
      commentary: () => commentary !== 'off',
      onCall: (text, priority) => {
        if (commentary === 'voice' && voiceVolume > 0) speak(text, priority, voiceVolume);
      },
      hints: () => (hintsOn ? hintCounts : null),
      onHintDone: (id) => {
        hintCounts[id] = (hintCounts[id] ?? 0) + 1;
        saveHintCounts(hintCounts);
      },
      tuning: () => tuningStore.tuning,
      onControls,
      paused: () => paused,
      onEvents: (events, world, t) => gameAudio.onEvents(events, world, t),
      onFrame: (world, t, seconds) => {
        // A one-goal game in the last period: the crowd is on its feet.
        gameAudio.tension(world.phase !== 'final' && world.period >= t.period.count && Math.abs(world.score[0] - world.score[1]) <= 1);
        gameAudio.onFrame(seconds);
      },
      onResult: (result) =>
        render(
          <GameSummary result={result} teams={[home, away]} crests={[teamCrest(home.name, homeColour ?? look.colours.teamHome), teamCrest(away.name, awayColour ?? look.colours.teamAway)]} />,
          summary,
        ),
      onDone: (result) => {
        document.removeEventListener('visibilitychange', onHidden);
        onPauseButton = null;
        paused = false;
        document.body.classList.remove('paused');
        render(null, pauseRoot);
        render(null, summary);
        render(null, touch);
        gameAudio.stopBeds();
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
