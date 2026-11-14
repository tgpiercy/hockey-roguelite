import { teamCrest } from '../core/crest';
import { generateLeague } from '../core/generate';
import { portraitOf } from '../core/portrait';
import crestRules from '../data/crests.json';
import gearData from '../data/gear.json';
import { skinTone, STANDING, type PoseInput } from '../game/figure';
import { CrestBadge } from './Crest';
import { FigureArt } from './FigureArt';
import { GEAR_ART_SLOTS, GearArt } from './GearArt';
import { Icon, ICON_NAMES } from './Icon';
import { PortraitFace } from './Portrait';

/**
 * Every piece of drawn art on one page, opened with ?sheet. It exists so the art can be checked together:
 * that no icon is missing or unreadable at the size it is used, and that faces and crests vary.
 */
/** The on-ice figure in each pose worth checking. */
const POSES: [string, PoseInput][] = [
  ['standing', STANDING],
  ['stride A', { ...STANDING, stride: Math.PI / 2, speed: 1 }],
  ['mid stride', { ...STANDING, stride: Math.PI, speed: 1 }],
  ['stride B', { ...STANDING, stride: (3 * Math.PI) / 2, speed: 1 }],
  ['facing left', { ...STANDING, stride: Math.PI / 2, speed: 0.6, side: -1, pattern: 'yoke' }],
  ['wind-up', { ...STANDING, windUp: 1, pattern: 'sash' }],
  ['off balance', { ...STANDING, tilt: 0.5, pattern: 'yoke' }],
  ['goalie', { ...STANDING, goalie: true }],
  ['goalie down', { ...STANDING, goalie: true, down: true }],
  ['goalie left', { ...STANDING, goalie: true, side: -1, pattern: 'sash' }],
];

export function ArtSheet() {
  const league = generateLeague('art-sheet');
  const players = Object.values(league.players).slice(0, 36);
  const ages = [19, 24, 29, 34, 38];
  return (
    <div class="art-sheet">
      <h2>Portraits at 44 and 26 pixels</h2>
      <div class="art-row">
        {players.map((p, i) => {
          const crest = teamCrest(league.teams[i % league.teams.length]!.name);
          return <PortraitFace key={p.id} portrait={portraitOf(p.id, p.age)} primary={crest.primary} secondary={crest.secondary} size={44} />;
        })}
      </div>
      <div class="art-row">
        {players.map((p, i) => {
          const crest = teamCrest(league.teams[i % league.teams.length]!.name);
          return <PortraitFace key={p.id} portrait={portraitOf(p.id, p.age)} primary={crest.primary} secondary={crest.secondary} size={26} />;
        })}
      </div>
      <h2>One player from 19 to 38</h2>
      <div class="art-row">
        {players.slice(0, 6).flatMap((p) => ages.map((age) => <PortraitFace key={`${p.id}-${age}`} portrait={portraitOf(p.id, age)} primary="#1d3557" secondary="#ffffff" size={36} />))}
      </div>
      <h2>Icons at 20 and 32 pixels</h2>
      <div class="art-row">
        {ICON_NAMES.map((name) => (
          <span key={name} class="art-cell">
            <Icon name={name} size={20} />
            <Icon name={name} size={32} />
            <small>{name}</small>
          </span>
        ))}
      </div>
      <h2>Gear, by rarity</h2>
      {gearData.rarities.map((rarity) => (
        <div class="art-row" key={rarity.id}>
          {GEAR_ART_SLOTS.map((slot) => (
            <GearArt key={slot} slot={slot} rarity={rarity.id} size={40} />
          ))}
        </div>
      ))}
      <h2>Players on the ice</h2>
      <div class="art-row figure-row">
        {POSES.map(([name, pose], i) => (
          <span key={name} class="figure-cell">
            <FigureArt pose={pose} crest={teamCrest(league.teams[i % league.teams.length]?.name ?? 'sheet')} skin={skinTone(i)} size={110} />
            <small>{name}</small>
          </span>
        ))}
      </div>
      <div class="art-row figure-row">
        {league.teams.slice(0, 12).map((team, i) => (
          <FigureArt key={team.id} pose={{ ...STANDING, stride: i, speed: 0.6, side: i % 2 === 0 ? 1 : -1, pattern: teamCrest(team.name).pattern }} crest={teamCrest(team.name)} skin={skinTone(i)} size={40} />
        ))}
      </div>
      <h2>Home and away kits</h2>
      <div class="art-row figure-row">
        {league.teams.slice(0, 6).flatMap((team, i) => {
          const crest = teamCrest(team.name);
          const pose = { ...STANDING, stride: 1, speed: 0.6, pattern: crest.pattern };
          return [
            <FigureArt key={`${team.id}-h`} pose={pose} crest={crest} skin={skinTone(i)} size={84} />,
            <FigureArt key={`${team.id}-a`} pose={pose} crest={crest} skin={skinTone(i)} size={84} kit="away" />,
            ...(i < 2 ? [<FigureArt key={`${team.id}-g`} pose={{ ...pose, goalie: true }} crest={crest} skin={skinTone(i)} size={84} kit="away" />] : []),
          ];
        })}
      </div>
      <h2>Crests</h2>
      <div class="art-row">
        {league.teams.map((team) => (
          <CrestBadge key={team.id} crest={teamCrest(team.name)} size={40} />
        ))}
        {crestRules.emblems.map((emblem) => (
          <CrestBadge key={emblem} crest={{ ...teamCrest('sheet'), emblem, shape: 'shield' }} size={40} />
        ))}
      </div>
    </div>
  );
}
