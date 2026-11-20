import { teamCrest } from '../core/crest';
import type { DressedTeam } from '../core/matchup';
import { portraitOf } from '../core/portrait';
import { burstPoints } from '../game/burst';
import { skinTone, STANDING } from '../game/figure';
import { CrestBadge } from './Crest';
import { FigureArt } from './FigureArt';
import { PortraitFace } from './Portrait';

/** What is said over the two teams before a big game: who it is, who leads them, and what to know. */
export interface IntroWords {
  /** The other club's name. */
  title: string;
  /** Its named person, as "Sven Aldersson, captain". */
  person: string;
  /** A sentence or two: what kind of club it is, and its trick. */
  lines: string[];
}

/** A team's starters as a row of cards: the first line and the goalie. */
function Starters({ team, colour }: { team: DressedTeam; colour: string }) {
  const crest = teamCrest(team.name);
  const starters = [...team.players.slice(0, 3), team.players[team.players.length - 1]].filter((p): p is NonNullable<typeof p> => p !== undefined);
  return (
    <div class="intro-team">
      <div class="intro-name">
        <CrestBadge crest={crest} size={30} />
        <b>{team.name}</b>
      </div>
      <div class="intro-cards">
        {starters.map((p) => (
          <span key={p.id} class="intro-card">
            <PortraitFace portrait={portraitOf(p.id, p.age)} primary={colour} secondary={crest.secondary} size={34} />
            <small>{p.name.split(' ').slice(-1)[0]}</small>
            <i>
              {p.position} {p.overall}
            </i>
          </span>
        ))}
      </div>
    </div>
  );
}

const BURST = burstPoints('cover', 15, 0.24, 0.08)
  .map(([x, y]) => `${(50 + x * 50).toFixed(1)},${(50 + y * 50).toFixed(1)}`)
  .join(' ');

/**
 * The introduction before a boss game, laid out as the cover of a comic: the boss's named person drawn
 * large on a burst in his club's colour, the club's name across the top, what the club does in caption
 * boxes, and both teams' starters along the bottom. It sits over the rink for a few seconds before the
 * puck drops; any press ends it.
 */
export function MatchIntro({ home, away, homeColour, awayColour, words }: { home: DressedTeam; away: DressedTeam; homeColour: string; awayColour: string; words: IntroWords }) {
  const crest = teamCrest(away.name);
  const [who, role] = words.person.split(', ');
  return (
    <div class="intro cover" style={{ '--boss': awayColour, '--boss2': crest.secondary }}>
      <div class="cover-main">
        <div class="cover-star">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <polygon class="cover-burst-ink" points={BURST} transform="translate(3 3)" />
            <polygon class="cover-burst" points={BURST} />
          </svg>
          <PortraitFace portrait={portraitOf(`boss/${who}`, 38)} primary={awayColour} secondary={crest.secondary} size={112} />
          <span class="cover-figure">
            <FigureArt pose={{ ...STANDING, side: -1, pattern: crest.pattern }} crest={crest} skin={skinTone((who ?? '').length)} size={84} />
          </span>
        </div>
        <div class="cover-words">
          <span class="cover-tag">Tonight!</span>
          <b class="cover-title">{words.title}</b>
          <i class="cover-person">
            {who}
            {role ? <small> · {role}</small> : null}
          </i>
          {words.lines.map((line) => (
            <p key={line} class="cover-caption">
              {line}
            </p>
          ))}
        </div>
      </div>
      <div class="intro-teams">
        <Starters team={home} colour={homeColour} />
        <span class="intro-vs">vs</span>
        <Starters team={away} colour={awayColour} />
      </div>
      <small class="intro-skip">Any button to drop the puck</small>
    </div>
  );
}
