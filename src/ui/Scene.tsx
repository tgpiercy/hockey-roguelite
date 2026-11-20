import type { Crest } from '../core/crest';
import look from '../data/mapLook.json';
import { skinTone, STANDING, type Kit, type PoseInput } from '../game/figure';
import { CrestBadge } from './Crest';
import { FigureArt } from './FigureArt';

/**
 * Drawn scenes for the big moments of the menus, made of the same figures the rink draws: a title won, the
 * cup won, a season that ended on strikes, a step up a league, and the two teams at the end of a game.
 * All still pictures; what moves is CSS at the end of style.css (off under reduced motion and the calm setting).
 */
const S = look.scenes;

const POSE = {
  stand: STANDING,
  up: { ...STANDING, cheer: true },
  wide: { ...STANDING, cheer: true, cheerStyle: 1 },
  knees: { ...STANDING, cheer: true, cheerStyle: 2 },
  mate: { ...STANDING, mateCheer: true },
  spent: { ...STANDING, action: 'tired' },
  leaving: { ...STANDING, speed: 0.5, stride: 1.2 },
  stride: { ...STANDING, speed: 1, stride: Math.PI / 2 },
  keeper: { ...STANDING, goalie: true, alert: 0 },
} satisfies Record<string, PoseInput>;

export type PoseName = keyof typeof POSE;

/** A cup with two handles on a foot, in ink and gold. */
export function Trophy({ size = 44 }: { size?: number }) {
  return (
    <svg class="trophy" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path class="trophy-ink" d="M11 5h18v9c0 6-4 10-9 10s-9-4-9-10z M17 24h6v6h-6z M11 30h18v5H11z" />
      <path class="trophy-ink" fill="none" d="M11 8H5c0 6 3 9 7 9 M29 8h6c0 6-3 9-7 9" />
      <path class="trophy-gold" d="M12.5 6.5h15v7.5c0 5-3.3 8.5-7.5 8.5s-7.5-3.500-7.5-8.5z M18.200 24h3.600v5.500h-3.600z M12.500 31.500h15v2h-15z" />
      <path class="trophy-shine" d="M15 8.500v6c0 2 0.800 3.500 2 4.500" />
    </svg>
  );
}

/** A row of players of one club, each in a pose, drawn by the rink's own painter. */
export function FigureRow({ crest, poses, size = S.figure, kit = 'home', facing = 1, seed = 0 }: { crest: Crest; poses: readonly PoseName[]; size?: number; kit?: Kit; facing?: 1 | -1; seed?: number }) {
  return (
    <span class="scene-row">
      {poses.map((name, i) => (
        <FigureArt key={`${name}${i}`} pose={{ ...POSE[name], side: facing, pattern: crest.pattern }} crest={crest} skin={skinTone(seed + i * 5)} size={size} kit={kit} />
      ))}
    </span>
  );
}

/** Scraps of paper falling, in the club's colours. */
function Confetti() {
  return (
    <span class="scene-confetti" aria-hidden="true">
      {Array.from({ length: S.confetti }, (_, i) => (
        <i key={i} style={{ left: `${((i * 37 + 11) % 100).toFixed(0)}%`, animationDelay: `${((i * 0.23) % 1.6).toFixed(2)}s`, '--tilt': `${(i * 47) % 360}deg` }} class={`c${i % 3}`} />
      ))}
    </span>
  );
}

export type SeasonSceneKind = 'title' | 'cup' | 'out' | 'up';

/**
 * How a season ended, as a picture. `title` is the line lifting the trophy under falling paper (chosen by the owner on 2026-11-19 from three); `cup` the cup held
 * up by two of them; `out` the lights going down on a spent skater and his goalie; `up` the club skating up a league.
 */
export function SeasonScene({ kind, crest, words }: { kind: SeasonSceneKind; crest: Crest; words: string }) {
  const tint = { '--scene': crest.primary, '--scene2': crest.secondary };
  if (kind === 'title') {
    return (
      <div class="scene scene-title" style={tint}>
        <Confetti />
        <FigureRow crest={crest} poses={['mate', 'wide']} seed={1} />
        <span class="scene-lift">
          <Trophy size={S.trophy} />
          <CrestBadge crest={crest} size={26} />
        </span>
        <FigureRow crest={crest} poses={['up', 'knees']} seed={6} facing={-1} />
        <b class="scene-words">{words}</b>
      </div>
    );
  }
  if (kind === 'cup') {
    return (
      <div class="scene scene-cup" style={tint}>
        <FigureRow crest={crest} poses={['up']} seed={3} />
        <span class="scene-lift">
          <Trophy size={S.trophy * 0.8} />
        </span>
        <FigureRow crest={crest} poses={['mate']} seed={8} facing={-1} />
        <b class="scene-words">{words}</b>
      </div>
    );
  }
  if (kind === 'out') {
    return (
      <div class="scene scene-out" style={tint}>
        <FigureRow crest={crest} poses={['keeper']} seed={5} />
        <span class="scene-gap" />
        <FigureRow crest={crest} poses={['spent', 'leaving']} seed={7} facing={-1} />
        <b class="scene-words">{words}</b>
      </div>
    );
  }
  return (
    <div class="scene scene-up" style={tint}>
      <FigureRow crest={crest} poses={['stride', 'stride', 'stride']} seed={2} />
      <span class="scene-arrow" aria-hidden="true" />
      <b class="scene-words">{words}</b>
    </div>
  );
}

/** The two teams as a game ends: the winners with their arms up, the losers bent over their sticks; level, both stand. */
export function ResultStrip({ crests, winner }: { crests: readonly [Crest, Crest]; winner: 0 | 1 | null }) {
  const poses = (team: 0 | 1): PoseName[] => (winner === null ? ['stand', 'stand'] : winner === team ? ['wide', 'up'] : ['spent', 'spent']);
  return (
    <div class="result-strip" aria-hidden="true">
      <FigureRow crest={crests[0]} poses={poses(0)} size={S.resultFigure} seed={1} />
      <FigureRow crest={crests[1]} poses={poses(1)} size={S.resultFigure} kit="away" facing={-1} seed={6} />
    </div>
  );
}
