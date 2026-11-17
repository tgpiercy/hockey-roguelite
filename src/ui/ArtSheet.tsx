import { conditionWords, familyOf } from '../core/artifactFamily';
import { teamCrest } from '../core/crest';
import artifactData from '../data/artifacts.json';
import type { Modifier } from '../sim/modifiers';
import { OptionCard, RinkOutline } from './parts';
import { ArtifactCard } from './screens/season';
import { generateLeague } from '../core/generate';
import { portraitOf } from '../core/portrait';
import crestRules from '../data/crests.json';
import gearData from '../data/gear.json';
import look from '../data/rinkLook.json';
import { skinTone, STANDING, type PoseInput } from '../game/figure';
import { BUILDS, lookOf } from '../core/playerLook';
import { CrestBadge } from './Crest';
import { FigureArt } from './FigureArt';
import { GEAR_ART_SLOTS, GearArt } from './GearArt';
import { Icon, ICON_NAMES } from './Icon';
import { MASCOT_KINDS, mascotLook } from '../core/mascotKind';
import { MascotFace } from './MascotFace';
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
  ['goalie glove', { ...STANDING, goalie: true, action: 'glove' }],
  ['goal', { ...STANDING, cheer: true }],
  ['his mate scored', { ...STANDING, mateCheer: true }],
  ['kneeling', { ...STANDING, kneel: true }],
  ['gliding', { ...STANDING, speed: 1, glide: true }],
  ['pass', { ...STANDING, stride: 1, speed: 0.6, action: 'pass' }],
  ['poke', { ...STANDING, stride: 1, speed: 0.6, action: 'poke' }],
  ['hit', { ...STANDING, stride: 1, speed: 1, action: 'hit' }],
  ['deke', { ...STANDING, stride: 2, speed: 0.6, action: 'deke' }],
  ['tired', { ...STANDING, action: 'tired' }],
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
      <h2>Artifact cards, one for each family and each kind of chip</h2>
      <div class="art-row art-cards">
        {(artifactData as unknown as { id: string; name: string; description: string; modifiers: Modifier[]; bargain?: { games: number; handicap: Modifier[] } }[])
          .filter((a, i, all) => all.findIndex((b) => familyOf(b.modifiers) === familyOf(a.modifiers)) === i || conditionWords(a.modifiers).length > 0 || a.bargain)
          .slice(0, 18)
          .map((a) => (
            <span key={a.id} class="art-card-cell">
              <ArtifactCard name={a.name} description={a.description} modifiers={a.modifiers} chips={a.bargain ? [{ text: `Bargain · ${a.bargain.games} games`, tone: 'bargain' }] : []} tall />
            </span>
          ))}
      </div>
      <h2>Option cards</h2>
      <div class="art-row art-cards">
        <span class="art-card-cell"><OptionCard icon="charter" name="Charter" value="Iron line" chip="Change" /></span>
        <span class="art-card-cell"><OptionCard icon="handicap" name="Stronger opponents" value="2 points" pips={{ filled: 2, total: 2 }} /></span>
        <span class="art-card-cell"><OptionCard icon="handicap" name="Dear shops" value="Off" pips={{ filled: 0, total: 2 }} off /></span>
        <span class="art-card-cell"><OptionCard icon="rink" name="Rink" value="The pond"><RinkOutline length={44} width={22} corner={6} nets={2.6} /></OptionCard></span>
      </div>
      <h2>Gear, by rarity</h2>
      {gearData.rarities.map((rarity) => (
        <div class="art-row" key={rarity.id}>
          {GEAR_ART_SLOTS.map((slot) => (
            <GearArt key={slot} slot={slot} rarity={rarity.id} size={40} />
          ))}
        </div>
      ))}
      <h2>A stride, picture by picture, flat out and at half speed</h2>
      {[1, 0.5].map((speed) => (
        <div key={speed} class="art-row figure-row">
          {Array.from({ length: look.figure.poseSteps }, (_, i) => (
            <FigureArt key={i} pose={{ ...STANDING, stride: (i / look.figure.poseSteps) * Math.PI * 2, speed }} crest={teamCrest(league.teams[2]?.name ?? 'sheet')} skin={skinTone(1)} size={84} />
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
      <h2>Builds, and a captain and a mascot</h2>
      <div class="art-row figure-row">
        {BUILDS.map((build, i) => (
          <span key={build} class="figure-cell">
            <FigureArt pose={{ ...STANDING, stride: 1, speed: 0.5 }} who={{ hair: 'short', beard: 'none', build }} crest={teamCrest(league.teams[i]?.name ?? 'sheet')} skin={skinTone(i)} size={110} />
            <small>{build}</small>
          </span>
        ))}
        <span class="figure-cell">
          <FigureArt pose={{ ...STANDING, goalie: true }} who={{ hair: 'short', beard: 'none', build: 'tall' }} crest={teamCrest(league.teams[5]?.name ?? 'sheet')} skin={skinTone(1)} size={110} />
          <small>tall goalie</small>
        </span>
        <span class="figure-cell">
          <FigureArt pose={STANDING} who={{ hair: 'short', beard: 'none', build: 'regular', mark: 'captain' }} crest={teamCrest(league.teams[6]?.name ?? 'sheet')} skin={skinTone(2)} size={110} />
          <small>captain</small>
        </span>
      </div>
      <h2>Mascots: each costume on the ice, and as a face at 72, 34 and 26 pixels</h2>
      <div class="art-row figure-row">
        {MASCOT_KINDS.map((kind, i) => (
          <span key={kind} class="figure-cell">
            <FigureArt pose={{ ...STANDING, stride: i, speed: i % 2 === 0 ? 0.6 : 0, cheer: i === 3 }} who={{ hair: 'bald', beard: 'none', build: 'heavy', mark: 'mascot', costume: kind }} crest={teamCrest(league.teams[i]?.name ?? 'sheet')} skin={skinTone(3)} size={110} kit={i % 3 === 2 ? 'away' : 'home'} />
            <small>{mascotLook(kind).name}</small>
          </span>
        ))}
      </div>
      <div class="art-row">
        {MASCOT_KINDS.map((kind, i) => {
          const crest = teamCrest(league.teams[i]?.name ?? 'sheet');
          return <MascotFace key={kind} kind={kind} primary={crest.primary} secondary={crest.secondary} size={72} />;
        })}
      </div>
      <div class="art-row">
        {MASCOT_KINDS.flatMap((kind, i) => {
          const crest = teamCrest(league.teams[i]?.name ?? 'sheet');
          return [<MascotFace key={`${kind}a`} kind={kind} primary={crest.primary} secondary={crest.secondary} size={34} />, <MascotFace key={`${kind}b`} kind={kind} primary={crest.primary} secondary={crest.secondary} size={26} />];
        })}
      </div>
      <h2>A league's players as they look on the ice (and at phone size)</h2>
      <div class="art-row figure-row">
        {players.slice(0, 18).map((p, i) => {
          const who = lookOf(p);
          return <FigureArt key={p.id} pose={{ ...STANDING, stride: i, speed: 0.5, goalie: p.position === 'G' }} who={who} hair={who.hairColour} crest={teamCrest(league.teams[i % league.teams.length]!.name)} skin={who.skin} size={84} />;
        })}
      </div>
      <div class="art-row figure-row">
        {players.slice(0, 18).map((p, i) => {
          const who = lookOf(p);
          return <FigureArt key={p.id} pose={{ ...STANDING, stride: i, speed: 0.5, goalie: p.position === 'G', side: i % 2 === 0 ? 1 : -1 }} who={who} hair={who.hairColour} crest={teamCrest(league.teams[i % league.teams.length]!.name)} skin={who.skin} size={34} kit={i % 2 === 0 ? 'home' : 'away'} />;
        })}
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
