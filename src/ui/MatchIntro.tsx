import { teamCrest } from '../core/crest';
import type { DressedTeam } from '../core/matchup';
import { portraitOf } from '../core/portrait';
import { CrestBadge } from './Crest';
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
            <PortraitFace portrait={portraitOf(p.id, p.age)} primary={colour} secondary={crest.secondary} size={40} />
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

/**
 * The introduction before a boss game: both teams' starters, the boss's named person and what his club
 * does. It sits over the rink for a few seconds before the puck drops; any press ends it.
 */
export function MatchIntro({ home, away, homeColour, awayColour, words }: { home: DressedTeam; away: DressedTeam; homeColour: string; awayColour: string; words: IntroWords }) {
  return (
    <div class="intro">
      <div class="intro-head">
        <span>Tonight</span>
        <b>{words.title}</b>
        <i>{words.person}</i>
      </div>
      <div class="intro-teams">
        <Starters team={home} colour={homeColour} />
        <span class="intro-vs">vs</span>
        <Starters team={away} colour={awayColour} />
      </div>
      <div class="intro-lines">
        {words.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <small class="intro-skip">Any button to drop the puck</small>
    </div>
  );
}
