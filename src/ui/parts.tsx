import { kindOf, talentOf } from '../core/playerKind';
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { goaliesOn, skatersOn, userTeam, type League, type Team } from '../core/league';
import { MASCOT_ID } from '../core/mascot';
import type { MascotKind } from '../core/mascotKind';
import type { PlayerRecord } from '../core/player';
import { portraitOf } from '../core/portrait';
import { capSpace, payroll } from '../core/roster';
import type { Franchise } from '../core/season';
import gearData from '../data/gear.json';
import rules from '../data/league.json';
import { Icon, type IconName } from './Icon';
import { MascotFace } from './MascotFace';
import { PortraitFace } from './Portrait';

const ratingNames = gearData.ratingNames as Record<string, string>;

export const money = (dollars: number): string => `${dollars < 0 ? '−' : ''}$${(Math.abs(dollars) / 1_000_000).toFixed(2)}M`;

/** The colours a player is wearing: his team's main and second colour. */
export interface Wearing {
  primary: string;
  secondary: string;
}

/** What a player with no team wears in a portrait. */
export const NO_TEAM: Wearing = { primary: '#3a4a63', secondary: '#9fb6cc' };

/** Says what any player is wearing, by his id. The app provides it; without one everybody is in neutral colours. */
export const WearingContext = createContext<(playerId: string) => Wearing>(() => NO_TEAM);

/** Your club's mascot: which costume he wears and the colours of his jersey. The app provides it. */
export const MascotContext = createContext<{ kind: MascotKind } & Wearing>({ kind: 'bear', ...NO_TEAM });

/** Your mascot's face. */
export function MascotBadge({ size = 26 }: { size?: number }) {
  const mine = useContext(MascotContext);
  return <MascotFace kind={mine.kind} primary={mine.primary} secondary={mine.secondary} size={size} />;
}

/** A player's face, in the colours of the team he plays for. The mascot gets his own head. */
export function Face({ player, size = 26 }: { player: PlayerRecord; size?: number }) {
  const wearing = useContext(WearingContext)(player.id);
  if (player.id === MASCOT_ID) return <MascotBadge size={size} />;
  return <PortraitFace portrait={portraitOf(player.id, player.age)} primary={wearing.primary} secondary={wearing.secondary} size={size} />;
}

/**
 * A number that counts up to its value when it first appears. It jumps straight there if the device asks
 * for reduced motion.
 */
export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(still ? value : 0);
  useEffect(() => {
    if (still) return setShown(value);
    const steps = 18;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      // Ease out: fast at first, settling on the exact value.
      setShown(step >= steps ? value : value * (1 - (1 - step / steps) ** 3));
      if (step >= steps) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [value, still]);
  return <>{format(shown)}</>;
}

export function Grade({ player }: { player: PlayerRecord }) {
  return <span class={`grade grade-${player.grade.replace('+', 'plus')}`}>{player.grade}</span>;
}

/** One player as a row: grade, overall, name, position, age, pay, contract years, level, and an optional note. */
export function PlayerRow({ player, note, bump = 0 }: { player: PlayerRecord; note?: string; bump?: number }) {
  return (
    <span class="player-row">
      <Face player={player} />
      <Grade player={player} />
      <span class="ovr">{player.overall}</span>
      <span class="pname">{player.name}</span>
      <span class="pos">{player.position}</span>
      <span class={`kind${player.talent ? ' gifted' : ''}`}>{kindOf(player.position, player.ratings).tag}</span>
      <span class="age">{player.age}y</span>
      <span class="cap">{money(player.capHit)}</span>
      <span class="years">{player.contractYears}y</span>
      <span class="lvl">L{player.level}</span>
      {bump !== 0 && <span class="bump">{bump > 0 ? `+${bump}` : bump}</span>}
      {note && <span class="note">{note}</span>}
    </span>
  );
}

/** One rating as a bar. The bar runs from 40 to 99, where almost every rating lives. */
export function RatingBar({ name, value, extra }: { name: string; value: number; extra?: ComponentChildren }) {
  const share = Math.max(0.04, Math.min(1, (value - 40) / 59));
  return (
    <>
      <span class="rname">{name}</span>
      <span class="rbar">
        <span class={`rfill${value >= 90 ? ' top' : value >= 80 ? ' hi' : ''}`} style={{ width: `${share * 100}%`, display: 'block' }} />
      </span>
      <span class="rval">
        {value}
        {extra}
      </span>
    </>
  );
}

/** What kind of player he is, and his talent if he has one: the lines above his ratings. */
export function KindLines({ player }: { player: PlayerRecord }) {
  const kind = kindOf(player.position, player.ratings);
  const talent = talentOf(player);
  return (
    <>
      {player.nickname && <span class="kind-line nick-line">“{player.nickname}”</span>}
      <span class="kind-line">
        <b>{kind.name}</b> {kind.description}
      </span>
      {talent && (
        <span class="kind-line talent">
          <b>{talent.name}</b> {talent.description}
        </span>
      )}
    </>
  );
}

const POSITION_NAMES: Record<string, string> = { F: 'Forward', D: 'Defence', G: 'Goalie' };

/**
 * A player as a trading card: his face large on a slash of the colour he wears, his name, what he is,
 * and his overall rating and grade. It heads his ratings wherever they are shown.
 */
export function PlayerCard({ player }: { player: PlayerRecord }) {
  const wearing = useContext(WearingContext)(player.id);
  const kind = kindOf(player.position, player.ratings);
  return (
    <div class="pcard" style={{ '--card': wearing.primary, '--card2': wearing.secondary }}>
      <Face player={player} size={56} />
      <div class="pcard-words">
        <b>{player.name}</b>
        <span>
          {POSITION_NAMES[player.position] ?? player.position} · {kind.name} · {player.age}
        </span>
      </div>
      <span class="pcard-ovr">
        <b>{player.overall}</b>
        <i>{player.grade}</i>
      </span>
    </div>
  );
}

/** A player's card and his individual ratings as bars, shown in the side panel for whoever is focused. */
export function Ratings({ player }: { player: PlayerRecord }) {
  const ratings = player.ratings as unknown as Record<string, number>;
  return (
    <div class="ratings">
      {player.id !== MASCOT_ID && <PlayerCard player={player} />}
      <KindLines player={player} />
      {Object.keys(ratings).map((key) => (
        <RatingBar key={key} name={ratingNames[key] ?? key} value={ratings[key] as number} />
      ))}
    </div>
  );
}

/** A labelled bar with a figure: the salary cap, XP toward a level. */
export function Meter({ label, value, share, tone }: { label: string; value: ComponentChildren; share: number; tone?: 'cool' | 'over' }) {
  return (
    <div class="meter">
      <div class="meter-top">
        <i>{label}</i>
        <span>{value}</span>
      </div>
      <div class="meter-bar">
        <div class={`meter-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
      </div>
    </div>
  );
}

/** A team's payroll against the cap, and how full its roster is. */
export function CapLine({ league, team }: { league: League; team: Team }) {
  const paid = payroll(league, team);
  return (
    <Meter
      label="Salary cap"
      share={paid / rules.cap}
      tone={paid > rules.cap ? 'over' : undefined}
      value={
        <>
          {money(paid)} of {money(rules.cap)} · space <b>{money(capSpace(league, team))}</b> · {skatersOn(league, team).length}/{rules.rosterSkaters} skaters,{' '}
          {goaliesOn(league, team).length}/{rules.rosterGoalies} goalie
        </>
      }
    />
  );
}

/** Filled and empty dots, for strikes, series scores and levels. */
export function Dots({ filled, total }: { filled: number; total: number }) {
  return (
    <span class="dots">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={i < filled ? 'dot on' : 'dot'} />
      ))}
    </span>
  );
}

/**
 * The strip in the top bar of every screen: what you have to spend, each named the same way everywhere.
 * Cap room limits player pay; cash pays for everything else; Pucks are won and spent during a season.
 */
export function Wallet({ f }: { f: Franchise }) {
  const inSeason = f.season.phase === 'map' || f.season.phase === 'playoffs';
  return (
    <div class="wallet">
      <span class="chip">
        <i>Cap room</i>
        <b>{money(capSpace(f.league, userTeam(f.league)))}</b>
      </span>
      <span class={`chip${f.cash < 0 ? ' neg' : ''}`}>
        <i>Cash</i>
        <b>{money(f.cash)}</b>
      </span>
      {inSeason && (
        <span class="chip pucks">
          <i>Pucks</i>
          <b>{f.season.currency}</b>
        </span>
      )}
    </div>
  );
}

/**
 * One choice as a card: an icon, its name, what it is set to, and (for something with ranks) a pip
 * for each rank. Every "press to change" row in the menus is one of these, so they all look alike.
 */
export function OptionCard({ icon, name, value, pips, chip, off = false, children }: { icon: IconName; name: string; value?: string; pips?: { filled: number; total: number }; chip?: string; off?: boolean; children?: ComponentChildren }) {
  return (
    <span class={`opt-card${off ? ' off' : ''}`}>
      <span class="opt-icon">
        <Icon name={icon} size={22} />
      </span>
      <span class="opt-text">
        <b>{name}</b>
        {value && <small>{value}</small>}
      </span>
      {children}
      {pips && (
        <span class="opt-pips" aria-label={`${pips.filled} of ${pips.total}`}>
          {Array.from({ length: pips.total }, (_, i) => (
            <i key={i} class={i < pips.filled ? 'on' : ''} />
          ))}
        </span>
      )}
      {chip && <i class="opt-chip">{chip}</i>}
    </span>
  );
}

/** A rink's outline from its own numbers, small: longer, shorter, rounder as the rink is. */
export function RinkOutline({ length, width, corner, nets }: { length: number; width: number; corner: number; nets: number }) {
  // Drawn in a box 60 by 30 that the standard rink fills.
  const k = 60 / 52;
  const w = length * k;
  const h = width * k;
  const x = (60 - w) / 2;
  const y = (30 - h) / 2;
  const mouth = nets * k * 1.6;
  return (
    <svg class="rink-outline" width="60" height="30" viewBox="0 0 60 30" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} rx={corner * k} />
      <path d={`M30 ${y}v${h}`} />
      <path d={`M${x + 4 * k} ${15 - mouth / 2}v${mouth}M${x + w - 4 * k} ${15 - mouth / 2}v${mouth}`} stroke-width="2.6" />
    </svg>
  );
}
