import type { ComponentChildren } from 'preact';
import type { Crest } from '../../core/crest';
import { MASCOT_ID } from '../../core/mascot';
import type { PlayerRecord } from '../../core/player';
import { portraitOf } from '../../core/portrait';
import type { SeasonSummary } from '../../core/seasonSummary';
import rules from '../../data/season.json';
import { CrestBadge } from '../Crest';
import { Icon, type IconName } from '../Icon';
import { Face, RatingBar } from '../parts';
import { PortraitFace } from '../Portrait';

/** The icon for each powerup, by its id. Anything new falls back to the bolt. */
const POWERUP_ICONS: Record<string, IconName> = {
  'speed-burst': 'pSpeed',
  cannon: 'pShot',
  'dead-eye': 'pAim',
  'iron-wall': 'pWall',
  'cat-reflexes': 'pReflex',
  'second-wind': 'pEnergy',
  'fresh-legs': 'pEnergy',
  adrenaline: 'pEnergy',
  'magnet-hands': 'pHands',
  'wrecking-crew': 'pHit',
  'laser-passes': 'pPass',
  'full-reset': 'pEnergy',
};
export const powerupIcon = (id: string): IconName => POWERUP_ICONS[id] ?? 'powerups';

/** A light for each strike the season allows: lit red for each one taken. */
export function StrikeLights({ strikes, of = rules.maxStrikes }: { strikes: number; of?: number }) {
  return (
    <span class="strike-lights" aria-label={`${strikes} of ${of} strikes`}>
      <i>Strikes</i>
      {Array.from({ length: of }, (_, n) => (
        <span key={n} class={n < strikes ? 'light on' : 'light'} />
      ))}
    </span>
  );
}

/** A stop on the map you can travel to: its kind, what it is, and for a game the opponent's crest and strength against yours. */
export function StopCard({ icon, kind, title, crest, theirs, mine }: { icon: IconName; kind: string; title: string; crest?: Crest; theirs?: number; mine?: number }) {
  return (
    <span class="stop-card">
      {crest ? <CrestBadge crest={crest} size={34} /> : <Icon name={icon} size={30} />}
      <span class="stop-text">
        <span class="stop-kind">{kind}</span>
        <span class="stop-title">{title}</span>
      </span>
      {theirs !== undefined && mine !== undefined && (
        <span class={`stop-edge ${theirs > mine ? 'harder' : theirs < mine ? 'easier' : ''}`}>
          <b>{theirs}</b>
          <small>you {mine}</small>
        </span>
      )}
    </span>
  );
}

export interface PosterSide {
  crest: Crest;
  name: string;
  strength: number;
  /** His best players, for the faces under the crest. */
  stars: PlayerRecord[];
  /** The goalie in net, shown with his overall so a hot goalie is seen coming. */
  goalie?: PlayerRecord;
  /** How the team attacks, in a word or two. */
  style?: string;
}

function PosterTeam({ side }: { side: PosterSide }) {
  return (
    <div class="poster-team">
      <CrestBadge crest={side.crest} size={44} />
      <span class="poster-name">{side.name}</span>
      <span class="poster-faces">
        {side.stars.map((p) =>
          p.id === MASCOT_ID ? (
            <span key={p.id} class="mascot-face" style={{ width: '24px', height: '24px' }}>
              <Icon name="mascot" size={17} />
            </span>
          ) : (
            <PortraitFace key={p.id} portrait={portraitOf(p.id, p.age)} primary={side.crest.primary} secondary={side.crest.secondary} size={24} />
          ),
        )}
      </span>
      {side.goalie && (
        <span class="poster-goalie">
          <i>In goal</i>
          <PortraitFace portrait={portraitOf(side.goalie.id, side.goalie.age)} primary={side.crest.primary} secondary={side.crest.secondary} size={20} />
          <b>{side.goalie.overall}</b>
        </span>
      )}
      {side.style && <span class="poster-style">{side.style}</span>}
    </div>
  );
}

/** The matchup before a game: both teams' crests, names, best players, and their strength as two bars meeting in the middle. */
export function MatchupPoster({ home, away, children }: { home: PosterSide; away: PosterSide; children?: ComponentChildren }) {
  const total = Math.max(1, home.strength + away.strength);
  return (
    <div class="poster">
      <div class="poster-teams">
        <PosterTeam side={home} />
        <span class="poster-vs">VS</span>
        <PosterTeam side={away} />
      </div>
      <div class="poster-strength">
        <b>{home.strength}</b>
        <span class="poster-bar">
          <span style={{ width: `${(home.strength / total) * 100}%`, background: home.crest.primary }} />
          <span style={{ width: `${(away.strength / total) * 100}%`, background: away.crest.primary }} />
        </span>
        <b>{away.strength}</b>
      </div>
      {children}
    </div>
  );
}

/** A powerup on a shop shelf: its icon, name, and a price tag. */
export function ShopCard({ id, name, price, affordable }: { id: string; name: string; price: number; affordable: boolean }) {
  return (
    <span class="shop-card">
      <Icon name={powerupIcon(id)} size={28} />
      <span class="shop-name">{name}</span>
      <span class={`price-tag${affordable ? '' : ' short'}`}>{price}</span>
    </span>
  );
}

/** A player's ratings now and after a training session that adds `gain` to each. */
export function TrainingGain({ player, gain }: { player: PlayerRecord; gain: number }) {
  const ratings = player.ratings as unknown as Record<string, number>;
  const names: Record<string, string> = { shooting: 'Shooting', passing: 'Passing', speed: 'Speed', checking: 'Checking', puckControl: 'Puck control', stamina: 'Stamina', reflexes: 'Reflexes', positioning: 'Positioning', reboundControl: 'Rebounds' };
  return (
    <div class="ratings">
      {Object.keys(ratings).map((key) => (
        <RatingBar key={key} name={names[key] ?? key} value={Math.min(rules.maxRating, (ratings[key] as number) + gain)} extra={<span class="up"> +{gain}</span>} />
      ))}
    </div>
  );
}

/** The top of an event: an icon, and the story. */
export function EventHeader({ text }: { text: string }) {
  return (
    <div class="event-head">
      <span class="event-icon">
        <Icon name="event" size={30} />
      </span>
      <div class="event-text">{text}</div>
    </div>
  );
}

/** How a finished season went: where it ended, the record, the top scorer, milestones, and what carries over. */
export function SeasonSummaryCard({ summary, crest, season, artifacts }: { summary: SeasonSummary; crest: Crest; season: number; artifacts: number }) {
  return (
    <div class="season-summary">
      <div class="season-finish">
        <CrestBadge crest={crest} size={58} />
        <div>
          <span class="season-label">Season {season}</span>
          <b class={summary.champion ? 'won' : ''}>{summary.finish}</b>
          <span>
            {summary.wins} wins, {summary.losses} losses · {summary.strikes} strike{summary.strikes === 1 ? '' : 's'}
            {summary.shutouts > 0 ? ` · ${summary.shutouts} shutout${summary.shutouts === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </div>
      <div class="season-facts">
        <div class="fact">
          <i>Top scorer</i>
          {summary.topScorer ? (
            <span class="fact-who">
              <Face player={summary.topScorer.player} size={30} />
              <span>
                <b>{summary.topScorer.player.name}</b>
                <small>
                  {summary.topScorer.goals} goal{summary.topScorer.goals === 1 ? '' : 's'}
                </small>
              </span>
            </span>
          ) : (
            <span class="note">Nobody scored</span>
          )}
        </div>
        <div class="fact">
          <i>Milestones</i>
          {summary.milestones.length > 0 ? (
            <span class="badges">
              {summary.milestones.map((name) => (
                <span key={name} class="pill">
                  {name}
                </span>
              ))}
            </span>
          ) : (
            <span class="note">None this season</span>
          )}
        </div>
        <div class="fact">
          <i>Carries over</i>
          <span>
            {artifacts} artifact{artifacts === 1 ? '' : 's'}, your gear{summary.packs > 0 ? `, ${summary.packs} pack${summary.packs === 1 ? '' : 's'} to open` : ''}. Powerups, Pucks and training bumps do not.
          </span>
        </div>
      </div>
    </div>
  );
}

/** One line of the off-season report: a player whose overall changed, with a bar from before to after. */
export function ChangeRow({ player, name, from, to }: { player: PlayerRecord | undefined; name: string; from: number; to: number }) {
  const up = to > from;
  // The bar runs over the range where overalls live, 40 to 99.
  const at = (value: number): number => Math.max(0, Math.min(1, (value - 40) / 59)) * 100;
  return (
    <span class="change-row">
      {player ? <Face player={player} size={24} /> : <span class="change-gone" />}
      <span class="change-name">{name}</span>
      <span class="change-bar">
        <span class="change-base" style={{ width: `${at(Math.min(from, to))}%` }} />
        <span class={`change-delta ${up ? 'gain' : 'loss'}`} style={{ left: `${at(Math.min(from, to))}%`, width: `${Math.abs(at(to) - at(from))}%` }} />
      </span>
      <span class={`change-figures ${up ? 'up' : 'down'}`}>
        {from} → {to}
      </span>
    </span>
  );
}
