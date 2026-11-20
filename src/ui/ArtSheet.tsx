import { conditionWords, familyOf } from '../core/artifactFamily';
import { teamCrest } from '../core/crest';
import artifactData from '../data/artifacts.json';
import type { Modifier } from '../sim/modifiers';
import { OptionCard, Price, RinkOutline } from './parts';
import { ArtifactCard } from './screens/season';
import { generateLeague } from '../core/generate';
import { generateItem, type RarityId } from '../core/gear';
import { createRng } from '../core/rng';
import { PackOpening } from './PackOpening';
import { portraitOf } from '../core/portrait';
import crestRules from '../data/crests.json';
import gearData from '../data/gear.json';
import look from '../data/rinkLook.json';
import { skinTone, STANDING, viewOf, type PoseInput } from '../game/figure';
import { BUILDS, lookOf } from '../core/playerLook';
import { CrestBadge } from './Crest';
import { FigureArt } from './FigureArt';
import { GEAR_ART_SLOTS, GearArt } from './GearArt';
import { Icon, ICON_NAMES } from './Icon';
import { MASCOT_KINDS, mascotLook } from '../core/mascotKind';
import { MascotFace } from './MascotFace';
import { PortraitFace } from './Portrait';
import { ResultStrip, SeasonScene } from './Scene';

/**
 * Every piece of drawn art on one page, opened with ?sheet. It exists so the art can be checked together:
 * that no icon is missing or unreadable at the size it is used, and that faces and crests vary.
 */
/** The goalie's candidate stances, each in the poses a game shows. */
const KEEPER_POSES: [string, Partial<PoseInput>][] = [
  ['play far away', { alert: 0 }],
  ['play coming', { alert: 0.5 }],
  ['ready', {}],
  ['shuffle', { speed: 1, stride: Math.PI / 2 }],
  ['slide', { action: 'slide' }],
  ['at his post', { action: 'post' }],
  ['glove save', { action: 'glove' }],
  ['kick save', { action: 'kick' }],
  ['down', { down: true }],
  ['getting up', { action: 'rise' }],
  ['facing left', { side: -1 }],
];

/** A pack for the sheet: one piece of each rarity, and a fifth still face down. */
const PACK = (['common', 'rare', 'legendary', 'epic', 'common'] as RarityId[]).map((rarity, i) => generateItem(createRng(`sheet-pack-${i}`), `sheet-pack-${i}`, rarity));

/** The headings a turning skater is shown at, in degrees: 0 is to the right, 90 down the screen. */
const HEADINGS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
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
  ['goalie kick', { ...STANDING, goalie: true, action: 'kick' }],
  ['goalie shuffle', { ...STANDING, goalie: true, speed: 1, stride: Math.PI / 2 }],
  ['flat on the ice', { ...STANDING, fallen: true }],
  ['follow-through', { ...STANDING, action: 'shot' }],
  ['hard stop', { ...STANDING, action: 'stop', speed: 0.5 }],
  ['goal', { ...STANDING, cheer: true }],
  ['his mate scored', { ...STANDING, mateCheer: true }],
  ['kneeling', { ...STANDING, kneel: true }],
  ['gliding', { ...STANDING, speed: 1, glide: true }],
  ['pass', { ...STANDING, stride: 1, speed: 0.6, action: 'pass' }],
  ['poke', { ...STANDING, stride: 1, speed: 0.6, action: 'poke' }],
  ['hit', { ...STANDING, stride: 1, speed: 1, action: 'hit' }],
  ['deke', { ...STANDING, stride: 2, speed: 0.6, action: 'deke' }],
  ['tired', { ...STANDING, action: 'tired' }],
  ['wind-up, half', { ...STANDING, windUp: 0.5 }],
  ['shot, coming through', { ...STANDING, speed: 0.5, action: 'shot', amount: 0.5 }],
  ['shot, followed through', { ...STANDING, speed: 0.5, action: 'shot' }],
  ['hit, half-way', { ...STANDING, stride: 1, speed: 1, action: 'hit', amount: 0.5 }],
  ['carve toward us', { ...STANDING, speed: 1, carve: 1 }],
  ['carve away', { ...STANDING, speed: 1, carve: -1 }],
  ['carve, from the front', { ...STANDING, speed: 1, carve: 1, view: 'front' }],
  ['cheer: arms up', { ...STANDING, cheer: true }],
  ['cheer: flung wide', { ...STANDING, cheer: true, cheerStyle: 1 }],
  ['cheer: on his knees', { ...STANDING, cheer: true, cheerStyle: 2 }],
  ['goalie going down', { ...STANDING, goalie: true, down: true, amount: 0.5 }],
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
      <h2>Opening a pack</h2>
      <div class="art-row" style="align-items:flex-start;gap:24px">
        <div style="width:170px"><PackOpening title="Gold pack" items={PACK} shown={0} /></div>
        <div style="width:520px"><PackOpening title="Gold pack" items={PACK} shown={3} /></div>
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
      <h2>Coming toward us and going away: a stride, then the poses</h2>
      {(['front', 'back'] as const).map((view) => (
        <div key={view} class="art-row figure-row">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <FigureArt key={i} pose={{ ...STANDING, view, stride: (i / 6) * Math.PI * 2, speed: 1, pattern: (['hoop', 'yoke', 'sash'] as const)[i % 3]! }} crest={teamCrest(league.teams[2 + (i % 2)]?.name ?? 'sheet')} skin={skinTone(i)} size={96} kit={i % 2 === 0 ? 'home' : 'away'} />
          ))}
          <FigureArt pose={{ ...STANDING, view }} crest={teamCrest(league.teams[4]?.name ?? 'sheet')} skin={skinTone(1)} size={96} who={{ hair: 'flow', beard: 'full', build: 'heavy', mark: 'captain' }} />
          <FigureArt pose={{ ...STANDING, view, windUp: 1 }} crest={teamCrest(league.teams[5]?.name ?? 'sheet')} skin={skinTone(2)} size={96} />
          <FigureArt pose={{ ...STANDING, view, cheer: true }} crest={teamCrest(league.teams[6]?.name ?? 'sheet')} skin={skinTone(3)} size={96} />
          <FigureArt pose={{ ...STANDING, view, speed: 1, stride: 1, action: 'hit' }} crest={teamCrest(league.teams[7]?.name ?? 'sheet')} skin={skinTone(0)} size={96} />
          <FigureArt pose={{ ...STANDING, view, action: 'tired' }} crest={teamCrest(league.teams[8]?.name ?? 'sheet')} skin={skinTone(1)} size={96} />
          <FigureArt pose={{ ...STANDING, view, speed: 0.5, stride: 1 }} crest={teamCrest(league.teams[1]?.name ?? 'sheet')} skin={skinTone(1)} size={96} who={{ hair: 'bald', beard: 'none', build: 'heavy', mark: 'mascot', costume: 'fox' }} />
        </div>
      ))}
      <h2>The goalie</h2>
      <div class="art-row figure-row">
        {KEEPER_POSES.map(([name, pose], i) => (
          <span key={name} class="figure-cell">
            <FigureArt pose={{ ...STANDING, goalie: true, ...pose }} who={{ hair: 'short', beard: 'none', build: 'tall' }} crest={teamCrest(league.teams[i % 4]?.name ?? 'sheet')} skin={skinTone(i)} size={130} kit={name === 'facing left' ? 'away' : 'home'} />
            <small>{name}</small>
          </span>
        ))}
      </div>
      <h2>Turning</h2>
      <p class="note">One skater going round from right, down the screen, to left, then up it and back to right: eight pictures and a lean.</p>
      <div class="art-row figure-row">
        {HEADINGS.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const view = viewOf(rad, undefined);
          const side = Math.cos(rad) >= 0 ? 1 : -1;
          const turn = view === 'front' || view === 'back' ? 0 : Math.sin(rad) * side * look.figure.leanDegrees * 0.8;
          return (
            <span key={deg} class="figure-cell">
              <FigureArt pose={{ ...STANDING, stride: 1.2, speed: 0.8, side, view }} crest={teamCrest(league.teams[2]?.name ?? 'sheet')} skin={skinTone(1)} size={92} turn={turn} />
              <small>{deg}°</small>
            </span>
          );
        })}
      </div>
      <h2>What a thing costs</h2>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Price pucks={4} />
        <Price pucks={12} affordable={false} />
        <Price cash={1_200_000} />
        <Price cash={850_000} affordable={false} />
        <Price cash={100_000} gain />
      </div>
      <h2>Big moments</h2>
      <div class="sheet-scenes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '10px' }}>
        <SeasonScene kind="title" crest={teamCrest('Highmoor Gulls')} words="Champions!" />
        <SeasonScene kind="cup" crest={teamCrest('Pinehollow Comets')} words="Cup winners" />
        <SeasonScene kind="out" crest={teamCrest('Westhaven Stoats')} words="Struck out" />
        <SeasonScene kind="up" crest={teamCrest('Pinehollow Comets')} words="Going up" />
        <ResultStrip crests={[teamCrest('Highmoor Gulls'), teamCrest('Pinehollow Comets')]} winner={0} />
      </div>
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
