import { goaliesOn, skatersOn, type League, type Team } from '../core/league';
import type { PlayerRecord } from '../core/player';
import { capSpace, payroll } from '../core/roster';
import rules from '../data/league.json';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';

export const money = (dollars: number): string => `$${(dollars / 1_000_000).toFixed(2)}M`;

export function Grade({ player }: { player: PlayerRecord }) {
  return <span class={`grade grade-${player.grade.replace('+', 'plus')}`}>{player.grade}</span>;
}

/** One player as a row: grade, overall, name, position, age, cap hit, years, and an optional note. */
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
      {bump !== 0 && <span class="bump">{bump > 0 ? `+${bump}` : bump} this season</span>}
      {note && <span class="note">{note}</span>}
    </span>
  );
}

/** A player's individual ratings, shown under the list for whoever is focused. */
export function Ratings({ player }: { player: PlayerRecord }) {
  const pairs: [string, number][] =
    player.position === 'G'
      ? (() => {
          const r = player.ratings as GoalieRatings;
          return [
            ['Reflexes', r.reflexes],
            ['Positioning', r.positioning],
            ['Rebounds', r.reboundControl],
            ['Stamina', r.stamina],
          ];
        })()
      : (() => {
          const r = player.ratings as SkaterRatings;
          return [
            ['Shooting', r.shooting],
            ['Passing', r.passing],
            ['Speed', r.speed],
            ['Checking', r.checking],
            ['Puck control', r.puckControl],
            ['Stamina', r.stamina],
          ];
        })();
  return (
    <span class="ratings">
      {pairs.map(([label, value]) => (
        <span key={label}>
          {label} <b>{value}</b>
        </span>
      ))}
    </span>
  );
}

export function CapLine({ league, team }: { league: League; team: Team }) {
  return (
    <span>
      Cap {money(payroll(league, team))} of {money(rules.cap)} · space <b>{money(capSpace(league, team))}</b> · {skatersOn(league, team).length}/
      {rules.rosterSkaters} skaters, {goaliesOn(league, team).length}/{rules.rosterGoalies} goalie
    </span>
  );
}

/** Filled and empty dots, for strikes and series scores. */
export function Dots({ filled, total }: { filled: number; total: number }) {
  return (
    <span class="dots">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={i < filled ? 'dot on' : 'dot'} />
      ))}
    </span>
  );
}
