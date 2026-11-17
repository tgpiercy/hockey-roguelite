import type { ComponentChildren } from 'preact';
import type { PlayerRecord } from '../../core/player';
import { portraitOf } from '../../core/portrait';
import { roleOf, type StaffMember } from '../../core/staff';
import mascotRules from '../../data/mascot.json';
import prestigeRules from '../../data/prestige.json';
import { Icon, type IconName } from '../Icon';
import { Dots, Face, Grade, MascotBadge, money, RatingBar } from '../parts';
import { PortraitFace } from '../Portrait';

const RATING_NAMES: Record<string, string> = {
  shooting: 'Shooting',
  passing: 'Passing',
  speed: 'Speed',
  checking: 'Checking',
  puckControl: 'Puck control',
  stamina: 'Stamina',
  reflexes: 'Reflexes',
  positioning: 'Positioning',
  reboundControl: 'Rebounds',
};

/** The drawing on each facility's card. */
export const FACILITY_ICONS: Record<string, IconName> = {
  training: 'training',
  medical: 'medical',
  office: 'office',
  scouting: 'scouting',
  arena: 'facilities',
  den: 'mascot',
};

/** One building: its drawing, name, level as pips, and what the next level costs. */
export function FacilityCard({ id, name, level, maxLevel, cost, affordable }: { id: string; name: string; level: number; maxLevel: number; cost: number | null; affordable: boolean }) {
  return (
    <span class="dash-tile facility">
      <Icon name={FACILITY_ICONS[id] ?? 'facilities'} size={30} />
      <span class="dash-text">
        <span class="dash-name">{name}</span>
        <span class="facility-level">
          <Dots filled={level} total={maxLevel} />
          <span class={cost === null ? 'note' : affordable ? '' : 'short'}>{cost === null ? 'Top level' : money(cost)}</span>
        </span>
      </span>
    </span>
  );
}

/** Someone on the staff, or available to hire: a face, grade, job and pay. */
export function StaffCard({ member, note }: { member: StaffMember; note?: string }) {
  return (
    <span class="dash-tile staff">
      {/* Staff are not players, so they get a face of their own in neutral colours, a little older. */}
      <PortraitFace portrait={portraitOf(member.id, 42)} primary="#3a4a63" secondary="#9fb6cc" size={34} />
      <span class="dash-text">
        <span class="staff-top">
          <span class={`grade grade-${member.grade}`}>{member.grade}</span>
          <span class="dash-name">{roleOf(member).title}</span>
        </span>
        <span class="dash-status">
          {member.name} · {money(member.salary)} · {member.contractYears}y{note ? ` · ${note}` : ''}
        </span>
      </span>
    </span>
  );
}

/** A job with nobody in it. */
export function OpenDesk({ job }: { job: string }) {
  return (
    <span class="dash-tile staff open">
      <Icon name="freeAgents" size={30} />
      <span class="dash-text">
        <span class="dash-name">{job}</span>
        <span class="dash-status">Open desk: hire someone</span>
      </span>
    </span>
  );
}

/**
 * A newcomer's ratings beside the player he would replace: each bar is the newcomer's, with how much
 * better or worse he is. Players of different kinds (a skater and a goalie) are not compared.
 */
export function Compare({ newcomer, current, label }: { newcomer: PlayerRecord; current: PlayerRecord | null; label: string }) {
  const mine = newcomer.ratings as unknown as Record<string, number>;
  const his = current ? (current.ratings as unknown as Record<string, number>) : null;
  return (
    <div class="compare">
      {current && (
        <div class="compare-head">
          <span>{label}</span>
          <Face player={current} size={22} />
          <b>{current.name}</b>
          <Grade player={current} />
          <span class={newcomer.overall > current.overall ? 'up' : newcomer.overall < current.overall ? 'down' : ''}>
            {newcomer.overall > current.overall ? '+' : ''}
            {newcomer.overall - current.overall} overall
          </span>
        </div>
      )}
      <div class="ratings">
        {Object.keys(mine).map((key) => {
          const delta = his && key in his ? (mine[key] as number) - (his[key] as number) : null;
          return (
            <RatingBar
              key={key}
              name={RATING_NAMES[key] ?? key}
              value={mine[key] as number}
              extra={delta === null || delta === 0 ? undefined : <span class={delta > 0 ? 'up' : 'down'}> {delta > 0 ? `+${delta}` : delta}</span>}
            />
          );
        })}
      </div>
    </div>
  );
}

function OfferSide({ title, player }: { title: string; player: PlayerRecord }) {
  return (
    <div class="offer-side">
      <span class="offer-title">{title}</span>
      <Face player={player} size={46} />
      <b>{player.name}</b>
      <span class="offer-line">
        <Grade player={player} /> <strong>{player.overall}</strong> {player.position} · {player.age}y
      </span>
      <span class="offer-line">
        {money(player.capHit)} · {player.contractYears}y left
      </span>
    </div>
  );
}

/** A one-for-one trade laid out side by side, with what the other team says in the middle. */
export function TradeOffer({ give, get, verdict, accepted }: { give: PlayerRecord; get: PlayerRecord; verdict: string; accepted: boolean }) {
  return (
    <div class="offer">
      <OfferSide title="You give" player={give} />
      <div class={`offer-verdict ${accepted ? 'yes' : 'no'}`}>
        <Icon name="trade" size={24} />
        <span>{verdict}</span>
      </div>
      <OfferSide title="You get" player={get} />
    </div>
  );
}

/** The mascot: his figure, a power meter marked where each talent unlocks, and the numbers power gives him. */
export function MascotPanel({ name, power, chance, rating, what, art, children }: { name: string; power: number; chance: number; rating: number; what?: string; art?: ComponentChildren; children?: ComponentChildren }) {
  const marks = mascotRules.talentUnlockPower;
  const top = marks[marks.length - 1] as number;
  return (
    <div class="mascot-panel">
      <div class="mascot-top">
        <span class="mascot-figure">
          <MascotBadge size={76} />
        </span>
        {art}
        <div class="mascot-facts">
          <b>
            {name}
            {what ? <small> · {what}</small> : null}
          </b>
          <span>
            <strong>{Math.round(chance * 100)}%</strong> to turn up on his next roll · plays at <strong>{rating}</strong> overall
          </span>
          <span>
            Rolled at the opening faceoff, and to start a period when you are {mascotRules.trailBy} or more behind. He plays that period in place of your lowest-rated dressed skater. Each miss adds{' '}
            {Math.round(mascotRules.missStep * 100)}%; when he comes it starts again at {Math.round(mascotRules.baseChance * 100)}%. Simulated games make no roll.
          </span>
          <span>Never plays goal, earns no XP, never ages. Costs {money(mascotRules.salary)} a season.</span>
        </div>
      </div>
      <div class="power-meter">
        <div class="power-top">
          <i>Power</i>
          <b>{Math.round(power * 10) / 10}</b>
        </div>
        <div class="power-track">
          <div class="power-fill" style={{ width: `${Math.min(1, power / top) * 100}%` }} />
          {marks.map((mark) => (
            <span key={mark} class={`power-mark${power >= mark ? ' reached' : ''}`} style={{ left: `${(mark / top) * 100}%` }}>
              {mark}
            </span>
          ))}
        </div>
        <div class="power-note">A talent unlocks at each mark. Power comes from his costume, the mascot den and a promoter.</div>
      </div>
      {children}
    </div>
  );
}

/** A talent as a badge: lit once he knows it, greyed with the power it needs until then. */
export function TalentBadge({ name, known, needs }: { name: string; known: boolean; needs: number }) {
  return (
    <span class={`talent-badge${known ? ' known' : ''}`}>
      <Icon name={known ? 'prestige' : 'detail'} size={18} />
      <span>{name}</span>
      {!known && <small>power {needs}</small>}
    </span>
  );
}

/** Every prestige level as a rung: what it gives, which you hold, and which is next. */
export function PrestigeLadder({ level }: { level: number }) {
  const odds = (n: number): number => Math.round((prestigeRules.rarityBoostPerLevel ** n - 1) * 100);
  const rungs = Array.from({ length: prestigeRules.maxLevel + 1 }, (_, n) => n).reverse();
  return (
    <div class="ladder">
      {rungs.map((n) => (
        <div key={n} class={`rung${n === level ? ' here' : n < level ? ' held' : n === level + 1 ? ' next' : ''}`}>
          <span class="rung-level">{n}</span>
          <span class="rung-text">
            {n === 0 ? 'The league as it starts' : `Opponents +${n * prestigeRules.opponentRatingPerLevel} · rare gear +${odds(n)}%`}
            <small> · {prestigeRules.jerseys[Math.min(n, prestigeRules.jerseys.length - 1)]?.name} jersey</small>
          </span>
          {n === level && <span class="badge">You</span>}
        </div>
      ))}
    </div>
  );
}
