import * as Phaser from 'phaser';
import { render } from 'preact';
import type { DressedTeam } from '../core/matchup';
import look from '../data/rinkLook.json';
import seasonRules from '../data/season.json';
import { gameAudio } from '../game/audio';
import type { Controls } from '../game/input';
import { RinkScene } from '../game/RinkScene';
import type { GameResult } from '../sim/match';
import type { PowerupSpec } from '../sim/modifiers';
import { GameSummary } from './GameSummary';
import { loadPrefs } from './prefs';
import { TouchControls } from './TouchControls';
import { TuningPanel } from './TuningPanel';
import { tuningStore } from './tuningStore';

const panel = document.getElementById('panel') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const tuneButton = document.getElementById('tune') as HTMLElement;
const summary = document.getElementById('summary') as HTMLElement;
const touch = document.getElementById('touch-root') as HTMLElement;

let wired = false;

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
  tuneButton.addEventListener('click', () => tuningStore.toggle());
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
}

/**
 * Plays one game on the ice between two dressed teams.
 * Calls `onDone` with the result once the player leaves the summary screen.
 */
export function playMatch({ home, away, level, powerups, homeColour, awayColour }: MatchOptions, onDone: (result: GameResult) => void): void {
  wireTuningPanel();
  const shift = tuningStore.tuning.game.opponentDifficulty - seasonRules.defaultDifficulty;
  const opponentLevel = level === undefined ? null : Math.max(0, Math.min(1, level + shift));
  document.body.className = 'mode-rink';
  if (tuningStore.open) tuningStore.toggle();

  // The on-screen controls show once the screen is touched, and step aside for a controller or keyboard.
  let touchHidden = false;
  render(<TouchControls hidden={touchHidden} />, touch);
  const onControls = (controls: Controls): void => {
    hint.hidden = controls.hasPad || controls.hasKeyboard || controls.hasTouch;
    const hide = controls.hasPad || controls.hasKeyboard;
    if (hide !== touchHidden) {
      touchHidden = hide;
      render(<TouchControls hidden={touchHidden} />, touch);
    }
    if (controls.menuPressed) tuningStore.toggle();
    if (!tuningStore.open) return;
    if (controls.navY !== 0) tuningStore.select(tuningStore.selected + controls.navY);
    if (controls.navX !== 0) tuningStore.adjust(tuningStore.selected, controls.navX);
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: look.colours.background,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: new RinkScene({
      // The clock only picks which game this is; the game itself replays exactly from its seed.
      seed: String(Date.now()),
      teams: [home.setup, away.setup],
      names: [home.name, away.name],
      levels: [null, opponentLevel],
      powerups: powerups ?? [],
      ...(homeColour ? { homeColour } : {}),
      ...(awayColour ? { awayColour } : {}),
      detail: loadPrefs().detail,
      tuning: () => tuningStore.tuning,
      onControls,
      onEvents: (events, world, t) => gameAudio.onEvents(events, world, t),
      onFrame: (_world, _t, seconds) => gameAudio.onFrame(seconds),
      onResult: (result) => render(<GameSummary result={result} teams={[home, away]} />, summary),
      onDone: (result) => {
        render(null, summary);
        render(null, touch);
        gameAudio.stopBeds();
        if (tuningStore.open) tuningStore.toggle();
        game.destroy(true);
        onDone(result);
      },
    }),
  });
  // Local development only: lets a debugging session drive frames by hand.
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}
