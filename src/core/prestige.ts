import { featJerseys } from './achievements';
import { userTeam } from './league';
import { teamColour } from './teamColours';
import rules from '../data/prestige.json';
import type { MoveResult } from './roster';
import type { Franchise } from './season';

export interface Jersey {
  name: string;
  colour: string;
}

/** The jersey colours unlocked so far: one to start with, and one more for each prestige level. */
export function unlockedJerseys(f: Franchise): Jersey[] {
  // The first is the club's own colour, worked out from its name as every other team's is.
  const club: Jersey = { name: 'Club colours', colour: teamColour(userTeam(f.league).name) };
  // Then one for each prestige level, then the ones feats have opened.
  return [club, ...rules.jerseys.slice(1, Math.min(rules.jerseys.length, f.prestige.level + 1)), ...featJerseys(f)];
}

/** The colour the team wears on the ice. */
export function jerseyColour(f: Franchise): string {
  const open = unlockedJerseys(f);
  return (open[f.prestige.jersey] ?? open[0]!).colour;
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
  // Going up is a line in the club's history.
  // (The league's year has already moved on to the next season when a prestige is taken.)
  const won = (f.history ?? [])[(f.history ?? []).length - 1]?.season ?? f.league.season;
  (f.promotions ??= []).push({ season: won, league: leagueName(f.prestige.level) });
  // The club gets something back: a facility level to build for nothing (and a bigger share of sponsorship, see economy).
  f.prestige.freeBuilds = (f.prestige.freeBuilds ?? 0) + rules.freeBuildsPerLevel;
  f.artifacts = [];
  f.season.powerups = [];
  f.season.loadout = f.season.loadout.map(() => null);
  return { ok: true };
}

/** The league a club plays in at a prestige level: each level is a step up to a bigger league. */
export function leagueName(level: number): string {
  return rules.leagues[Math.min(Math.max(0, level), rules.leagues.length - 1)] as string;
}

/** What a prestige level changes, in words, for the screen. */
export function prestigeEffects(level: number): string[] {
  const odds = Math.round((rules.rarityBoostPerLevel ** level - 1) * 100);
  return [
    `Opponents play ${level * rules.opponentRatingPerLevel} rating points better and react sooner.`,
    `Rare, Epic and Legendary gear is ${odds}% more likely in packs.`,
    `Sponsors pay ${Math.round(level * rules.sponsorSharePerLevel * 100)}% more of the club's value each season.`,
    `One facility level to build for free, each time you climb.`,
    `${Math.min(rules.jerseys.length, level + 1)} jersey colours unlocked.`,
  ];
}
