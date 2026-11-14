import type { ComponentChildren } from 'preact';
import { goaliesOn, skatersOn, userTeam, type League, type Team } from '../core/league';
import type { PlayerRecord } from '../core/player';
import { capSpace, payroll } from '../core/roster';
import type { Franchise } from '../core/season';
import gearData from '../data/gear.json';
import rules from '../data/league.json';

const ratingNames = gearData.ratingNames as Record<string, string>;

export const money = (dollars: number): string => `${dollars < 0 ? '−' : ''}$${(Math.abs(dollars) / 1_000_000).toFixed(2)}M`;

export function Grade({ player }: { player: PlayerRecord }) {
  return <span class={`grade grade-${player.grade.replace('+', 'plus')}`}>{player.grade}</span>;
}

/** One player as a row: grade, overall, name, position, age, pay, contract years, level, and an optional note. */
export function PlayerRow({ player, note, bump = 0 }: { player: PlayerRecord; note?: string; bump?: number }) {
  return (
    <span class="player-row">
      <Grade player={player} />
      <span class="ovr">{player.overall}</span>
      <span class="pname">{player.name}</span>
      <span class="pos">{player.position}</span>
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

/** A player's individual ratings as bars, shown in the side panel for whoever is focused. */
export function Ratings({ player }: { player: PlayerRecord }) {
  const ratings = player.ratings as unknown as Record<string, number>;
  return (
    <div class="ratings">
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
 * Cap space limits player pay; cash pays for everything; tape levels up gear; Pucks are won and spent during a season.
 */
export function Wallet({ f }: { f: Franchise }) {
  const inSeason = f.season.phase === 'map' || f.season.phase === 'playoffs';
  return (
    <div class="wallet">
      <span class="chip">
        <i>Cap space</i>
        <b>{money(capSpace(f.league, userTeam(f.league)))}</b>
      </span>
      <span class={`chip${f.cash < 0 ? ' neg' : ''}`}>
        <i>Cash</i>
        <b>{money(f.cash)}</b>
      </span>
      <span class="chip">
        <i>Tape</i>
        <b>{f.tape}</b>
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
