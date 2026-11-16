import { expectationMet, nextExpectation, type Expectation } from './expectation';
import { cleanName, nicknameFor, nicknamesOf, NICKNAME_RULES } from './temperament';
import { bountyFor, bountyMet, STICKERS, UNSEEN_WEIGHT, type BountyInfo } from './bounty';
import { isGuest, ringerOffer, withRinger, type Ringer } from './ringer';
import { rinkInfo } from './rinks';
import { charterInfo, cleanVows, opponentModifiers, setupModifiers, STANDARD_CHARTER, type SeasonSetup } from './charter';
import type { MatchRules } from '../sim/types';
import { isVariant, RINK_BONUS } from './rinks';
import standingsRules from '../data/standings.json';
import type { CareerLine, SeasonRecord } from './chronicle';
import { creditGoals, newStandings, playoffField, playRound, recordResult, settleSeries, type LeagueResult, type Scoring, type Standings } from './standings';
import gearRules from '../data/gear.json';
import artifacts from '../data/artifacts.json';
import events from '../data/events.json';
import powerups from '../data/powerups.json';
import prestigeRules from '../data/prestige.json';
import rules from '../data/season.json';
import type { GameResult } from '../sim/match';
import { modified, type Modifier, type PowerupSpec } from '../sim/modifiers';
import { aiTeamsByStrength, bossInfo, buildBoss, teamStrength } from './bosses';
import { clubModifiers } from './club';
import { bookGame, bookMilestones, STARTING_CASH, STARTING_VALUE, isHomeGame, homeGame } from './economy';
import { newFacilities, homeIceModifiers } from './facilities';
import { newLedger, type Ledger, type SeasonBooks } from './ledger';
import { aiMascot, bossMascot, dropInChance, mascotSetup, newMascot, sitsFor, userMascot, type MascotSpec, type MascotState, MASCOT_ID } from './mascot';
import { generateStaffPool, type StaffMember } from './staff';
import { playerGearModifiers, type GearItem } from './gear';
import { playerOf, teamOf, userTeam, type League } from './league';
import { dressedSkaters, setLineupSlot } from './lineup';
import { applyResult, dress, type DressedTeam } from './matchup';
import { newMilestones, tally, type MilestoneInfo } from './milestones';
import { levelEdge, quickResult } from './quickGame';
import { awardPack, packForWin, packName, type Pack } from './packs';
import { gameXp, homeShare } from './xp';
import { createRng, type Rng } from './rng';
import { canPlay } from './roster';
import { generateMap, type SeasonMap, type Stop } from './seasonMap';

export interface TeamRecord {
  wins: number;
  losses: number;
  /** Games lost in overtime. */
  overtimeLosses: number;
}

export function emptyRecord(): TeamRecord {
  return { wins: 0, losses: 0, overtimeLosses: 0 };
}

/** A team modifier that lasts a set number of games, such as tired legs after an event. */
export interface TempEffect {
  label: string;
  games: number;
  modifiers: Modifier[];
}

export interface SeasonState {
  /** "offseason": roster moves allowed. "map" and "playoffs": the run. "ended": waiting to be wrapped up. */
  phase: 'offseason' | 'map' | 'playoffs' | 'ended';
  seed: string;
  map: SeasonMap | null;
  /** The stop being dealt with now, or null while choosing where to go next. */
  current: string | null;
  /** "arrived": the stop is still to be done. "reward": a boss is beaten and an artifact is to be picked. */
  stage: 'none' | 'arrived' | 'reward' | 'ringer';
  /** The loan skaters on offer after a boss, and the one playing for you this season. */
  ringerOffer?: Ringer[];
  ringer?: Ringer;
  /** Stickers on the artifacts now on offer, by artifact id. */
  offerStickers?: Record<string, 'loan' | 'pricey'>;
  /** Artifacts on loan: games left, by artifact id. And those that cost Pucks after every game. */
  loans?: Record<string, number>;
  pricey?: string[];
  /** Artifact ids on offer after beating a boss. */
  offer: string[];
  /** The last stop finished. */
  last: string | null;
  /** Every stop finished this season, in order: the route walked, for the map. */
  visited: string[];
  strikes: number;
  /** What the sponsor expects of this season (expectation.ts). Left out in a season begun before there was one. */
  expectation?: Expectation;
  /** The cup: ties won so far, and whether you are still in it. Won by winning a tie in every region. */
  cup?: { won: number; alive: boolean };
  /** True once any game of the season was played with a second player on your team. */
  coop?: boolean;
  /** Wins in a row (positive) or losses in a row (negative), for the paper and the announcer. */
  streak?: number;
  /** How the season was set up: its charter and the handicap ranks taken (charter.ts). Left out, a standard season. */
  charter?: string;
  vows?: Record<string, number>;
  /** Goals your defencemen have scored this season, for a charter that counts them. */
  defenceGoals?: number;
  /** How many regions this season's map has. Left out, the usual number. */
  regions?: number;
  /** Set for a weekly run (its week): it ends when its last boss is beaten, with no playoffs. */
  weekly?: string;
  /** Bargain artifacts whose handicap is still running: games left, by artifact id. */
  bargains?: Record<string, number>;
  /** Rolls in a row that have missed for each opponent's mascot this season, by team id (a boss: "boss/" and its id). */
  mascotMisses?: Record<string, number>;
  /** True once the next boss has been scouted: he plays below himself when you meet. Cleared when he is beaten. */
  scouted?: boolean;
  /** What training has given each player this season beyond the all-round bump: a rating boost or a trait, as modifiers. */
  training?: Record<string, Modifier[]>;
  /** Run currency: spent in shops, wiped at season end. */
  currency: number;
  /** Powerup ids in the bag. The same id can appear more than once. */
  powerups: string[];
  /** The powerup loaded on each of the two buttons for the next game, or null. */
  loadout: (string | null)[];
  /** Season-long rating bumps from training and events, by player id. */
  bumps: Record<string, number>;
  temps: TempEffect[];
  playoffs: { round: number; wins: number; losses: number; opponentId: string } | null;
  /** The league table for this season, every team's line. Left out in a season begun before the league kept one. */
  standings?: Standings;
  /** Goals and assists for every player in the league this season. */
  scoring?: Scoring;
  /** Map games you have lost this season, by the team that beat you: lose often enough and they become a rival. */
  lossesTo?: Record<string, number>;
  /** The other teams' results in the latest round, for the news. */
  lastRound?: LeagueResult[];
  /** The playoff field in seeding order, the other semi-final, and who won it once it is settled. */
  bracket?: { seeds: string[]; other: string[]; otherWinner: string | null };
  /** Games (by number) whose home or road is fixed: the higher seed's home games in a playoff series. */
  homeOverride?: Record<number, boolean>;
  /** The six skaters and the goalie locked in for the run. */
  dressed: string[];
  outcome: null | 'champion' | 'eliminated' | 'struckOut' | 'abandoned';
  /** How many seeded rolls have been made, so each one is different and repeatable. */
  rolls: number;
  gamesPlayed: number;
  gamesWon: number;
  /** Milestone ids reached this season. */
  milestones: string[];
  /** Goals this season by player id. */
  playerGoals: Record<string, number>;
  shutouts: number;
  /** True once any of your players has scored three in a game this season. */
  hatTrick: boolean;
  /** XP earned this season by player id. It is banked, and turned into levels, when the season ends. */
  xp: Record<string, number>;
}

/** One line of the off-season report: a player whose overall changed. */
export interface RatingChange {
  id: string;
  name: string;
  from: number;
  to: number;
}

/** What happened between seasons, for the report screen. */
export interface OffseasonReport {
  /** The season that just ended. */
  season: number;
  improved: RatingChange[];
  declined: RatingChange[];
  /** Names of your players who retired. */
  retired: string[];
  /** How many players retired across the whole league. */
  leagueRetired: number;
  /** League news, in words: who signed your former players, how many rookies arrived. */
  news: string[];
}

export interface OffseasonState {
  report: OffseasonReport | null;
  /** Your players whose contracts have run out and who are waiting for a decision. */
  pending: string[];
  /** Players you let go this off-season, so the news can say where they went. */
  released: string[];
  /** False until the AI teams have made their moves and the rookies have arrived. */
  leagueMoved: boolean;
  /** True once this off-season's rookies have arrived and the free-agent pool is open for you to pick from. */
  poolOpened?: boolean;
  /** Players and staff who joined this off-season. Letting one of them go in a fire sale pays nothing. */
  signed: string[];
}

export interface PrestigeState {
  level: number;
  /** True once you have won the championship at this prestige level. */
  championAt: boolean;
  /** Facility levels still to be built for nothing, earned by climbing. */
  freeBuilds?: number;
  /** Which unlocked jersey colour the team wears. */
  jersey: number;
}

/** Everything that is saved: the league, the record, where the season stands, and the artifacts owned. */
export interface Franchise {
  /** Each step up to a bigger league (a prestige): the season it came after, and the league's name. */
  promotions?: { season: number; league: string }[];
  league: League;
  record: TeamRecord;
  season: SeasonState;
  /** Artifact ids, kept across seasons until prestige. */
  artifacts: string[];
  /** Team ids of this season's rivals: beating one pays more. */
  rivals?: string[];
  /** Every finished season, oldest first, for the trophy room. */
  history?: SeasonRecord[];
  /** What each of your players has done for the club, by player id. */
  career?: Record<string, CareerLine>;
  /** Players who retired after a few seasons with you, in words. */
  greats?: string[];
  /** Every piece of gear the team owns. Permanent. */
  gear: GearItem[];
  /** Packs awarded and not yet opened. */
  packs: Pack[];
  /** Tape: earned by scrapping gear, spent on levelling it up. */
  tape: number;
  /** Packs awarded since the last one that held a Legendary, for the pity timer. */
  packsSinceLegendary: number;
  /** The week whose weekly-run prize has been collected. */
  weeklyClaimed?: string;
  /** The most handicap points a title has been won with while holding each artifact, by artifact id. */
  wonWith?: Record<string, number>;
  /** Artifacts you have ever held and events you have ever met: ones you have not come up more often. */
  seen?: { artifacts: string[]; events: string[] };
  /** How many packs have ever been awarded; also numbers the pieces. */
  gearCount: number;
  prestige: PrestigeState;
  offseason: OffseasonState;
  /** Operating cash, in dollars. It only moves through the ledger. */
  cash: number;
  /** Franchise value: the long-term score. */
  value: number;
  /** This season's money so far, by line. */
  ledger: Ledger;
  /** The books of every finished season, oldest first. */
  books: SeasonBooks[];
  /** The staff you employ, and the ones available to hire. */
  staff: StaffMember[];
  staffPool: StaffMember[];
  /** The level of each facility, by id. */
  facilities: Record<string, number>;
  mascot: MascotState;
  /** Seasons each of your players has been with you, by player id: scouting knows them better. */
  tenure: Record<string, number>;
  /** How sharp the opponents' AI is: a difficulty id from season.json. */
  difficulty: string;
}

export type ActionResult = { ok: true; message: string } | { ok: false; reason: string };
const done = (message = ''): ActionResult => ({ ok: true, message });
const refuse = (reason: string): ActionResult => ({ ok: false, reason });

export function newSeasonState(): SeasonState {
  return {
    phase: 'offseason',
    seed: '',
    map: null,
    current: null,
    stage: 'none',
    offer: [],
    last: null,
    visited: [],
    strikes: 0,
    currency: 0,
    powerups: [],
    loadout: Array.from({ length: rules.loadoutSlots }, () => null),
    bumps: {},
    temps: [],
    playoffs: null,
    dressed: [],
    outcome: null,
    rolls: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    milestones: [],
    playerGoals: {},
    shutouts: 0,
    hatTrick: false,
    xp: {},
  };
}

export function newPrestigeState(): PrestigeState {
  return { level: 0, championAt: false, jersey: 0 };
}

export function newOffseasonState(): OffseasonState {
  return { report: null, pending: [], released: [], leagueMoved: true, signed: [] };
}

export function newFranchise(league: League, difficulty: string = rules.startingDifficulty): Franchise {
  return {
    league,
    record: emptyRecord(),
    season: newSeasonState(),
    artifacts: [],
    gear: [],
    packs: [],
    tape: 0,
    packsSinceLegendary: 0,
    gearCount: 0,
    prestige: newPrestigeState(),
    offseason: newOffseasonState(),
    ...newClub(league.seed, league.season),
    difficulty: difficultyInfo(difficulty).id,
  };
}

/** The business side of a new franchise: starting cash and value, nothing built, nobody hired, and a mascot. */
export function newClub(seed: string, season: number): Pick<Franchise, 'cash' | 'value' | 'ledger' | 'books' | 'staff' | 'staffPool' | 'facilities' | 'mascot' | 'tenure'> {
  return {
    cash: STARTING_CASH,
    value: STARTING_VALUE,
    ledger: newLedger(),
    books: [],
    staff: [],
    staffPool: generateStaffPool(seed, season),
    facilities: newFacilities(),
    mascot: newMascot(seed),
    tenure: {},
  };
}

// ---------- look-ups ----------

export interface DifficultyInfo {
  id: string;
  name: string;
  /** Added to every opponent's AI level. */
  levelShift: number;
  description: string;
  /** Added to the opponents' AI level in each region, and in the playoffs, on top of `levelShift`. Left out, nothing. */
  regionShift?: number[];
  playoffShift?: number;
  /** Strikes added to the season's limit. Left out, none. */
  extraStrikes?: number;
  /** True where a loss to a boss ends the season at once, whatever strikes were left. */
  bossLossEnds?: boolean;
}

export const DIFFICULTIES = rules.difficulties as DifficultyInfo[];

/** The difficulty with this id, or the starting one if the id is unknown. */
export function difficultyInfo(id: string): DifficultyInfo {
  return (DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES.find((d) => d.id === rules.startingDifficulty) ?? DIFFICULTIES[0]) as DifficultyInfo;
}

/** Changes the difficulty. Only between seasons, so a run is played at one level throughout. */
export function setDifficulty(f: Franchise, id: string): ActionResult {
  if (f.season.phase !== 'offseason') return refuse('The difficulty can only be changed between seasons.');
  if (!DIFFICULTIES.some((d) => d.id === id)) return refuse('There is no such difficulty.');
  f.difficulty = id;
  return done(`Difficulty set to ${difficultyInfo(id).name}.`);
}

const clampLevel = (level: number): number => Math.max(0, Math.min(1, level));

export interface PowerupInfo extends PowerupSpec {
  description: string;
  price: number;
}

export function powerupInfo(id: string): PowerupInfo {
  return (powerups.find((p) => p.id === id) ?? powerups[0]) as PowerupInfo;
}

export interface ArtifactInfo {
  id: string;
  name: string;
  description: string;
  modifiers: Modifier[];
  /** A bargain: for this many games after it is taken the handicap counts in place of the modifiers. */
  bargain?: { games: number; handicap: Modifier[] };
  /** Made by holding these two together; never offered itself. */
  recipe?: [string, string];
}

export function artifactInfo(id: string): ArtifactInfo {
  return (artifacts.find((a) => a.id === id) ?? artifacts[0]) as ArtifactInfo;
}

export interface EventChoice {
  label: string;
  outcomes: { weight?: number; result: string; effects: EventEffect[] }[];
}

export type EventEffect =
  | { type: 'currency'; amount: number }
  | { type: 'powerup'; id?: string }
  | { type: 'losePowerup' }
  | { type: 'strike'; amount: number }
  | { type: 'bump'; who: 'random' | 'best' | 'worst' | 'all'; amount: number }
  | { type: 'scout' }
  | { type: 'skillPoint'; who: 'best' | 'worst' | 'random'; amount: number }
  | { type: 'artifact' }
  | { type: 'temp'; label: string; games: number; modifiers: Modifier[] };

export interface EventInfo {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

export function eventInfo(id: string): EventInfo {
  return (events.find((e) => e.id === id) ?? events[0]) as EventInfo;
}

/** A fresh, repeatable random stream for one decision in this season. */
function roll(season: SeasonState, label: string): Rng {
  season.rolls += 1;
  return createRng(`${season.seed}/${label}/${season.rolls}`);
}

/** Modifiers from the artifacts owned. */
export function artifactModifiers(f: Franchise): Modifier[] {
  return f.artifacts.flatMap((id) => {
    const info = artifactInfo(id);
    const list = info.bargain && bargainGames(f, id) > 0 ? info.bargain.handicap : info.modifiers;
    // A modifier that only counts some of the time carries the artifact's name, to show while it is in force.
    return list.map((m) => (m.when !== undefined || m.on !== undefined ? { ...m, label: info.name } : m));
  });
}

/** How many more games a bargain's handicap has to run (0 when it has turned into its reward, or is no bargain). */
export function bargainGames(f: Franchise, artifactId: string): number {
  return f.season.bargains?.[artifactId] ?? 0;
}

/** Adds an artifact to the ones you hold. A bargain starts its handicap. */
function gainArtifact(f: Franchise, artifactId: string): void {
  f.artifacts.push(artifactId);
  const bargain = artifactInfo(artifactId).bargain;
  if (bargain) f.season.bargains = { ...(f.season.bargains ?? {}), [artifactId]: bargain.games };
  remember(f, 'artifacts', artifactId);
  // A recipe: two held together become a third. (One on loan is not yours to combine.)
  for (const made of artifacts as unknown as ArtifactInfo[]) {
    if (!made.recipe || !made.recipe.every((part) => f.artifacts.includes(part) && !(f.season.loans?.[part] ?? 0))) continue;
    f.artifacts = [...f.artifacts.filter((id) => !made.recipe!.includes(id)), made.id];
    if (f.season.pricey) f.season.pricey = f.season.pricey.filter((id) => !made.recipe!.includes(id));
    remember(f, 'artifacts', made.id);
  }
}

/** Notes an artifact or an event as one you have had. */
function remember(f: Franchise, what: 'artifacts' | 'events', id: string): void {
  const seen = (f.seen ??= { artifacts: [], events: [] });
  if (!seen[what].includes(id)) seen[what].push(id);
}

/** What two artifacts you hold would make, if you had the other half: for the screens. */
export function recipeFor(artifactId: string): { partner: string; makes: string } | null {
  const made = (artifacts as unknown as ArtifactInfo[]).find((a) => a.recipe?.includes(artifactId));
  if (!made || !made.recipe) return null;
  return { partner: made.recipe.find((id) => id !== artifactId) as string, makes: made.id };
}

/**
 * Conditions that are known before the puck drops, and so are settled then: on for the whole game or
 * dropped. (The ones that change during a game, such as "leading", are the simulation's: conditions.ts.)
 */
export const BEFORE = ['home', 'away', 'cupTie', 'rival', 'boss', 'targetMet'] as const;

/** Which of those hold for the game waiting (or, between games, for the season as it stands). */
export function beforeFacts(f: Franchise): Record<(typeof BEFORE)[number], boolean> {
  const stop = currentStop(f);
  const atHome = homeGame(f, f.season.gamesPlayed + 1);
  return {
    home: atHome,
    away: !atHome,
    cupTie: isCupTie(f, stop),
    rival: stop?.kind === 'game' && isRival(f, stop.opponentId),
    boss: stop?.kind === 'boss',
    targetMet: f.season.expectation !== undefined && expectationMet(f),
  };
}

/** Settles the before-the-game conditions: a modifier whose condition holds becomes a plain one, the others go. */
function settleBefore(modifiers: Modifier[], facts: Record<string, boolean>): Modifier[] {
  return modifiers.flatMap((m) => {
    if (m.when === undefined || !(BEFORE as readonly string[]).includes(m.when)) return [m];
    if (!facts[m.when]) return [];
    const { when: _when, label: _label, ...plain } = m;
    return [plain];
  });
}

/** Every lasting modifier on the player's team for the next game: artifacts, temporary effects, and what facilities and staff give. */
export function teamModifiers(f: Franchise): Modifier[] {
  // At home the arena adds its home-ice edge.
  const atHome = homeGame(f, f.season.gamesPlayed + 1);
  const home = atHome ? homeIceModifiers(f) : [];
  return [...settleBefore(artifactModifiers(f), beforeFacts(f)), ...seasonSetupModifiers(f), ...f.season.temps.flatMap((t) => t.modifiers), ...clubModifiers(f), ...home];
}

/** A season-level number (such as currency gain) after the artifacts owned. */
function stat(f: Franchise, name: string, base: number): number {
  return modified(base, name, [...settleBefore(artifactModifiers(f), beforeFacts(f)), ...seasonSetupModifiers(f)]);
}

/** How this season was set up. */
export function setupOf(f: Franchise): SeasonSetup {
  return { ...(f.season.charter ? { charter: f.season.charter } : {}), ...(f.season.vows ? { vows: f.season.vows } : {}) };
}

/** What the season's charter and handicaps give your side, for the ice and for the season rules. */
function seasonSetupModifiers(f: Franchise): Modifier[] {
  return f.season.charter || f.season.vows ? setupModifiers(setupOf(f), f.season.defenceGoals ?? 0) : [];
}

/** How many strikes end the season: the usual number, less any a handicap takes. */
export function maxStrikes(f: Franchise): number {
  return Math.max(1, Math.round(stat(f, 'maxStrikes', rules.maxStrikes + (difficultyInfo(f.difficulty).extraStrikes ?? 0))));
}

/** How many regions this season has. */
export function seasonRegions(f: Franchise): number {
  return f.season.regions ?? rules.regions;
}

export function currentStop(f: Franchise): Stop | null {
  const { season } = f;
  return season.current && season.map ? (season.map.stops[season.current] ?? null) : null;
}

/** During a season the roster is locked: no signing or releasing, and the spare skater stays home. */
export function rosterLocked(f: Franchise): boolean {
  return f.season.phase !== 'offseason';
}

/** The stops that can be travelled to now. Empty while a stop is being dealt with. */
export function availableStops(f: Franchise): Stop[] {
  const { season } = f;
  if (season.phase !== 'map' || !season.map || season.stage !== 'none' || season.current !== null) return [];
  const map = season.map;
  const ids = (() => {
    if (season.last === null) return map.regionStarts[0] ?? [];
    const last = map.stops[season.last];
    if (!last) return [];
    if (last.next.length > 0) return last.next;
    return map.regionStarts[last.region + 1] ?? [];
  })();
  return ids.map((id) => map.stops[id]).filter((s): s is Stop => s !== undefined);
}

// ---------- starting and ending ----------

/** Whether your side of things is ready for a season: contracts decided, cash not below zero, a lineup that can play. */
export function canStartSeason(f: Franchise): ActionResult {
  if (f.season.phase !== 'offseason') return refuse('A season is already under way.');
  if (f.offseason.pending.length > 0) return refuse('Decide your expiring contracts first.');
  if (f.cash < 0) return refuse('You are out of cash. Raise money before the season can start.');
  const ready = canPlay(f.league, userTeam(f.league));
  return ready.ok ? done() : refuse(ready.reason);
}

/**
 * Locks in the dressed lineup and generates the season's map. The rest of the league must have made its
 * off-season moves first: start a season through `beginSeason` in offseason.ts, which sees to that.
 */
export function startSeason(f: Franchise, setup: SeasonSetup & { regions?: number; weekly?: string } = {}): ActionResult {
  const mine = canStartSeason(f);
  if (!mine.ok) return mine;
  if (!f.offseason.leagueMoved) return refuse('The other teams have not made their off-season moves yet.');
  const team = userTeam(f.league);

  const season = newSeasonState();
  season.phase = 'map';
  season.seed = `${f.league.seed}/season-${f.league.season}`;
  // The set-up first: the map and everything after may depend on it.
  const charter = charterInfo(setup.charter);
  if (charter.id !== STANDARD_CHARTER) season.charter = charter.id;
  const vows = cleanVows(setup.vows);
  if (Object.keys(vows).length > 0) season.vows = vows;
  const regions = setup.regions ?? charter.regions;
  if (regions !== undefined) season.regions = Math.max(1, Math.min(rules.regions, regions));
  if (setup.weekly) season.weekly = setup.weekly;
  season.map = generateMap(season.seed, aiTeamsByStrength(f.league), season.regions ?? rules.regions, f.seen?.events ?? []);
  // The sponsor names its target, and the cup begins. (A weekly run has neither: it is not the club's season.)
  if (!setup.weekly) {
    season.expectation = nextExpectation(f);
    season.cup = { won: 0, alive: true };
  }
  season.dressed = [...dressedSkaters(team.lineup), team.lineup.goalie as string];
  season.standings = newStandings(f.league);
  season.scoring = {};
  f.season = season;
  // Each season is its own build: last season's artifacts are gone.
  f.artifacts = [];
  const gift = roll(season, 'start');
  const starting = Math.max(0, Math.round(stat(f, 'startingPowerups', rules.startingPowerups)));
  for (let i = 0; i < starting; i++) season.powerups.push(gift.pick(powerups).id);
  return done('The season begins.');
}

/** Wraps up a finished season: powerups, currency, bumps and effects are wiped; artifacts stay. */
/**
 * Gives up the season under way. It ends at once, as a season that fell short: the off-season follows as
 * after any other, so everyone still ages a year and contracts tick down.
 */
export function abandonSeason(f: Franchise): ActionResult {
  if (f.season.phase !== 'map' && f.season.phase !== 'playoffs') return refuse('There is no season under way to abandon.');
  f.season.phase = 'ended';
  f.season.outcome = 'abandoned';
  f.season.current = null;
  f.season.stage = 'none';
  return { ok: true, message: 'You abandon the season.' };
}

export function endSeason(f: Franchise): ActionResult {
  if (f.season.phase !== 'ended') return refuse('The season is not over.');
  f.league.season += 1;
  f.season = newSeasonState();
  return done('A new off-season begins.');
}

// ---------- moving on the map ----------

export function travel(f: Franchise, stopId: string): ActionResult {
  const stop = availableStops(f).find((s) => s.id === stopId);
  if (!stop) return refuse('You cannot go there from here.');
  f.season.current = stop.id;
  f.season.stage = 'arrived';
  return done();
}

function finishStop(f: Franchise): void {
  const { season } = f;
  const stop = currentStop(f);
  season.last = season.current;
  if (season.current !== null) season.visited.push(season.current);
  season.current = null;
  season.stage = 'none';
  season.offer = [];
  // Leaving a region without having won its cup tie (lost, or not on your road) is the cup gone for the season.
  if (stop && stop.kind === 'boss' && season.cup && season.cup.alive && season.cup.won < stop.region + 1) season.cup.alive = false;
  // A weekly run is over when its last boss is beaten: there are no playoffs.
  if (stop && stop.kind === 'boss' && stop.region === seasonRegions(f) - 1 && season.weekly) {
    season.phase = 'ended';
    season.outcome = 'champion';
    return;
  }
  // Beating the last region's boss leads to the playoffs.
  if (stop && stop.kind === 'boss' && stop.region === seasonRegions(f) - 1) {
    season.phase = 'playoffs';
    if (season.standings) {
      // A real bracket: you and the best AI teams in the table, first against last and second against third.
      const seeds = playoffField(season.standings, f.league.userTeamId);
      const mine = seeds.indexOf(f.league.userTeamId);
      const opponent = seeds[seeds.length - 1 - mine] as string;
      season.bracket = { seeds, other: seeds.filter((id) => id !== f.league.userTeamId && id !== opponent), otherWinner: null };
      season.playoffs = { round: 0, wins: 0, losses: 0, opponentId: opponent };
      seriesHome(f, opponent);
    } else {
      season.playoffs = { round: 0, wins: 0, losses: 0, opponentId: playoffOpponent(f, 0) };
    }
  }
}

/** In a playoff series the higher seed is at home for games one and three. */
function seriesHome(f: Franchise, opponentId: string): void {
  const { season } = f;
  if (!season.bracket) return;
  const higher = season.bracket.seeds.indexOf(f.league.userTeamId) < season.bracket.seeds.indexOf(opponentId);
  const next = season.gamesPlayed + 1;
  season.homeOverride = { ...(season.homeOverride ?? {}), [next]: higher, [next + 1]: !higher, [next + 2]: higher };
}

/** True if this team is one of your rivals this season. */
export function isRival(f: Franchise, teamId: string | undefined | null): boolean {
  return Boolean(teamId) && (f.rivals ?? []).includes(teamId as string);
}

/** Your place among the playoff seeds (1 is the top seed), or null outside a seeded playoff. */
export function playoffSeed(f: Franchise, teamId: string = f.league.userTeamId): number | null {
  const at = f.season.bracket?.seeds.indexOf(teamId) ?? -1;
  return at === -1 ? null : at + 1;
}

/**
 * After a game of yours on the map, the rest of the league plays a round and the table is brought up to
 * date: your result, your opponent's, and everyone else's. Playoff games do not touch the table.
 */
function leagueRound(f: Franchise, game: Matchup, result: GameResult): void {
  const { season, league } = f;
  if (!season.standings || game.kind === 'playoff') return;
  const scoring = (season.scoring ??= {});
  const mine = league.userTeamId;
  const stop = currentStop(f);
  const theirs = game.kind === 'game' && stop?.opponentId ? stop.opponentId : null;
  const round = createRng(`${season.seed}/league-mine/${season.gamesPlayed}`);
  // Your own game goes into the table whoever it was against: a boss is not in the league, but the result still counts for you.
  recordResult(season.standings, { home: mine, away: theirs ?? '', homeGoals: result.score[0], awayGoals: result.score[1], overtime: result.overtime });
  if (theirs) creditGoals(league, theirs, result.score[1], round, scoring);
  if (theirs && result.winner !== 0) season.lossesTo = { ...(season.lossesTo ?? {}), [theirs]: (season.lossesTo?.[theirs] ?? 0) + 1 };
  // Your players' goals and assists come from the game itself.
  for (const line of result.players) {
    if (line.team !== 0 || line.role === 'goalie') continue;
    const player = game.home.players[line.line * 3 + line.slot];
    if (!player || isGuest(player.id) || (line.goals === 0 && line.assists === 0)) continue;
    const tally = (scoring[player.id] ??= { goals: 0, assists: 0 });
    tally.goals += line.goals;
    tally.assists += line.assists;
  }
  season.lastRound = playRound(league, season.standings, scoring, season.seed, season.gamesPlayed, theirs ? [mine, theirs] : [mine]);
}

/** The two strongest AI teams are the playoff opponents: the second best first, then the best. */
function playoffOpponent(f: Franchise, round: number): string {
  const order = aiTeamsByStrength(f.league);
  const index = Math.max(0, order.length - rules.playoffRounds + round);
  return order[index] as string;
}

// ---------- games ----------

export interface Matchup {
  home: DressedTeam;
  away: DressedTeam;
  /** AI level for the opponent before the tuning panel's difficulty shifts it. */
  level: number;
  /** What kind of game it is, for the screens. */
  kind: 'game' | 'boss' | 'playoff';
  title: string;
  /** The boss's trait, if it is a boss. */
  trait?: string;
  /** True for an elite game: a tougher opponent and a better prize. */
  elite?: boolean;
  powerups: (PowerupSpec | null)[];
  /** The rink it is played on (rinks.json). Left out, the standard rink. */
  rink?: string;
  /** Rules the season's charter changes in every game. */
  rules?: MatchRules;
  /** Each side's mascot tonight: who he is, the chance of his next roll, and who would give up his place. */
  mascots: { home: MascotOdds; away: MascotOdds };
}

export interface MascotOdds {
  mascot: MascotSpec;
  /** The chance of his next roll. */
  chance: number;
  /** The name of the skater whose place he would take. */
  sits: string;
}

/** The player's team as it takes the ice: dressed lineup, season bumps, artifacts and temporary effects. */
export function dressUser(f: Franchise): DressedTeam | null {
  const team = dressOwn(f);
  // A ringer hired this season takes your lowest-rated dressed skater's place.
  return team && f.season.ringer ? withRinger(team, f.season.ringer) : team;
}

function dressOwn(f: Franchise): DressedTeam | null {
  return dress(f.league, userTeam(f.league), {
    bumps: f.season.bumps,
    modifiers: teamModifiers(f),
    // What a player trained this season travels with his gear: rating boosts change his ratings, traits go to the ice.
    gear: (playerId) => [...playerGearModifiers(f, playerId), ...(f.season.training?.[playerId] ?? [])],
  });
}

/** The key an opponent's mascot is remembered under this season. */
function theirMascotKey(f: Franchise, kind: Matchup['kind']): string {
  const stop = currentStop(f);
  if (kind === 'boss' && stop?.bossId) return `boss/${stop.bossId}`;
  return kind === 'playoff' ? (f.season.playoffs?.opponentId ?? '') : (stop?.opponentId ?? '');
}

/**
 * The game waiting to be played at the current stop or playoff round, or null if there is none.
 * Each side brings its mascot: he may arrive at the opening faceoff, or at the start of a later period
 * when his team is two or more behind, and plays that period only (the simulation rolls it: sim/mascot.ts).
 */
export function matchup(f: Franchise): Matchup | null {
  const game = plainMatchup(f);
  if (!game) return null;
  const { season, league } = f;
  const stop = currentStop(f);
  const key = theirMascotKey(f, game.kind);
  const theirs = game.kind === 'boss' && stop?.bossId ? bossMascot(season.seed, stop.bossId, stop.region) : aiMascot(league, key);
  const bring = (team: DressedTeam, spec: MascotSpec, misses: number): { team: DressedTeam; odds: MascotOdds } => ({
    team: { ...team, setup: { ...team.setup, mascot: mascotSetup(spec, team, misses) } },
    odds: { mascot: spec, chance: dropInChance(misses), sits: team.players[sitsFor(team)]?.name ?? '' },
  });
  const home = bring(game.home, userMascot(f), f.mascot.misses ?? 0);
  // A boss club may bring its mascot every time: that is its trick.
  const bossMisses = game.kind === 'boss' && stop?.bossId ? bossInfo(stop.bossId).mascotMisses : undefined;
  const away = bring(game.away, theirs, bossMisses ?? season.mascotMisses?.[key] ?? 0);
  // The charter may give every opponent something, and change a rule of every game.
  const extra = opponentModifiers(setupOf(f));
  const awayTeam = extra.length > 0 ? { ...away.team, setup: { ...away.team.setup, modifiers: [...(away.team.setup.modifiers ?? []), ...extra] } } : away.team;
  const charterRules = charterInfo(season.charter).rules;
  return { ...game, home: home.team, away: awayTeam, mascots: { home: home.odds, away: away.odds }, ...(charterRules ? { rules: charterRules } : {}) };
}

/** After a game that was played: each mascot's run of misses is remembered. A simulated game has no rolls and changes nothing. */
function rememberMascots(f: Franchise, result: GameResult, key: string): void {
  const [mine, theirs] = result.mascots ?? [null, null];
  if (mine) f.mascot.misses = mine.misses;
  if (theirs && key) f.season.mascotMisses = { ...(f.season.mascotMisses ?? {}), [key]: theirs.misses };
}

function plainMatchup(f: Franchise): Omit<Matchup, 'mascots'> | null {
  const { season, league } = f;
  const home = dressUser(f);
  if (!home) return null;
  const loaded = season.loadout.map((id) => (id ? powerupInfo(id) : null));
  // Each prestige level makes every opponent a little better and a little sharper.
  const tougher = f.prestige.level * prestigeRules.opponentRatingPerLevel + stat(f, 'opponentRating', 0);
  // The difficulty shifts every opponent's AI level, and each prestige level sharpens it a little more.
  const sharper = f.prestige.level * prestigeRules.opponentLevelPerLevel + difficultyInfo(f.difficulty).levelShift + stat(f, 'opponentLevel', 0);

  if (season.phase === 'playoffs' && season.playoffs) {
    const away = dress(league, teamOf(league, season.playoffs.opponentId), { bumpAll: tougher });
    if (!away) return null;
    const round = season.playoffs.round === rules.playoffRounds - 1 ? 'Final' : 'Semi-final';
    return {
      home,
      away,
      level: clampLevel(rules.playoffLevel + sharper + (difficultyInfo(f.difficulty).playoffShift ?? 0)),
      kind: 'playoff',
      title: `${round}, game ${season.playoffs.wins + season.playoffs.losses + 1}`,
      powerups: loaded,
    };
  }

  const stop = currentStop(f);
  if (season.phase !== 'map' || !stop || season.stage !== 'arrived') return null;
  const eased = difficultyInfo(f.difficulty).regionShift ?? [];
  const level = clampLevel((rules.regionLevels[stop.region] ?? rules.regionLevels[rules.regionLevels.length - 1]!) + sharper + (eased[stop.region] ?? eased[eased.length - 1] ?? 0));
  if (stop.kind === 'boss' && stop.bossId) {
    const boss = bossInfo(stop.bossId);
    return {
      home,
      // A scouted boss plays below himself.
      away: buildBoss(league, stop.bossId, stop.region, season.seed, tougher - (season.scouted ? rules.scoutRatingCut : 0)),
      level: clampLevel(level + rules.bossLevelBonus - (season.scouted ? rules.scoutLevelCut : 0)),
      kind: 'boss',
      title: `Boss: ${boss.name}`,
      trait: `${boss.club} ${boss.trait}: ${boss.description} ${boss.trick}${season.scouted ? ' Scouted: his team is weaker and slower to react today.' : ''}`,
      powerups: loaded,
      ...(stop.rink ? { rink: stop.rink } : {}),
    };
  }
  if (stop.kind === 'game' && stop.opponentId) {
    const elite = stop.elite === true;
    const away = dress(league, teamOf(league, stop.opponentId), { bumpAll: tougher + (elite ? stat(f, 'eliteBump', rules.eliteRatingBump) : 0) });
    if (!away) return null;
    if (elite) return { home, away, level: clampLevel(level + rules.eliteLevelBonus), kind: 'game', title: `Elite game against ${away.name}`, powerups: loaded, elite: true };
    return { home, away, level, kind: 'game', title: `Game against ${away.name}`, powerups: loaded, ...(stop.rink ? { rink: stop.rink } : {}) };
  }
  return null;
}

/** Up to `count` artifacts the franchise does not own yet. */
function artifactOffer(f: Franchise, count: number): string[] {
  // Never one you hold, and never a recipe's result: those are made, not found.
  const unowned = (artifacts as unknown as ArtifactInfo[]).filter((a) => !a.recipe && !f.artifacts.includes(a.id)).map((a) => a.id);
  const rng = roll(f.season, 'artifacts');
  const seen = f.seen?.artifacts ?? [];
  const known = unowned.filter((id) => seen.includes(id)).length;
  // With nothing seen, or everything, every artifact is as likely as any other, as it always was.
  let offer: string[];
  if (known === 0 || known === unowned.length) offer = rng.shuffle(unowned).slice(0, count);
  else {
    // Otherwise the ones you have never held come up more often.
    const pool = unowned.map((id) => ({ id, weight: seen.includes(id) ? 1 : UNSEEN_WEIGHT }));
    offer = [];
    while (offer.length < count && pool.length > 0) {
      let at = rng.next() * pool.reduce((sum, x) => sum + x.weight, 0);
      let index = pool.findIndex((x) => (at -= x.weight) < 0);
      if (index < 0) index = pool.length - 1;
      offer.push((pool.splice(index, 1)[0] as { id: string }).id);
    }
  }
  // Some come with a sticker. (A stream of its own, so nothing else in the season shifts.)
  const stick = createRng(`${f.season.seed}/stickers/${f.season.gamesPlayed}`);
  const stickers: Record<string, 'loan' | 'pricey'> = {};
  for (const id of offer) if (stick.chance(STICKERS.chance)) stickers[id] = stick.pick(['loan', 'pricey'] as const);
  f.season.offerStickers = stickers;
  return offer;
}

function strike(f: Franchise): boolean {
  f.season.strikes += 1;
  if (f.season.strikes < maxStrikes(f)) return false;
  f.season.phase = 'ended';
  f.season.outcome = 'struckOut';
  f.season.current = null;
  f.season.stage = 'none';
  return true;
}

/** A Gold pack and a cash bonus for any season milestones just reached. Returns the milestones. */
function awardMilestones(f: Franchise): MilestoneInfo[] {
  const fresh = newMilestones(f);
  if (fresh.length > 0) bookMilestones(f, fresh.length);
  for (const m of fresh) awardPack(f, 'gold', `Milestone: ${m.name}`);
  return fresh;
}

const milestoneWords = (fresh: MilestoneInfo[]): string =>
  fresh.map((m) => ` Milestone reached: ${m.name}. You earn a ${packName('gold')} and a cash bonus.`).join('');

/** What a season game earned, for the rewards screen. Not saved: it describes the game just recorded. */
export interface GameRewards {
  won: boolean;
  /** True when the player gave the game up. */
  forfeit: boolean;
  score: [number, number];
  /** Cash in or out for the game, milestone bonuses included. */
  cash: number;
  /** Pucks won. */
  pucks: number;
  /** XP each of your players earned, dressed or not, in roster order. */
  xp: { id: string; name: string; earned: number }[];
  /** The name of the pack earned, or null. */
  pack: string | null;
  /** Names of the season milestones this game completed. */
  milestones: string[];
  /** The game's bounty, and whether it was met. Left out for a simulated game. */
  bounty?: { text: string; pucks: number; met: boolean };
}

export type GameOutcome = ActionResult & { rewards?: GameRewards };

/**
 * Records the game just played at the current stop or playoff round, and moves the season on.
 * A win earns a pack, and any season milestone it completes earns a Gold pack and a cash bonus.
 */
export function recordGame(f: Franchise, result: GameResult, played = true): GameOutcome {
  const game = matchup(f);
  // The bounty is for a game you play yourself.
  const bounty = played ? gameBounty(f) : null;
  const before = f.season.gamesPlayed;
  const pucksBefore = f.season.currency;
  const cashBefore = f.cash;
  const mascotKey = game ? theirMascotKey(f, game.kind) : '';
  const currentStopBefore = currentStop(f);
  const outcome = settleGame(f, result);
  if (!outcome.ok || !game || f.season.gamesPlayed === before) return outcome;
  const met = bounty !== null && bountyMet(bounty, result, game.home);
  // An artifact may make bounties pay more.
  const bountyPay = bounty ? Math.round(bounty.pucks * stat(f, 'bountyGain', 1)) : 0;
  if (bounty && met) f.season.currency += bountyPay;
  rememberMascots(f, result, mascotKey);

  tally(f, result, game.home);
  const named = earnNicknames(f, result, game.home, game.kind === 'game' && isRival(f, currentStopBefore?.opponentId));
  // Goals by your defencemen, for a charter that counts them. (A mascot's are his own, and are not here.)
  const byDefence = result.players.filter((p) => p.team === 0 && p.role === 'skater' && game.home.players[p.line * 3 + p.slot]?.position === 'D').reduce((sum, p) => sum + p.goals, 0);
  if (byDefence > 0) f.season.defenceGoals = (f.season.defenceGoals ?? 0) + byDefence;
  const net = bookGame(f, game.kind === 'playoff');
  // XP: dressed players earn their own; anyone on the roster who did not dress gets a share.
  const earned = gameXp(result, game.home);
  const share = homeShare(earned, game.home);
  const xp: GameRewards['xp'] = [];
  for (const id of userTeam(f.league).roster) {
    const amount = earned[id] ?? share;
    f.season.xp[id] = (f.season.xp[id] ?? 0) + amount;
    xp.push({ id, name: playerOf(f.league, id).name, earned: amount });
  }
  const millions = (Math.abs(net) / 1_000_000).toFixed(2);
  let message = `${result.forfeit ? 'You forfeit the game. ' : ''}${outcome.message} Cash ${net >= 0 ? '+' : '-'}$${millions}M.`;
  for (const line of named) message += ` ${line}`;
  if (bounty) message += met ? ` Bounty met (${bounty.text.toLowerCase()}): ${bountyPay} more Pucks.` : ` Bounty missed (${bounty.text.toLowerCase()}).`;
  const pack = packForWin(result, game.kind === 'boss');
  if (pack) {
    awardPack(f, pack, game.title);
    message += ` You earn a ${packName(pack)}.`;
  }
  const fresh = awardMilestones(f);
  return {
    ok: true,
    message: message + milestoneWords(fresh),
    rewards: {
      won: result.winner === 0,
      forfeit: result.forfeit === true,
      score: [result.score[0], result.score[1]],
      cash: f.cash - cashBefore,
      pucks: f.season.currency - pucksBefore,
      xp,
      pack: pack ? packName(pack) : null,
      milestones: fresh.map((m) => m.name),
      ...(bounty ? { bounty: { text: bounty.text, pucks: bountyPay, met } } : {}),
    },
  };
}

/** True if the game waiting is an ordinary map game, which can be simulated instead of played. */
export function canSimulate(f: Franchise): boolean {
  const game = matchup(f);
  // An elite game, like a boss or a playoff game, has to be played: its prize is for beating it yourself.
  // So does every game, under the handicap that says so.
  return game?.kind === 'game' && !game.elite && stat(f, 'noSimulate', 0) < 1;
}

/**
 * Settles an ordinary map game from team strength instead of playing it. Your team is counted a few
 * rating points weaker than it is, so playing is the better bet. Bosses and playoff games must be played.
 * Powerups are not used. Everything else (XP, cash, packs, strikes) is as for a played game.
 */
export function simulateGame(f: Franchise): GameOutcome {
  const game = matchup(f);
  if (!game) return refuse('There is no game to simulate.');
  if (game.kind !== 'game') return refuse('Bosses and playoff games have to be played.');
  const rng = roll(f.season, 'simulate');
  return recordGame(f, quickResult(rng, game.home, game.away, levelEdge(game.level) + rules.simPenalty), false);
}

function settleGame(f: Franchise, result: GameResult): ActionResult {
  const { season } = f;
  const game = matchup(f);
  if (!game) return refuse('There is no game to record.');
  if (!result.finished || result.winner === null) return done('The game was not finished, so it does not count.');

  // Used powerups leave the bag; temporary effects count down.
  for (const id of result.powerupsUsed) {
    const at = season.powerups.indexOf(id);
    if (at !== -1) season.powerups.splice(at, 1);
  }
  season.loadout = tidyLoadout(season.loadout, season.powerups);
  season.temps = season.temps.map((t) => ({ ...t, games: t.games - 1 })).filter((t) => t.games > 0);
  // A bargain's handicap runs down the same way; at nothing it turns into its reward.
  // An artifact on loan goes back when its games are up.
  if (season.loans) {
    const left = Object.fromEntries(Object.entries(season.loans).map(([id, games]) => [id, games - 1] as [string, number]));
    f.artifacts = f.artifacts.filter((id) => left[id] === undefined || left[id] > 0);
    season.loans = Object.fromEntries(Object.entries(left).filter(([, games]) => games > 0));
  }
  // What costs Pucks a game is paid now: a pricey artifact, a pricey ringer. (You cannot go below nothing.)
  const fees = (season.pricey ?? []).filter((id) => f.artifacts.includes(id)).length * STICKERS.priceyFee + (season.ringer?.fee ?? 0);
  if (fees > 0) season.currency = Math.max(0, season.currency - fees);
  if (season.bargains) season.bargains = Object.fromEntries(Object.entries(season.bargains).map(([id, games]) => [id, games - 1] as [string, number]).filter(([, games]) => games > 0));
  season.gamesPlayed += 1;
  f.record = applyResult(f.record, result);
  leagueRound(f, game, result);

  const won = result.winner === 0;
  const wasCupTie = isCupTie(f, currentStop(f));
  if (won) season.gamesWon += 1;
  // The run of results: wins count up from one, losses down from minus one.
  const run = season.streak ?? 0;
  season.streak = won ? (run > 0 ? run + 1 : 1) : run < 0 ? run - 1 : -1;
  const margin = Math.abs(result.score[0] - result.score[1]);
  const pay = (base: number): number => {
    const amount = Math.round(stat(f, 'currencyGain', base + Math.min(rules.maxMarginCurrency, margin * rules.marginCurrency)));
    season.currency += amount;
    return amount;
  };

  // Beating a rival on the map pays extra.
  const rivalBonus = isRival(f, game.kind === 'game' ? currentStop(f)?.opponentId : undefined) ? standingsRules.rivalCurrency : 0;

  if (game.kind === 'playoff' && season.playoffs) {
    const series = season.playoffs;
    if (won) {
      series.wins += 1;
      const amount = pay(rules.playoffWinCurrency);
      if (series.wins < rules.seriesWins) return done(`You win the game and ${amount} Pucks. The series stands ${series.wins}-${series.losses}.`);
      if (series.round < rules.playoffRounds - 1) {
        if (season.bracket && season.bracket.other.length === 2) {
          // The other semi-final was played while you played yours: its winner meets you in the final.
          const [a, b] = season.bracket.other as [string, string];
          const winner = settleSeries(f.league, a, b, rules.seriesWins, createRng(`${season.seed}/semi-final`));
          season.bracket.otherWinner = winner;
          season.playoffs = { round: series.round + 1, wins: 0, losses: 0, opponentId: winner };
          seriesHome(f, winner);
          return done(`You win the series and move on to the final, against ${teamOf(f.league, winner).name}.`);
        }
        season.playoffs = { round: series.round + 1, wins: 0, losses: 0, opponentId: playoffOpponent(f, series.round + 1) };
        return done('You win the series and move on to the final.');
      }
      season.phase = 'ended';
      season.outcome = 'champion';
      f.prestige.championAt = true;
      return done('Champions!');
    }
    series.losses += 1;
    if (series.losses < rules.seriesWins) return done(`You lose the game. The series stands ${series.wins}-${series.losses}.`);
    season.phase = 'ended';
    season.outcome = 'eliminated';
    return done('You lose the series. The season is over.');
  }

  if (game.kind === 'boss') {
    if (!won) {
      // On the harder settings a boss is met once: lose, and the season is over, whatever strikes were left.
      if (bossLossEnds(f)) {
        season.strikes = Math.min(maxStrikes(f), season.strikes + 1);
        season.phase = 'ended';
        season.outcome = 'struckOut';
        return done(`${game.away.name} beat you. A boss is met once: the season is over.`);
      }
      if (strike(f)) return done('The boss beats you. That is your third strike: the season is over.');
      return done(`The boss beats you. Strike ${season.strikes} of ${maxStrikes(f)}. You must play the boss again.`);
    }
    const amount = pay(rules.bossCurrency);
    delete season.scouted;
    // Beating a boss wipes a strike.
    const healed = Math.min(season.strikes, rules.bossHealsStrikes);
    season.strikes -= healed;
    const relief = healed > 0 ? ' The win wipes a strike.' : '';
    season.offer = artifactOffer(f, Math.max(1, Math.round(stat(f, 'artifactChoices', rules.artifactChoices))));
    if (season.offer.length === 0) {
      finishStop(f);
      return done(`You beat the boss and win ${amount} Pucks.${relief}`);
    }
    season.stage = 'reward';
    return done(`You beat the boss and win ${amount} Pucks.${relief} Choose an artifact.`);
  }

  if (!won) {
    if (strike(f)) return done('You lose. That is your third strike: the season is over.');
    finishStop(f);
    const out = wasCupTie && season.cup ? ((season.cup.alive = false), ' You are out of the cup.') : '';
    return done(`You lose. Strike ${season.strikes} of ${maxStrikes(f)}.${out}`);
  }
  if (game.elite) {
    // An elite win pays more and offers an artifact in place of the chance of a powerup.
    const prize = pay(rules.winCurrency + Math.round(stat(f, 'eliteGain', rules.eliteCurrency)) + rivalBonus);
    season.offer = artifactOffer(f, Math.max(1, Math.round(stat(f, 'artifactChoices', rules.eliteArtifactChoices))));
    if (season.offer.length > 0) {
      season.stage = 'reward';
      return done(`You win the elite game and earn ${prize} Pucks. Choose an artifact.`);
    }
    finishStop(f);
    return done(`You win the elite game and earn ${prize} Pucks.`);
  }
  // A cup tie won keeps you in the cup, and pays a little; see cupTie below for a loss.
  const tie = currentStop(f)?.cup === true && season.cup?.alive === true;
  if (tie && season.cup) season.cup.won += 1;
  // A game on a rink of its own pays a little more.
  const rinkBonus = isVariant(currentStop(f)?.rink) ? RINK_BONUS : 0;
  const amount = pay(rules.winCurrency + rivalBonus + rinkBonus + (tie ? Math.round(rules.cupCurrency * stat(f, 'cupGain', 1)) : 0));
  let message = rivalBonus > 0 ? `You beat your rivals and earn ${amount} Pucks.` : `You win and earn ${amount} Pucks.`;
  if (tie && season.cup) message += cupHeld(f) ? ' The cup is yours.' : ` You are through in the cup (${season.cup.won} of ${seasonRegions(f)}).`;
  const luck = roll(season, 'drop');
  if (luck.chance(stat(f, 'powerupDropChance', rules.powerupDropChance))) {
    const found = luck.pick(powerups);
    season.powerups.push(found.id);
    message += ` You also pick up a powerup: ${found.name}.`;
  }
  finishStop(f);
  return done(message);
}

/** After beating a boss: take one of the artifacts on offer. */
export function pickArtifact(f: Franchise, artifactId: string): ActionResult {
  const { season } = f;
  if (season.stage !== 'reward' || !season.offer.includes(artifactId)) return refuse('That artifact is not on offer.');
  const sticker = season.offerStickers?.[artifactId];
  const name = artifactInfo(artifactId).name;
  gainArtifact(f, artifactId);
  let words = `You take ${name}.`;
  if (sticker === 'loan') {
    // On loan: gone after a few games, and it comes with Pucks.
    season.loans = { ...(season.loans ?? {}), [artifactId]: STICKERS.loanGames };
    season.currency += STICKERS.loanPucks;
    words = `You take ${name} on loan for ${STICKERS.loanGames} games, with ${STICKERS.loanPucks} Pucks.`;
  }
  if (sticker === 'pricey') {
    // Pricey: it costs Pucks after every game, and you take a second artifact from the same offer.
    season.pricey = [...(season.pricey ?? []), artifactId];
    const rest = season.offer.filter((id) => id !== artifactId && !f.artifacts.includes(id));
    if (rest.length > 0) {
      season.offer = rest;
      season.offerStickers = {};
      return done(`You take ${name}: it costs ${STICKERS.priceyFee} Pucks after every game. Choose a second artifact.`);
    }
  }
  season.offerStickers = {};
  // After a boss, a ringer may be hired (not when the run ends here).
  const stop = currentStop(f);
  const lastOfWeekly = season.weekly !== undefined && stop?.region === seasonRegions(f) - 1;
  if (stop?.kind === 'boss' && !lastOfWeekly) {
    const beaten = stop.bossId ? bossInfo(stop.bossId) : null;
    season.ringerOffer = ringerOffer(`${season.seed}/${stop.id}`, teamStrength(f.league, f.league.userTeamId), beaten ? { name: beaten.person.name, ...(beaten.talents?.[0] ? { talent: beaten.talents[0] } : {}) } : undefined);
    season.offer = [];
    season.stage = 'ringer';
    return done(`${words} A ringer is on offer.`);
  }
  finishStop(f);
  // Beating the last boss puts you in the playoffs, which is a milestone.
  return done(`${words}${milestoneWords(awardMilestones(f))}`);
}

/**
 * After a boss: hire one of the ringers on offer (by his place in the list), or none (null).
 * He plays for you for the rest of the season in your lowest-rated dressed skater's place.
 */
export function pickRinger(f: Franchise, index: number | null): ActionResult {
  const { season } = f;
  if (season.stage !== 'ringer') return refuse('No ringer is on offer.');
  const chosen = index === null ? null : (season.ringerOffer?.[index] ?? null);
  if (index !== null && !chosen) return refuse('He is not one of those on offer.');
  if (chosen) season.ringer = chosen;
  delete season.ringerOffer;
  finishStop(f);
  const words = chosen ? `${chosen.player.name} joins you for the rest of the season${chosen.fee > 0 ? `, for ${chosen.fee} Pucks a game` : ''}.` : 'You hire nobody.';
  return done(`${words}${milestoneWords(awardMilestones(f))}`);
}

/**
 * Nicknames are earned, not rolled: a hat-trick, or a big night against a rival, gives a player of yours
 * one if he has none. Returns a line for each, to tell the player.
 */
function earnNicknames(f: Franchise, result: GameResult, home: DressedTeam, againstRival: boolean): string[] {
  const out: string[] = [];
  for (const line of result.players) {
    if (line.team !== 0 || line.role !== 'skater') continue;
    const dressed = home.players[line.line * 3 + line.slot];
    const player = dressed && !isGuest(dressed.id) ? f.league.players[dressed.id] : undefined;
    if (!player || player.nickname) continue;
    const kind = line.goals >= NICKNAME_RULES.hatTrickGoals ? 'hatTrick' : againstRival && line.goals >= NICKNAME_RULES.rivalGoals ? 'rival' : null;
    if (!kind) continue;
    player.nickname = nicknameFor(player.id, kind, nicknamesOf(userTeam(f.league).roster.map((other) => f.league.players[other])));
    out.push(`${player.name} has earned a name: "${player.nickname}".`);
  }
  return out;
}

/** Renames one of your players. The name must look like a name. */
export function renamePlayer(f: Franchise, playerId: string, raw: string): ActionResult {
  if (!userTeam(f.league).roster.includes(playerId)) return refuse('He is not one of yours.');
  const name = cleanName(raw);
  if (!name) return refuse('A name is 2 to 24 letters, with spaces, hyphens, apostrophes or full stops.');
  const player = playerOf(f.league, playerId);
  const before = player.name;
  player.name = name;
  return done(`${before} is now ${name}.`);
}

/** True where losing to a boss ends the season: the difficulty says. */
export function bossLossEnds(f: Franchise): boolean {
  return difficultyInfo(f.difficulty).bossLossEnds === true;
}

/** True once a cup tie has been won in every region of the season. */
export function cupHeld(f: Franchise): boolean {
  const cup = f.season.cup;
  return cup !== undefined && cup.alive && cup.won >= seasonRegions(f);
}

/** True if the game at this stop is a cup tie that still counts: you are still in the cup. */
export function isCupTie(f: Franchise, stop: Stop | null): boolean {
  return stop?.cup === true && f.season.cup?.alive === true;
}

/** The bounty on the game waiting: one optional goal that pays extra Pucks if you play the game and meet it. */
export function gameBounty(f: Franchise): BountyInfo | null {
  const game = plainMatchup(f);
  if (!game) return null;
  const firstTo = rinkInfo(game.rink).rules.firstTo !== undefined;
  return bountyFor(`${f.season.seed}/${f.season.gamesPlayed}`, !firstTo);
}

// ---------- loadout ----------

/** Empties any loadout slot whose powerup is no longer in the bag (counting copies). */
function tidyLoadout(loadout: (string | null)[], bag: string[]): (string | null)[] {
  const left = [...bag];
  return loadout.map((id) => {
    if (id === null) return null;
    const at = left.indexOf(id);
    if (at === -1) return null;
    left.splice(at, 1);
    return id;
  });
}

/** Loads a powerup from the bag onto one of the two buttons, or clears the button with null. */
export function setLoadout(f: Franchise, slot: number, powerupId: string | null): ActionResult {
  const { season } = f;
  if (slot < 0 || slot >= rules.loadoutSlots) return refuse('There is no such button.');
  const next = [...season.loadout];
  next[slot] = powerupId;
  const tidy = tidyLoadout(next, season.powerups);
  if (powerupId !== null && tidy[slot] !== powerupId) return refuse('You do not have that powerup to spare.');
  season.loadout = tidy;
  return done();
}

// ---------- training ----------

export interface TrainingChoice {
  /** "all", a rating's name, or a trait's id. */
  id: string;
  name: string;
  description: string;
}

/** How much one focused rating gains from training: the all-round gain scaled up. */
export function trainingFocus(f: Franchise): number {
  return Math.round(stat(f, 'trainingBonus', rules.trainingFocus));
}

/** What a player may take from a training stop: a little of everything, a lot of one rating, or (skaters) a trait. */
export function trainingChoices(f: Franchise, playerId: string): TrainingChoice[] {
  const player = playerOf(f.league, playerId);
  const all = Math.round(stat(f, 'trainingBonus', rules.trainingBump));
  const focus = trainingFocus(f);
  const names = gearRules.ratingNames as Record<string, string>;
  const taken = new Set((f.season.training?.[playerId] ?? []).map((m) => m.stat));
  return [
    { id: 'all', name: 'All-round', description: `+${all} to every rating.` },
    ...Object.keys(player.ratings).map((key) => ({ id: key, name: names[key] ?? key, description: `+${focus} ${(names[key] ?? key).toLowerCase()}.` })),
    ...(player.position === 'G' ? [] : rules.trainingTraits.filter((trait) => !trait.modifiers.some((m) => taken.has(m.stat))).map((trait) => ({ id: trait.id, name: trait.name, description: trait.description }))),
  ];
}

/** Trains one dressed player for the rest of the season: `choice` is one of his `trainingChoices` (all-round if left out). */
export function train(f: Franchise, playerId: string, choice = 'all'): ActionResult {
  const stop = currentStop(f);
  if (!stop || stop.kind !== 'training' || f.season.stage !== 'arrived') return refuse('You are not at a training stop.');
  if (!f.season.dressed.includes(playerId)) return refuse('Only a dressed player can train.');
  const picked = trainingChoices(f, playerId).find((c) => c.id === choice);
  if (!picked) return refuse('He cannot train that.');
  const name = playerOf(f.league, playerId).name;
  if (choice === 'all') {
    const amount = Math.round(stat(f, 'trainingBonus', rules.trainingBump));
    f.season.bumps[playerId] = (f.season.bumps[playerId] ?? 0) + amount;
    finishStop(f);
    return done(`${name} gains ${amount} points in every rating for the rest of the season.`);
  }
  const trait = rules.trainingTraits.find((x) => x.id === choice);
  const gained: Modifier[] = trait ? (trait.modifiers as Modifier[]) : [{ stat: `rating.${choice}`, op: 'add', value: trainingFocus(f) }];
  f.season.training = { ...(f.season.training ?? {}), [playerId]: [...(f.season.training?.[playerId] ?? []), ...gained] };
  finishStop(f);
  return done(trait ? `${name} learns ${trait.name.toLowerCase()} for the rest of the season.` : `${name} gains ${trainingFocus(f)} ${picked.name.toLowerCase()} for the rest of the season.`);
}

// ---------- events ----------

function applyEffects(f: Franchise, effects: EventEffect[]): void {
  const { season, league } = f;
  for (const effect of effects) {
    if (effect.type === 'currency') {
      season.currency = Math.max(0, season.currency + effect.amount);
    } else if (effect.type === 'powerup') {
      season.powerups.push(effect.id ?? roll(season, 'event-powerup').pick(powerups).id);
    } else if (effect.type === 'losePowerup') {
      if (season.powerups.length > 0) {
        season.powerups.splice(roll(season, 'lose').int(0, season.powerups.length - 1), 1);
        season.loadout = tidyLoadout(season.loadout, season.powerups);
      }
    } else if (effect.type === 'strike') {
      // An event can wipe a strike, or add one, but never deliver the fatal one.
      season.strikes = Math.max(0, Math.min(maxStrikes(f) - 1, season.strikes + effect.amount));
    } else if (effect.type === 'bump') {
      const players = season.dressed.map((id) => playerOf(league, id)).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
      const chosen =
        effect.who === 'all'
          ? players
          : effect.who === 'best'
            ? players.slice(0, 1)
            : effect.who === 'worst'
              ? players.slice(-1)
              : [roll(season, 'bump').pick(players)];
      for (const p of chosen) season.bumps[p.id] = (season.bumps[p.id] ?? 0) + effect.amount;
    } else if (effect.type === 'scout') {
      season.scouted = true;
    } else if (effect.type === 'skillPoint') {
      // Points to spend on one dressed player, banked like a level-up.
      const players = season.dressed.map((id) => playerOf(league, id)).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
      const who = effect.who === 'best' ? players[0] : effect.who === 'worst' ? players[players.length - 1] : roll(season, 'skill').pick(players);
      if (who) who.points = (who.points ?? 0) + effect.amount;
    } else if (effect.type === 'artifact') {
      const gift = artifactOffer(f, 1)[0];
      if (gift) gainArtifact(f, gift);
    } else {
      season.temps.push({ label: effect.label, games: effect.games, modifiers: effect.modifiers });
    }
  }
}

/** Takes one of the choices at the current event stop. The message is what happened. */
export function chooseEvent(f: Franchise, choiceIndex: number): ActionResult {
  const stop = currentStop(f);
  if (!stop || stop.kind !== 'event' || !stop.eventId || f.season.stage !== 'arrived') return refuse('You are not at an event.');
  const choice = eventInfo(stop.eventId).choices[choiceIndex];
  if (!choice) return refuse('That is not one of the choices.');

  const total = choice.outcomes.reduce((sum, o) => sum + (o.weight ?? 1), 0);
  let pick = roll(f.season, 'event').next() * total;
  let outcome = choice.outcomes[0]!;
  for (const o of choice.outcomes) {
    pick -= o.weight ?? 1;
    if (pick < 0) {
      outcome = o;
      break;
    }
  }
  remember(f, 'events', stop.eventId);
  applyEffects(f, outcome.effects);
  finishStop(f);
  return done(outcome.result);
}

// ---------- shop ----------

/** What a powerup costs in a shop, after any discount. */
export function shopPrice(f: Franchise, powerupId: string): number {
  return Math.max(1, Math.round(stat(f, 'shopPrice', powerupInfo(powerupId).price)));
}

export function healPrice(f: Franchise): number {
  return Math.max(1, Math.round(stat(f, 'shopPrice', rules.healStrikePrice)));
}

function shopStop(f: Franchise): Stop | null {
  const stop = currentStop(f);
  return stop && stop.kind === 'shop' && f.season.stage === 'arrived' ? stop : null;
}

export function buy(f: Franchise, powerupId: string): ActionResult {
  const stop = shopStop(f);
  if (!stop) return refuse('You are not in a shop.');
  const stock = stop.stock ?? [];
  if (!stock.includes(powerupId)) return refuse('The shop does not have that.');
  const price = shopPrice(f, powerupId);
  if (f.season.currency < price) return refuse(`You need ${price} Pucks and have ${f.season.currency}.`);
  f.season.currency -= price;
  f.season.powerups.push(powerupId);
  stop.stock = stock.filter((_, i) => i !== stock.indexOf(powerupId));
  return done(`You buy ${powerupInfo(powerupId).name}.`);
}

/** Pays to wipe one strike. */
export function healStrike(f: Franchise): ActionResult {
  if (!shopStop(f)) return refuse('You are not in a shop.');
  if (stat(f, 'noRepairs', 0) >= 1) return refuse('Shops do not wipe strikes this season: that is the handicap you took.');
  if (f.season.strikes === 0) return refuse('You have no strikes to wipe.');
  const price = healPrice(f);
  if (f.season.currency < price) return refuse(`You need ${price} Pucks and have ${f.season.currency}.`);
  f.season.currency -= price;
  f.season.strikes -= 1;
  return done('One strike is wiped away.');
}

/** What a scouting report on the next boss costs. */
export function scoutPrice(f: Franchise): number {
  return Math.max(1, Math.round(stat(f, 'shopPrice', rules.scoutPrice)));
}

/** Buys a scouting report: the next boss you meet plays below himself. */
export function buyScouting(f: Franchise): ActionResult {
  if (!shopStop(f)) return refuse('You are not in a shop.');
  if (f.season.scouted) return refuse('You already have a report on the next boss.');
  const price = scoutPrice(f);
  if (f.season.currency < price) return refuse(`You need ${price} Pucks and have ${f.season.currency}.`);
  f.season.currency -= price;
  f.season.scouted = true;
  return done('You have a report on the next boss: his team will be weaker and slower to react.');
}

export function leaveShop(f: Franchise): ActionResult {
  if (!shopStop(f)) return refuse('You are not in a shop.');
  finishStop(f);
  return done();
}

// ---------- lineup during the season ----------

/**
 * Puts a skater in a lineup spot. During the season this is how the dressed skaters swap spots and how
 * the spare comes in for one of them between games; the season's dressed list follows the lineup.
 */
export function setSeasonLineupSlot(f: Franchise, line: 0 | 1, slot: number, playerId: string): ActionResult {
  const team = userTeam(f.league);
  if (!setLineupSlot(f.league, team, line, slot, playerId)) return refuse('He cannot play there.');
  if (rosterLocked(f) && team.lineup.goalie) f.season.dressed = [...dressedSkaters(team.lineup), team.lineup.goalie];
  return done();
}
