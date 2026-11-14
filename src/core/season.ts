import artifacts from '../data/artifacts.json';
import events from '../data/events.json';
import powerups from '../data/powerups.json';
import prestigeRules from '../data/prestige.json';
import rules from '../data/season.json';
import type { GameResult } from '../sim/match';
import { modified, type Modifier, type PowerupSpec } from '../sim/modifiers';
import { aiTeamsByStrength, bossInfo, buildBoss } from './bosses';
import { clubModifiers } from './club';
import { bookGame, bookMilestones, STARTING_CASH, STARTING_VALUE } from './economy';
import { newFacilities } from './facilities';
import { newLedger, type Ledger, type SeasonBooks } from './ledger';
import { aiMascot, bossMascot, newMascot, rollDropIn, userMascot, withMascot, type MascotSpec, type MascotState } from './mascot';
import { generateStaffPool, type StaffMember } from './staff';
import { playerGearModifiers, type GearItem } from './gear';
import { playerOf, teamOf, userTeam, type League } from './league';
import { dressedSkaters, setLineupSlot } from './lineup';
import { applyResult, dress, type DressedTeam } from './matchup';
import { newMilestones, tally } from './milestones';
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
  stage: 'none' | 'arrived' | 'reward';
  /** Artifact ids on offer after beating a boss. */
  offer: string[];
  /** The last stop finished. */
  last: string | null;
  strikes: number;
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
  /** The six skaters and the goalie locked in for the run. */
  dressed: string[];
  outcome: null | 'champion' | 'eliminated' | 'struckOut';
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
  /** Players and staff who joined this off-season. Letting one of them go in a fire sale pays nothing. */
  signed: string[];
}

export interface PrestigeState {
  level: number;
  /** True once you have won the championship at this prestige level. */
  championAt: boolean;
  /** Which unlocked jersey colour the team wears. */
  jersey: number;
}

/** Everything that is saved: the league, the record, where the season stands, and the artifacts owned. */
export interface Franchise {
  league: League;
  record: TeamRecord;
  season: SeasonState;
  /** Artifact ids, kept across seasons until prestige. */
  artifacts: string[];
  /** Every piece of gear the team owns. Permanent. */
  gear: GearItem[];
  /** Packs awarded and not yet opened. */
  packs: Pack[];
  /** Tape: earned by scrapping gear, spent on levelling it up. */
  tape: number;
  /** Packs awarded since the last one that held a Legendary, for the pity timer. */
  packsSinceLegendary: number;
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

export function newFranchise(league: League): Franchise {
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
  return f.artifacts.flatMap((id) => artifactInfo(id).modifiers);
}

/** Every lasting modifier on the player's team for the next game: artifacts, temporary effects, and what facilities and staff give. */
export function teamModifiers(f: Franchise): Modifier[] {
  return [...artifactModifiers(f), ...f.season.temps.flatMap((t) => t.modifiers), ...clubModifiers(f)];
}

/** A season-level number (such as currency gain) after the artifacts owned. */
function stat(f: Franchise, name: string, base: number): number {
  return modified(base, name, artifactModifiers(f));
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

/** Locks in the dressed lineup and generates the season's map. */
export function startSeason(f: Franchise): ActionResult {
  if (f.season.phase !== 'offseason') return refuse('A season is already under way.');
  if (f.offseason.pending.length > 0) return refuse('Decide your expiring contracts first.');
  if (f.cash < 0) return refuse('You are out of cash. Raise money before the season can start.');
  const team = userTeam(f.league);
  const ready = canPlay(f.league, team);
  if (!ready.ok) return refuse(ready.reason);

  const season = newSeasonState();
  season.phase = 'map';
  season.seed = `${f.league.seed}/season-${f.league.season}`;
  season.map = generateMap(season.seed, aiTeamsByStrength(f.league));
  season.dressed = [...dressedSkaters(team.lineup), team.lineup.goalie as string];
  f.season = season;
  const gift = roll(season, 'start');
  for (let i = 0; i < rules.startingPowerups; i++) season.powerups.push(gift.pick(powerups).id);
  return done('The season begins.');
}

/** Wraps up a finished season: powerups, currency, bumps and effects are wiped; artifacts stay. */
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
  season.current = null;
  season.stage = 'none';
  season.offer = [];
  // Beating the last region's boss leads to the playoffs.
  if (stop && stop.kind === 'boss' && stop.region === rules.regions - 1) {
    season.phase = 'playoffs';
    season.playoffs = { round: 0, wins: 0, losses: 0, opponentId: playoffOpponent(f, 0) };
  }
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
  powerups: (PowerupSpec | null)[];
  /** A mascot that has dropped in for this game, for either side: who he is and which skater sits. */
  mascots: { home: DropIn | null; away: DropIn | null };
}

export interface DropIn {
  mascot: MascotSpec;
  /** The name of the skater he replaces for this game. */
  sits: string;
}

/** The player's team as it takes the ice: dressed lineup, season bumps, artifacts and temporary effects. */
export function dressUser(f: Franchise): DressedTeam | null {
  return dress(f.league, userTeam(f.league), {
    bumps: f.season.bumps,
    modifiers: teamModifiers(f),
    gear: (playerId) => playerGearModifiers(f, playerId),
  });
}

/**
 * The game waiting to be played at the current stop or playoff round, or null if there is none.
 * Before each game either side's mascot may drop in, taking a random dressed skater's place for that game.
 * The roll is fixed by the season seed and the game number, so asking twice gives the same answer.
 */
export function matchup(f: Franchise): Matchup | null {
  const game = plainMatchup(f);
  if (!game) return null;
  const { season, league } = f;
  const label = (side: string): string => `${season.seed}/mascot/${side}/${season.gamesPlayed}`;
  const dropIn = (team: DressedTeam, spec: MascotSpec, side: string): { team: DressedTeam; info: DropIn | null } => {
    const slot = rollDropIn(label(side), spec.power);
    if (slot === null) return { team, info: null };
    return { team: withMascot(team, spec, slot), info: { mascot: spec, sits: team.players[slot]?.name ?? '' } };
  };
  const stop = currentStop(f);
  const theirs =
    game.kind === 'boss' && stop?.bossId
      ? bossMascot(season.seed, stop.bossId, stop.region)
      : aiMascot(league, game.kind === 'playoff' ? (season.playoffs?.opponentId ?? '') : (stop?.opponentId ?? ''));
  const home = dropIn(game.home, userMascot(f), 'home');
  const away = dropIn(game.away, theirs, 'away');
  return { ...game, home: home.team, away: away.team, mascots: { home: home.info, away: away.info } };
}

function plainMatchup(f: Franchise): Omit<Matchup, 'mascots'> | null {
  const { season, league } = f;
  const home = dressUser(f);
  if (!home) return null;
  const loaded = season.loadout.map((id) => (id ? powerupInfo(id) : null));
  // Each prestige level makes every opponent a little better and a little sharper.
  const tougher = f.prestige.level * prestigeRules.opponentRatingPerLevel;
  const sharper = f.prestige.level * prestigeRules.opponentLevelPerLevel;

  if (season.phase === 'playoffs' && season.playoffs) {
    const away = dress(league, teamOf(league, season.playoffs.opponentId), { bumpAll: tougher });
    if (!away) return null;
    const round = season.playoffs.round === rules.playoffRounds - 1 ? 'Final' : 'Semi-final';
    return {
      home,
      away,
      level: Math.min(1, rules.playoffLevel + sharper),
      kind: 'playoff',
      title: `${round}, game ${season.playoffs.wins + season.playoffs.losses + 1}`,
      powerups: loaded,
    };
  }

  const stop = currentStop(f);
  if (season.phase !== 'map' || !stop || season.stage !== 'arrived') return null;
  const level = Math.min(1, (rules.regionLevels[stop.region] ?? rules.regionLevels[rules.regionLevels.length - 1]!) + sharper);
  if (stop.kind === 'boss' && stop.bossId) {
    const boss = bossInfo(stop.bossId);
    return {
      home,
      away: buildBoss(league, stop.bossId, stop.region, season.seed, tougher),
      level: Math.min(1, level + rules.bossLevelBonus),
      kind: 'boss',
      title: `Boss: ${boss.name}`,
      trait: `${boss.trait}: ${boss.description}`,
      powerups: loaded,
    };
  }
  if (stop.kind === 'game' && stop.opponentId) {
    const away = dress(league, teamOf(league, stop.opponentId), { bumpAll: tougher });
    if (!away) return null;
    return { home, away, level, kind: 'game', title: `Game against ${away.name}`, powerups: loaded };
  }
  return null;
}

/** Up to `count` artifacts the franchise does not own yet. */
function artifactOffer(f: Franchise, count: number): string[] {
  const unowned = artifacts.map((a) => a.id).filter((id) => !f.artifacts.includes(id));
  return roll(f.season, 'artifacts').shuffle(unowned).slice(0, count);
}

function strike(f: Franchise): boolean {
  f.season.strikes += 1;
  if (f.season.strikes < rules.maxStrikes) return false;
  f.season.phase = 'ended';
  f.season.outcome = 'struckOut';
  f.season.current = null;
  f.season.stage = 'none';
  return true;
}

/** A Gold pack and a cash bonus for any season milestones just reached. Returns the words to add to a message. */
function awardMilestones(f: Franchise): string {
  const fresh = newMilestones(f);
  if (fresh.length > 0) bookMilestones(f, fresh.length);
  return fresh
    .map((m) => {
      awardPack(f, 'gold', `Milestone: ${m.name}`);
      return ` Milestone reached: ${m.name}. You earn a ${packName('gold')} and a cash bonus.`;
    })
    .join('');
}

/**
 * Records the game just played at the current stop or playoff round, and moves the season on.
 * A win earns a pack, and any season milestone it completes earns a Gold pack.
 */
export function recordGame(f: Franchise, result: GameResult): ActionResult {
  const game = matchup(f);
  const played = f.season.gamesPlayed;
  const outcome = settleGame(f, result);
  if (!outcome.ok || !game || f.season.gamesPlayed === played) return outcome;

  tally(f, result, game.home);
  const net = bookGame(f, game.kind === 'playoff');
  // XP: dressed players earn their own; anyone on the roster who did not dress gets a share.
  const earned = gameXp(result, game.home);
  const share = homeShare(earned, game.home);
  for (const id of userTeam(f.league).roster) {
    f.season.xp[id] = (f.season.xp[id] ?? 0) + (earned[id] ?? share);
  }
  const millions = (Math.abs(net) / 1_000_000).toFixed(2);
  let message = `${outcome.message} Cash ${net >= 0 ? '+' : '-'}$${millions}M.`;
  const pack = packForWin(result, game.kind === 'boss');
  if (pack) {
    awardPack(f, pack, game.title);
    message += ` You earn a ${packName(pack)}.`;
  }
  return { ok: true, message: message + awardMilestones(f) };
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
  season.gamesPlayed += 1;
  f.record = applyResult(f.record, result);

  const won = result.winner === 0;
  if (won) season.gamesWon += 1;
  const margin = Math.abs(result.score[0] - result.score[1]);
  const pay = (base: number): number => {
    const amount = Math.round(stat(f, 'currencyGain', base + Math.min(rules.maxMarginCurrency, margin * rules.marginCurrency)));
    season.currency += amount;
    return amount;
  };

  if (game.kind === 'playoff' && season.playoffs) {
    const series = season.playoffs;
    if (won) {
      series.wins += 1;
      const amount = pay(rules.playoffWinCurrency);
      if (series.wins < rules.seriesWins) return done(`You win the game and ${amount} currency. The series stands ${series.wins}-${series.losses}.`);
      if (series.round < rules.playoffRounds - 1) {
        season.playoffs = { round: series.round + 1, wins: 0, losses: 0, opponentId: playoffOpponent(f, series.round + 1) };
        return done('You win the series and move on to the final.');
      }
      season.phase = 'ended';
      season.outcome = 'champion';
      f.prestige.championAt = true;
      const prize = artifactOffer(f, 1)[0];
      if (prize) f.artifacts.push(prize);
      return done(prize ? `Champions! You are awarded an artifact: ${artifactInfo(prize).name}.` : 'Champions!');
    }
    series.losses += 1;
    if (series.losses < rules.seriesWins) return done(`You lose the game. The series stands ${series.wins}-${series.losses}.`);
    season.phase = 'ended';
    season.outcome = 'eliminated';
    return done('You lose the series. The season is over.');
  }

  if (game.kind === 'boss') {
    if (!won) {
      if (strike(f)) return done('The boss beats you. That is your third strike: the season is over.');
      return done(`The boss beats you. Strike ${season.strikes} of ${rules.maxStrikes}. You must play the boss again.`);
    }
    const amount = pay(rules.bossCurrency);
    season.offer = artifactOffer(f, rules.artifactChoices);
    if (season.offer.length === 0) {
      finishStop(f);
      return done(`You beat the boss and win ${amount} currency.`);
    }
    season.stage = 'reward';
    return done(`You beat the boss and win ${amount} currency. Choose an artifact.`);
  }

  if (!won) {
    if (strike(f)) return done('You lose. That is your third strike: the season is over.');
    finishStop(f);
    return done(`You lose. Strike ${season.strikes} of ${rules.maxStrikes}.`);
  }
  const amount = pay(rules.winCurrency);
  let message = `You win and earn ${amount} currency.`;
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
  if (f.season.stage !== 'reward' || !f.season.offer.includes(artifactId)) return refuse('That artifact is not on offer.');
  f.artifacts.push(artifactId);
  finishStop(f);
  // Beating the last boss puts you in the playoffs, which is a milestone.
  return done(`You take ${artifactInfo(artifactId).name}.${awardMilestones(f)}`);
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

export function train(f: Franchise, playerId: string): ActionResult {
  const stop = currentStop(f);
  if (!stop || stop.kind !== 'training' || f.season.stage !== 'arrived') return refuse('You are not at a training stop.');
  if (!f.season.dressed.includes(playerId)) return refuse('Only a dressed player can train.');
  const amount = Math.round(stat(f, 'trainingBonus', rules.trainingBump));
  f.season.bumps[playerId] = (f.season.bumps[playerId] ?? 0) + amount;
  finishStop(f);
  return done(`${playerOf(f.league, playerId).name} gains ${amount} points in every rating for the rest of the season.`);
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
      season.strikes = Math.max(0, Math.min(rules.maxStrikes - 1, season.strikes + effect.amount));
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
  if (f.season.currency < price) return refuse(`You need ${price} currency and have ${f.season.currency}.`);
  f.season.currency -= price;
  f.season.powerups.push(powerupId);
  stop.stock = stock.filter((_, i) => i !== stock.indexOf(powerupId));
  return done(`You buy ${powerupInfo(powerupId).name}.`);
}

/** Pays to wipe one strike. */
export function healStrike(f: Franchise): ActionResult {
  if (!shopStop(f)) return refuse('You are not in a shop.');
  if (f.season.strikes === 0) return refuse('You have no strikes to wipe.');
  const price = healPrice(f);
  if (f.season.currency < price) return refuse(`You need ${price} currency and have ${f.season.currency}.`);
  f.season.currency -= price;
  f.season.strikes -= 1;
  return done('One strike is wiped away.');
}

export function leaveShop(f: Franchise): ActionResult {
  if (!shopStop(f)) return refuse('You are not in a shop.');
  finishStop(f);
  return done();
}

// ---------- lineup during the season ----------

/** During the season the dressed skaters can swap spots, but the spare cannot come in. */
export function setSeasonLineupSlot(f: Franchise, line: 0 | 1, slot: number, playerId: string): ActionResult {
  if (rosterLocked(f) && !f.season.dressed.includes(playerId)) return refuse('He was not dressed for this season, so he stays home until it ends.');
  return setLineupSlot(f.league, userTeam(f.league), line, slot, playerId) ? done() : refuse('He cannot play there.');
}
