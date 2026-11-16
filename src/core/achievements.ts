import data from '../data/achievements.json';
import { vowPoints } from './charter';
import { userTeam } from './league';
import type { Franchise } from './season';

/** What a feat opens up once it is done. */
export type Unlock =
  /** A jersey colour to wear. */
  | { kind: 'jersey'; name: string; colour: string }
  /** A charter to start a season under. */
  | { kind: 'charter'; id: string }
  /** One more powerup to choose from when a season starts. */
  | { kind: 'powerupChoice' };

/**
 * A feat: something done once in the life of a franchise, which opens something up for good. Each is a
 * data entry of an existing kind, judged from the franchise as it stands; what has been done is kept in
 * `f.feats`.
 */
export interface Achievement {
  id: string;
  name: string;
  /** What has to be done, as a sentence. */
  text: string;
  kind: string;
  n: number;
  unlock: Unlock;
}

export const ACHIEVEMENTS = data.achievements as Achievement[];
export const ACHIEVEMENT_KINDS = ['titles', 'cups', 'cleanTitle', 'handicapTitle', 'coopTitle', 'bosses', 'found', 'careerGoals', 'nicknames'] as const;

/** How far along a feat is, as a count toward its `n` (never more than `n`). */
export function progress(f: Franchise, a: Achievement): number {
  const history = f.history ?? [];
  const champion = f.season.outcome === 'champion';
  const count = ((): number => {
    switch (a.kind) {
      case 'titles':
        // From the history, which a season joins as it closes: so these are marked in the off-season.
        return history.filter((s) => s.outcome === 'champion').length;
      case 'cups':
        return history.filter((s) => s.cup).length;
      case 'cleanTitle':
        return champion && f.season.strikes === 0 ? a.n : 0;
      case 'handicapTitle':
        return champion ? Math.min(a.n, vowPoints(f.season.vows)) : 0;
      case 'coopTitle':
        return (champion && f.season.coop) || history.some((s) => s.outcome === 'champion' && s.coop) ? a.n : 0;
      case 'bosses':
        return (f.bossesBeaten ?? []).length;
      case 'found':
        return (f.seen?.artifacts ?? []).length;
      case 'careerGoals':
        return Math.max(0, ...Object.values(f.career ?? {}).map((line) => line.goals));
      case 'nicknames':
        return userTeam(f.league).roster.filter((id) => f.league.players[id]?.nickname).length;
      default:
        return 0;
    }
  })();
  return Math.min(a.n, count);
}

export function achieved(f: Franchise, id: string): boolean {
  return (f.feats ?? []).includes(id);
}

/** Marks every feat now done that was not before, and returns them, for telling the player. */
export function earnAchievements(f: Franchise): Achievement[] {
  const fresh = ACHIEVEMENTS.filter((a) => !achieved(f, a.id) && progress(f, a) >= a.n);
  if (fresh.length > 0) f.feats = [...(f.feats ?? []), ...fresh.map((a) => a.id)];
  return fresh;
}

/** Everything opened up so far, of one kind. */
function unlocked<K extends Unlock['kind']>(f: Franchise, kind: K): Extract<Unlock, { kind: K }>[] {
  return ACHIEVEMENTS.filter((a) => achieved(f, a.id) && a.unlock.kind === kind).map((a) => a.unlock as Extract<Unlock, { kind: K }>);
}

/** Jersey colours opened up by feats. */
export function featJerseys(f: Franchise): { name: string; colour: string }[] {
  return unlocked(f, 'jersey').map(({ name, colour }) => ({ name, colour }));
}

/** True if a charter may be chosen: one that needs no feat, or whose feat is done. */
export function charterOpen(f: Franchise, charterId: string): boolean {
  const needs = ACHIEVEMENTS.find((a) => a.unlock.kind === 'charter' && a.unlock.id === charterId);
  return !needs || achieved(f, needs.id);
}

/** How many more powerups than usual a season's choice is made from. */
export function extraPowerupChoices(f: Franchise): number {
  return unlocked(f, 'powerupChoice').length;
}

/** What a feat opens up, in words. */
export function unlockWords(a: Achievement, charterName: (id: string) => string): string {
  if (a.unlock.kind === 'jersey') return `the ${a.unlock.name} jersey`;
  if (a.unlock.kind === 'charter') return `the ${charterName(a.unlock.id)} charter`;
  return 'one more powerup to choose from when a season starts';
}
