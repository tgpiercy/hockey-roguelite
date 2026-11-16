import rules from '../data/offseason.json';
import { playerOf, teamOf, userTeam } from './league';
import { dressedSkaters } from './lineup';
import type { PlayerRecord } from './player';
import { createRng } from './rng';
import type { ActionResult, Franchise } from './season';
import { judgeTrade, swapPlayers } from './trades';

/**
 * The trade deadline: once a season, as the last region opens, a few clubs each offer one skater for one
 * of yours. The offers stand until your next game. One may be taken; the roster is otherwise locked all
 * season. Each offer is a trade the other club would make by the off-season's own rule (`judgeTrade`).
 */

/** What kind of deal an offer is: a better, older player now; a younger one with more to come; or a forward for a defenceman of about the same worth. */
export type DeadlineKind = 'veteran' | 'prospect' | 'swap';

export interface DeadlineOffer {
  teamId: string;
  /** The player they would send. */
  theirId: string;
  /** The player of yours they want. */
  mineId: string;
  kind: DeadlineKind;
}

const D = rules.deadline;
const KINDS: DeadlineKind[] = ['veteran', 'prospect', 'swap'];

/** A deal's name and what it means, for the screen. */
export function deadlineWords(kind: DeadlineKind): { name: string; what: string } {
  return D.kinds[kind];
}

/** How much you would like this pair as a deal of this kind; null if it is not one. */
function appeal(kind: DeadlineKind, mine: PlayerRecord, theirs: PlayerRecord): number | null {
  if (kind === 'veteran') {
    const gain = theirs.overall - mine.overall;
    return theirs.age >= D.veteranMinAge && theirs.age > mine.age && gain >= D.veteranGain && gain <= D.veteranMaxGain ? gain : null;
  }
  if (kind === 'prospect') {
    const gain = theirs.potential - Math.max(mine.overall, mine.potential);
    return theirs.age <= D.prospectMaxAge && mine.age >= D.prospectFromAge && gain >= D.prospectGain ? gain : null;
  }
  const gap = theirs.overall - mine.overall;
  return mine.position !== theirs.position && Math.abs(gap) <= D.swapMaxGap ? gap : null;
}

/** Draws the offers: one of each kind where a club can be found for it, each from a different club and for a different player of yours. */
function draw(f: Franchise): DeadlineOffer[] {
  const { league, season } = f;
  const rng = createRng(`${season.seed}/deadline`);
  const mine = userTeam(league)
    .roster.map((id) => playerOf(league, id))
    .filter((p) => p.position !== 'G')
    .sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1));
  // Nobody asks for your best players: those are not for sale at the deadline.
  const askable = mine.slice(D.keepBest);
  const clubs = rng.shuffle(league.teams.filter((t) => t.id !== league.userTeamId).map((t) => t.id));
  const offers: DeadlineOffer[] = [];
  const usedClubs = new Set<string>();
  const usedMine = new Set<string>();
  for (const kind of KINDS) {
    if (offers.length >= D.offers) break;
    for (const teamId of clubs) {
      if (usedClubs.has(teamId)) continue;
      let best: { offer: DeadlineOffer; appeal: number } | null = null;
      for (const theirId of teamOf(league, teamId).roster) {
        const theirs = playerOf(league, theirId);
        if (theirs.position === 'G') continue;
        for (const m of askable) {
          if (usedMine.has(m.id)) continue;
          const liked = appeal(kind, m, theirs);
          if (liked === null || (best && liked <= best.appeal)) continue;
          if (!judgeTrade(f, m.id, teamId, theirId).ok) continue;
          best = { offer: { teamId, theirId, mineId: m.id, kind }, appeal: liked };
        }
      }
      if (best) {
        offers.push(best.offer);
        usedClubs.add(teamId);
        usedMine.add(best.offer.mineId);
        break;
      }
    }
  }
  return offers;
}

/** True while the deadline's offers stand. */
export function deadlineOpen(f: Franchise): boolean {
  return f.season.deadline !== undefined && f.season.phase === 'map';
}

/** The offers on the table: drawn the first time they are asked for, then kept. Empty when the deadline is not open. */
export function deadlineOffers(f: Franchise): DeadlineOffer[] {
  const { season } = f;
  if (!deadlineOpen(f) || !season.deadline) return [];
  if (!season.deadline.offers) season.deadline.offers = draw(f);
  return season.deadline.offers;
}

/** Takes one of the offers. The newcomer goes straight into the place of the player who left; the other offers are withdrawn. */
export function acceptDeadline(f: Franchise, index: number): ActionResult {
  const offer = deadlineOffers(f)[index];
  if (!offer) return { ok: false, reason: 'That offer is no longer on the table.' };
  const verdict = judgeTrade(f, offer.mineId, offer.teamId, offer.theirId);
  if (!verdict.ok) return verdict;
  const { league, season } = f;
  const team = userTeam(league);
  const gone = playerOf(league, offer.mineId);
  const come = playerOf(league, offer.theirId);
  // He takes the very spot the other man had, so the lines stay as you set them.
  const into = (line: (string | null)[]): (string | null)[] => line.map((id) => (id === gone.id ? come.id : id));
  team.lineup.line1 = into(team.lineup.line1);
  team.lineup.line2 = into(team.lineup.line2);
  swapPlayers(f, gone.id, offer.teamId, come.id);
  if (team.lineup.goalie) season.dressed = [...dressedSkaters(team.lineup), team.lineup.goalie];
  delete season.deadline;
  return { ok: true, message: `Traded ${gone.name} to ${teamOf(league, offer.teamId).name} for ${come.name}. He takes ${gone.name}'s place; the other offers are withdrawn.` };
}
