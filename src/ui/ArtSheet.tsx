import { teamCrest } from '../core/crest';
import { generateLeague } from '../core/generate';
import { portraitOf } from '../core/portrait';
import crestRules from '../data/crests.json';
import gearData from '../data/gear.json';
import { CrestBadge } from './Crest';
import { GEAR_ART_SLOTS, GearArt } from './GearArt';
import { Icon, ICON_NAMES } from './Icon';
import { PortraitFace } from './Portrait';

/**
 * Every piece of drawn art on one page, opened with ?sheet. It exists so the art can be checked together:
 * that no icon is missing or unreadable at the size it is used, and that faces and crests vary.
 */
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
