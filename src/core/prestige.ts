import rules from '../data/prestige.json';
import type { MoveResult } from './roster';
import type { Franchise } from './season';

export interface Jersey {
  name: string;
  colour: string;
}

/** The jersey colours unlocked so far: one to start with, and one more for each prestige level. */
export function unlockedJerseys(f: Franchise): Jersey[] {
  return rules.jerseys.slice(0, Math.min(rules.jerseys.length, f.prestige.level + 1));
}

/** The colour the team wears on the ice. */
export function jerseyColour(f: Franchise): string {
  return (unlockedJerseys(f)[f.prestige.jersey] ?? rules.jerseys[0]!).colour;
}

export function setJersey(f: Franchise, index: number): MoveResult {
  if (index < 0 || index >= unlockedJerseys(f).length) return { ok: false, reason: 'That jersey is not unlocked yet.' };
  f.prestige.jersey = index;
  return { ok: true };
}

/** Prestige is offered in the off-season, once the championship has been won at the current level. */
export function canPrestige(f: Franchise): MoveResult {
  if (f.season.phase !== 'offseason') return { ok: false, reason: 'Prestige is decided in the off-season.' };
  if (f.prestige.level >= rules.maxLevel) return { ok: false, reason: 'You are at the highest prestige level.' };
  if (!f.prestige.championAt) return { ok: false, reason: 'Win the championship at this level first.' };
  return { ok: true };
}

/**
 * Prestige: artifacts are given up for a permanent level. The roster, contracts, gear, tape, XP and
 * ratings all stay. Each level makes the league harder, improves pack odds and unlocks a jersey colour.
 */
export function prestige(f: Franchise): MoveResult {
  const allowed = canPrestige(f);
  if (!allowed.ok) return allowed;
  f.prestige.level += 1;
  f.prestige.championAt = false;
  f.artifacts = [];
  f.season.powerups = [];
  f.season.loadout = f.season.loadout.map(() => null);
  return { ok: true };
}

/** What a prestige level changes, in words, for the screen. */
export function prestigeEffects(level: number): string[] {
  const odds = Math.round((rules.rarityBoostPerLevel ** level - 1) * 100);
  return [
    `Opponents play ${level * rules.opponentRatingPerLevel} rating points better and react sooner.`,
    `Rare, Epic and Legendary gear is ${odds}% more likely in packs.`,
    `${Math.min(rules.jerseys.length, level + 1)} jersey colours unlocked.`,
  ];
}
