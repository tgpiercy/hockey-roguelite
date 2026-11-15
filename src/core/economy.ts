import prestigeRules from '../data/prestige.json';
import data from '../data/economy.json';
import { clubStat } from './club';
import { facilityUpkeep } from './facilities';
import { book, newLedger, totals, type SeasonBooks } from './ledger';
import { rosterOf, userTeam } from './league';
import { mascotPower, mascotSalary } from './mascot';
import type { PlayerRecord } from './player';
import { payroll, type MoveResult } from './roster';
import type { Franchise } from './season';
import { staffSalaries, staffSalePrice } from './staff';
import leagueRules from '../data/league.json';
import gradeRules from '../data/grades.json';

/**
 * The most the owner will pay in salaries: a share of what the club is worth plus a share of the cash
 * it holds, and never more than the league's cap. A richer club can carry a dearer team, and cash
 * spent on buildings is cash the owner no longer counts toward players.
 */
export function payrollLimit(f: Franchise): number {
  const raw = f.value * data.payroll.shareOfValue + Math.max(0, f.cash) * data.payroll.shareOfCash;
  const share = Math.round(raw / gradeRules.capRounding) * gradeRules.capRounding;
  return Math.min(leagueRules.cap, share);
}

/** Room left under the payroll limit. */
export function payRoom(f: Franchise): number {
  return payrollLimit(f) - payroll(f.league, userTeam(f.league));
}

const millions = (dollars: number): string => `$${(dollars / 1_000_000).toFixed(2)}M`;

/**
 * Would taking on this much more pay break the owner's limit? Pay at or under `always` is never refused:
 * a full bench of the cheapest players is always allowed.
 */
export function overLimit(f: Franchise, extra: number, always: number): MoveResult {
  const after = payroll(f.league, userTeam(f.league)) + extra;
  const limit = payrollLimit(f);
  if (extra <= always || after <= limit) return { ok: true };
  return { ok: false, reason: `Over your payroll limit: the owner allows ${millions(limit)} (set by what the club is worth and the cash it holds) and this would make it ${millions(after)}.` };
}

export const STARTING_CASH = data.startingCash;
export const STARTING_VALUE = data.startingValue;

/** Games alternate home and road, starting at home. `gameNumber` counts from 1. */
export function isHomeGame(gameNumber: number): boolean {
  return gameNumber % 2 === 1;
}

/**
 * Whether a game of the season under way is at home. Games alternate, except where the season says
 * otherwise: in a playoff series the higher seed is at home for the first and third games.
 */
export function homeGame(f: Franchise, gameNumber: number): boolean {
  const set = f.season.homeOverride?.[gameNumber];
  return set === undefined ? isHomeGame(gameNumber) : set;
}

/** Players good enough to sell shirts. */
export function starCount(f: Franchise): number {
  return rosterOf(f.league, userTeam(f.league)).filter((p) => p.overall >= data.starMinOverall).length;
}

/** Ticket money for one home game: better when you are winning, and with a bigger arena or a promoter. */
export function ticketMoney(f: Franchise): number {
  const { gamesPlayed, gamesWon } = f.season;
  const winRate = gamesPlayed === 0 ? 0.5 : gamesWon / gamesPlayed;
  return Math.round(clubStat(f, 'ticketRevenue', data.ticketsPerHomeGame * (data.ticketFormBase + data.ticketFormPerWinRate * winRate)));
}

/** Merchandise money for one game: more with star players, a stronger mascot and a promoter. */
export function merchMoney(f: Franchise): number {
  const base = data.merchPerGame + data.merchPerStar * starCount(f);
  return Math.round(clubStat(f, 'merchRevenue', base * (1 + data.merchPerMascotPower * mascotPower(f))));
}

/** Sponsorship for the season: a share of what the franchise is worth. */
export function sponsorshipMoney(f: Franchise): number {
  // Each prestige level raises the share sponsors pay.
  const share = data.sponsorShareOfValue + f.prestige.level * prestigeRules.sponsorSharePerLevel;
  return Math.round(clubStat(f, 'sponsorRevenue', share * f.value));
}

/**
 * Books the money for the game just recorded (the season's game count already includes it):
 * tickets at home, travel on the road, merchandise either way, and a gate for a home playoff game.
 * Returns the net amount, for the message.
 */
export function bookGame(f: Franchise, playoff: boolean): number {
  const before = f.cash;
  const home = homeGame(f, f.season.gamesPlayed);
  if (home) {
    book(f, 'tickets', ticketMoney(f));
    if (playoff) book(f, 'playoffGate', data.playoffGate);
  } else {
    book(f, 'travel', data.travelPerRoadGame);
  }
  book(f, 'merchandise', merchMoney(f));
  return f.cash - before;
}

/** The bonus for each season milestone reached. */
export function bookMilestones(f: Franchise, count: number): number {
  book(f, 'milestones', count * data.milestoneBonus);
  return count * data.milestoneBonus;
}

/** What will be booked when the season ends, as things stand: one income line and four bills. */
export function seasonEndBills(f: Franchise): { sponsorship: number; salaries: number; staff: number; upkeep: number; mascot: number } {
  return {
    sponsorship: sponsorshipMoney(f),
    salaries: payroll(f.league, userTeam(f.league)),
    staff: staffSalaries(f),
    upkeep: facilityUpkeep(f),
    mascot: mascotSalary(),
  };
}

/**
 * The end of a season: sponsorship comes in; players, staff, upkeep and the mascot are paid;
 * the franchise value moves with profit, wins and a title; and the books are closed and kept.
 * Call it before the roster changes for the off-season, and before the season state is reset.
 */
export function bookSeasonEnd(f: Franchise): SeasonBooks {
  const bills = seasonEndBills(f);
  book(f, 'sponsorship', bills.sponsorship);
  book(f, 'salaries', bills.salaries);
  book(f, 'staff', bills.staff);
  book(f, 'upkeep', bills.upkeep);
  book(f, 'mascot', bills.mascot);

  const v = data.value;
  const champion = f.season.outcome === 'champion';
  f.value = Math.max(v.floor, Math.round(f.value + v.profitShare * totals(f.ledger).profit + v.perWin * f.season.gamesWon + (champion ? v.title : 0)));

  const closed: SeasonBooks = { season: f.league.season, ledger: f.ledger, cashEnd: f.cash, valueEnd: f.value, wins: f.season.gamesWon, champion };
  f.books.push(closed);
  f.ledger = newLedger();
  return closed;
}

// ---------- the fire sale ----------

/** Cash below zero in the off-season: the next season cannot start until it is put right. */
export function inFireSale(f: Franchise): boolean {
  return f.season.phase === 'offseason' && f.cash < 0;
}

/**
 * What releasing a player pays during a fire sale: another club takes over his contract for half a season
 * of his cap hit. Nothing for a player whose contract has run out, or who joined this off-season.
 */
export function playerSalePrice(f: Franchise, player: PlayerRecord): number {
  if (!inFireSale(f) || player.contractYears <= 0 || f.offseason.signed.includes(player.id)) return 0;
  return Math.round(player.capHit * data.fireSale.playerShare);
}

/** True in a fire sale once there is no player or staff contract left that would raise any cash. */
export function canBailOut(f: Franchise): boolean {
  if (!inFireSale(f)) return false;
  const players = rosterOf(f.league, userTeam(f.league));
  return players.every((p) => playerSalePrice(f, p) === 0) && f.staff.every((s) => staffSalePrice(f, s) === 0);
}

/** The last resort: the league covers the debt and the franchise loses a slice of its value. */
export function bailOut(f: Franchise): MoveResult {
  if (!canBailOut(f)) return { ok: false, reason: 'The league only steps in once you have nothing left to sell.' };
  book(f, 'sales', -f.cash);
  f.value = Math.max(data.value.floor, Math.round(f.value * (1 - data.value.bailoutLoss)));
  return { ok: true };
}
