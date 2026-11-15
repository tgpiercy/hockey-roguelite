import data from '../data/voice.json';
import { bossInfo } from './bosses';
import { teamOf, userTeam } from './league';
import type { PlayerRecord } from './player';
import { expectationMet } from './expectation';
import { currentStop, isCupTie, isRival, maxStrikes, type Franchise } from './season';
import { createRng } from './rng';

/**
 * The club's two voices: the town's paper, which prints the news, and the radio announcer, who has a
 * line before each game. Neither invents anything: each line is picked from the wordings in voice.json
 * by what the season already knows (a streak, a rival, a boss, the books, a veteran in the lineup).
 */

export type ContextId = keyof typeof data.contexts;
export const CONTEXTS = Object.keys(data.contexts) as ContextId[];
export const TAGLINE = data.tagline;
export const THRESHOLDS = data.thresholds;

/** The town a team is from: every team name is a town and then a noun ("Redcliff Miners", "Marlow Bay Badgers"). */
export function townOf(teamName: string): string {
  const words = teamName.split(' ');
  return words.length > 1 ? words.slice(0, -1).join(' ') : teamName;
}

/** The town's paper: the same club always has the same one. */
export function paperName(teamName: string): string {
  return `The ${townOf(teamName)} ${createRng(`paper/${teamName}`).pick(data.papers)}`;
}

/** The club's radio announcer: the same club always has the same one. */
export function announcerName(teamName: string): string {
  const rng = createRng(`announcer/${teamName}`);
  return `${rng.pick(data.announcers.first)} ${rng.pick(data.announcers.last)}`;
}

/** What a line may need filling in. Anything a context does not use is left out. */
export interface VoiceFacts {
  team: string;
  town: string;
  n?: number;
  rival?: string;
  boss?: string;
  person?: string;
  role?: string;
  player?: string;
  age?: number;
  goals?: number;
  /** A nickname, and the league the club plays in. */
  nick?: string;
  league?: string;
}

/** One thing the season has to say right now, with what its lines need. Most pressing first when listed. */
export interface Context {
  id: ContextId;
  facts: VoiceFacts;
}

/** A line for a context, fixed by the label (so the same game always gets the same line), with its blanks filled. */
export function lineFor(context: Context, label: string): string {
  const lines = data.contexts[context.id];
  const line = createRng(`voice/${label}/${context.id}`).pick(lines);
  return fill(line, context.facts);
}

function fill(line: string, facts: VoiceFacts): string {
  return line.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = (facts as unknown as Record<string, string | number | undefined>)[key];
    return value === undefined ? '' : String(value);
  });
}

/** The announcer's line: one of his habits of speech now and then, and the line. */
export function announcerLine(context: Context, label: string): string {
  const lines = data.contexts[context.id];
  const template = createRng(`voice/${label}/${context.id}`).pick(lines);
  const line = fill(template, context.facts);
  const rng = createRng(`voice/${label}/habit`);
  // About one line in three starts with one of his turns of phrase. A line that opens on a name or a number keeps its capital.
  if (!rng.chance(0.34)) return line;
  const habit = rng.pick(data.habits);
  return template.startsWith('{') ? `${habit} ${line}` : `${habit} ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

/** Every blank a context's lines use, for checking that a context is given what it needs. */
export function blanksOf(id: ContextId): string[] {
  const found = new Set<string>();
  for (const line of data.contexts[id]) for (const m of line.matchAll(/\{(\w+)\}/g)) found.add(m[1] as string);
  return [...found];
}

/**
 * What the season has to say right now, most pressing first. Each is something the game already knows:
 * who is next, the strikes, the streak, the books, last year's banner, and who is in the lineup.
 * There is always at least one (the plain night).
 */
export function seasonContexts(f: Franchise): Context[] {
  const { season, league } = f;
  const team = userTeam(league);
  const base: VoiceFacts = { team: team.name, town: townOf(team.name) };
  const out: Context[] = [];
  const stop = currentStop(f);
  const waiting = season.stage === 'arrived' && stop ? stop : null;

  if (waiting?.kind === 'boss' && waiting.bossId) {
    const boss = bossInfo(waiting.bossId);
    out.push({ id: 'boss', facts: { ...base, boss: boss.name, person: boss.person.name, role: boss.person.role } });
  }
  // A cup tie waiting is the night's business, after a boss and before a rival.
  if (waiting && isCupTie(f, waiting)) out.push({ id: 'cupTie', facts: base });
  if (waiting?.kind === 'game' && waiting.opponentId && isRival(f, waiting.opponentId)) {
    out.push({ id: 'rival', facts: { ...base, rival: teamOf(league, waiting.opponentId).name } });
  }
  if (season.phase === 'playoffs') out.push({ id: 'playoffs', facts: base });
  if (season.phase === 'map' && season.strikes >= maxStrikes(f) - 1 && season.strikes > 0) out.push({ id: 'lastStrike', facts: base });
  if (f.cash < THRESHOLDS.lowCash) out.push({ id: 'broke', facts: base });
  const streak = season.streak ?? 0;
  if (streak <= -THRESHOLDS.loseStreak) out.push({ id: 'loseStreak', facts: { ...base, n: -streak } });
  if (streak >= THRESHOLDS.winStreak) out.push({ id: 'winStreak', facts: { ...base, n: streak } });
  if (season.phase === 'map' && season.gamesPlayed === 0) out.push({ id: 'opener', facts: base });
  const last = (f.history ?? [])[(f.history ?? []).length - 1];
  // The first nights after a step up to a bigger league come before the banner.
  const promoted = (f.promotions ?? [])[(f.promotions ?? []).length - 1];
  if (promoted && last && promoted.season === last.season && season.gamesPlayed < THRESHOLDS.openingGames) out.push({ id: 'newLeague', facts: { ...base, league: promoted.league } });
  if (last?.outcome === 'champion' && season.gamesPlayed < THRESHOLDS.openingGames) out.push({ id: 'champions', facts: base });
  // The sponsor's target, one win away.
  const target = season.expectation;
  if (season.phase === 'map' && target?.kind === 'wins' && season.gamesWon === target.wins - 1) out.push({ id: 'targetNear', facts: base });

  // People: the scorer who is running hot, a rookie finding his feet, the oldest man still dressing.
  const dressed = season.dressed.map((id) => league.players[id]).filter((p): p is PlayerRecord => p !== undefined && p.position !== 'G');
  const goalsOf = (id: string): number => season.scoring?.[id]?.goals ?? 0;
  const hot = [...dressed].sort((a, b) => goalsOf(b.id) - goalsOf(a.id) || a.id.localeCompare(b.id))[0];
  if (hot && goalsOf(hot.id) >= THRESHOLDS.hotGoals) out.push({ id: 'hot', facts: { ...base, player: hot.name, goals: goalsOf(hot.id) } });
  const rookie = [...dressed].filter((p) => p.age <= THRESHOLDS.rookieAge && goalsOf(p.id) > 0).sort((a, b) => a.age - b.age || a.id.localeCompare(b.id))[0];
  if (rookie) out.push({ id: 'rookie', facts: { ...base, player: rookie.name, age: rookie.age, goals: goalsOf(rookie.id) } });
  const veteran = [...dressed].filter((p) => p.age >= THRESHOLDS.veteranAge).sort((a, b) => b.age - a.age || a.id.localeCompare(b.id))[0];
  if (veteran) out.push({ id: 'veteran', facts: { ...base, player: veteran.name, age: veteran.age } });

  // The quieter facts of the season: the cup, the sponsor satisfied, a name earned, an old player on the staff, a season shared.
  if (season.cup?.alive && season.cup.won > 0 && season.phase === 'map') out.push({ id: 'cupAlive', facts: { ...base, n: season.cup.won } });
  if (season.cup && !season.cup.alive && season.phase === 'map') out.push({ id: 'cupOut', facts: base });
  if (target && expectationMet(f)) out.push({ id: 'targetMet', facts: base });
  const named = [...dressed].filter((p) => p.nickname).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (named?.nickname) out.push({ id: 'nickname', facts: { ...base, player: named.name, nick: named.nickname } });
  const old = (f.staff ?? []).find((member) => member.id.startsWith('legacy/'));
  if (old) out.push({ id: 'legacy', facts: { ...base, player: old.name } });
  if (season.coop) out.push({ id: 'twoPlayers', facts: base });

  out.push({ id: 'plain', facts: base });
  return out;
}

/** The announcer's line before the game waiting (or for the night in general): the most pressing thing, in his words. */
export function pregameLine(f: Franchise): string {
  const label = `${f.season.seed}/${f.season.gamesPlayed}`;
  return announcerLine(leadContext(f, label), label);
}

/** The quiet things, which are true most nights: they take turns, so the same one is not said every game. */
const QUIET: ContextId[] = ['hot', 'rookie', 'veteran', 'cupAlive', 'cupOut', 'targetMet', 'nickname', 'legacy', 'twoPlayers', 'plain'];

/** The thing to lead with: whatever is pressing, or on a quiet night one of the quiet things, by turns. */
export function leadContext(f: Franchise, label: string): Context {
  const all = seasonContexts(f);
  const pressing = all.find((c) => !QUIET.includes(c.id));
  if (pressing) return pressing;
  return createRng(`voice/${label}/quiet`).pick(all);
}

/** The paper's own lines for the news page: the two most pressing things, most pressing first. */
export function paperLines(f: Franchise): string[] {
  const label = `${f.season.seed}/${f.season.gamesPlayed}/paper`;
  const lead = leadContext(f, label);
  const second = seasonContexts(f).find((c) => c.id !== lead.id);
  return [lead, ...(second ? [second] : [])].map((context) => lineFor(context, label));
}
