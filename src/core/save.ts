import type { League } from './league';
import { newSeasonState, type Franchise, type SeasonState, type TeamRecord } from './season';

export { emptyRecord, type TeamRecord } from './season';

/** Bump this whenever the shape of a save changes, and add a step to `migrations`. */
export const SAVE_VERSION = 2;

export interface SaveFile {
  schemaVersion: number;
  /** When it was saved, as an ISO date and time. */
  savedAt: string;
  league: League;
  record: TeamRecord;
  /** Where the season stands: map, position, strikes, currency, powerups and so on. Added in version 2. */
  season: SeasonState;
  /** Artifact ids owned. Added in version 2. */
  artifacts: string[];
}

export type LoadResult = { ok: true; save: SaveFile } | { ok: false; reason: string };

export function toSave(franchise: Franchise, savedAt: string): SaveFile {
  return { schemaVersion: SAVE_VERSION, savedAt, ...franchise };
}

/** The part of a save the game plays with. */
export function franchiseOf(save: SaveFile): Franchise {
  return { league: save.league, record: save.record, season: save.season, artifacts: save.artifacts };
}

/**
 * One step per version: `migrations[n]` turns a version-n save into a version n+1 save.
 * When the save shape changes, add the step here rather than breaking old saves.
 */
const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // Version 2 (Phase 5) added the season run and artifacts. An older save starts in the off-season with none.
  1: (old) => ({ ...old, season: newSeasonState(), artifacts: [] }),
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks that a version-current save has the parts the game needs. Returns what is wrong, or null. */
function problemWith(save: Record<string, unknown>): string | null {
  const league = save.league;
  if (!isObject(league)) return 'it has no league';
  if (!isObject(league.players)) return 'it has no players';
  if (!Array.isArray(league.teams) || league.teams.length === 0) return 'it has no teams';
  if (!Array.isArray(league.freeAgents)) return 'it has no free-agent list';
  if (typeof league.userTeamId !== 'string') return 'it does not say which team is yours';
  const players = league.players;
  for (const team of league.teams as unknown[]) {
    if (!isObject(team) || typeof team.id !== 'string' || !Array.isArray(team.roster) || !isObject(team.lineup)) return 'a team is damaged';
    if ((team.roster as unknown[]).some((id) => typeof id !== 'string' || !(id in players))) return 'a team lists a player who does not exist';
  }
  if (!(league.teams as Record<string, unknown>[]).some((team) => team.id === league.userTeamId)) return 'your team is missing';
  if ((league.freeAgents as unknown[]).some((id) => typeof id !== 'string' || !(id in players))) return 'the free-agent list names a player who does not exist';
  const record = save.record;
  if (!isObject(record) || typeof record.wins !== 'number' || typeof record.losses !== 'number') return 'it has no win-loss record';
  if (!isObject(save.season) || typeof save.season.phase !== 'string') return 'it does not say where the season stands';
  if (!Array.isArray(save.artifacts)) return 'it has no artifact list';
  return null;
}

/**
 * Reads a save from parsed JSON (or anything else). Older versions are brought up to date step by step;
 * a save from a newer version of the game, or one that is damaged, is refused with a reason.
 */
export function fromSave(raw: unknown): LoadResult {
  if (!isObject(raw)) return { ok: false, reason: 'That is not a save file.' };
  let save = raw;
  let version = save.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'That is not a save file: it has no version number.' };
  }
  if (version > SAVE_VERSION) {
    return { ok: false, reason: `That save is from a newer version of the game (save version ${version}; this game reads up to ${SAVE_VERSION}).` };
  }
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (!step) return { ok: false, reason: `That save is too old to read (save version ${version}).` };
    save = step(save);
    version += 1;
    save.schemaVersion = version;
  }
  const problem = problemWith(save);
  if (problem) return { ok: false, reason: `That save is damaged: ${problem}.` };
  return { ok: true, save: save as unknown as SaveFile };
}

/** Reads a save from text, such as an exported file. */
export function parseSave(text: string): LoadResult {
  try {
    return fromSave(JSON.parse(text));
  } catch {
    return { ok: false, reason: 'That file is not readable as a save.' };
  }
}
