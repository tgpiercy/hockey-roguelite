import type { ComponentChildren } from 'preact';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { bossInfo, teamStrength } from '../core/bosses';
import { sortPlayers, wouldReplace, type PlayerSort, type PositionFilter } from '../core/compare';
import { teamCrest } from '../core/crest';
import { styleInfo } from '../core/playStyle';
import { bailOut, canBailOut, inFireSale, isHomeGame, playerSalePrice, seasonEndBills, starCount } from '../core/economy';
import { build, buildCost, FACILITIES, facilityLevel, facilityUpkeep, MAX_FACILITY_LEVEL } from '../core/facilities';
import { equip, levelCost, levelUp, rarityInfo, releasePlayer, scrap, unequip, wornBy, type GearItem } from '../core/gear';
import { generateLeague } from '../core/generate';
import { EXPENSE_LINES, INCOME_LINES, LINE_NAMES, totals, type Ledger } from '../core/ledger';
import { playerOf, rosterOf, skatersOn, teamOf, userTeam, type Team } from '../core/league';
import { autoLineup, dressedSkaters, lineupProblems } from '../core/lineup';
import { costumeCost, dropInChance, mascotPower, mascotRating, nextTalentAt, talentInfo, upgradeCostume, userMascot } from '../core/mascot';
import { dress } from '../core/matchup';
import { decideContract, finishSeason, resignCapHit } from '../core/offseason';
import { openPack, packName } from '../core/packs';
import { canPrestige, jerseyColour, prestige, prestigeEffects, setJersey, unlockedJerseys } from '../core/prestige';
import { canPlay, canSign, type MoveResult } from '../core/roster';
import { hiddenFreeAgents, potentialText, scoutingPoints, signPlayer } from '../core/scouting';
import { gradePower, hire, kindName, letGo, roleOf, slotsFor, STAFF_KINDS, staffOfKind, staffSalePrice, type StaffMember } from '../core/staff';
import { franchiseOf, fromSave, parseSave, toSave } from '../core/save';
import {
  artifactInfo,
  artifactModifiers,
  availableStops,
  buy,
  canSimulate,
  chooseEvent,
  currentStop,
  DIFFICULTIES,
  difficultyInfo,
  eventInfo,
  healPrice,
  healStrike,
  leaveShop,
  matchup,
  newFranchise,
  pickArtifact,
  powerupInfo,
  recordGame,
  rosterLocked,
  setDifficulty,
  setLoadout,
  abandonSeason,
  setSeasonLineupSlot,
  shopPrice,
  simulateGame,
  startSeason,
  train,
  travel,
  type ActionResult,
  type Franchise,
  type GameRewards,
} from '../core/season';
import type { Stop } from '../core/seasonMap';
import { seasonSummary } from '../core/seasonSummary';
import { teamColour } from '../core/teamColours';
import { modified } from '../sim/modifiers';
import { evaluateTrade, trade } from '../core/trades';
import { xpForLevel } from '../core/xp';
import gearData from '../data/gear.json';
import offseasonRules from '../data/offseason.json';
import mascotRules from '../data/mascot.json';
import prestigeRules from '../data/prestige.json';
import rules from '../data/season.json';
import { EquipPreview, GearCard, GearedRatings, GearRow, setProgress, slotName } from './gearParts';
import { gameAudio } from '../game/audio';
import gameInfo from '../data/game.json';
import { CrestBadge } from './Crest';
import { GearArt } from './GearArt';
import { Icon, type IconName } from './Icon';
import { BarRow, LineChart, sharesOf } from './Charts';
import { Compare, FacilityCard, MascotPanel, OpenDesk, PrestigeLadder, StaffCard, TalentBadge, TradeOffer } from './screens/club';
import { ChangeRow, EventHeader, MatchupPoster, powerupIcon, SeasonSummaryCard, ShopCard, StopCard, StrikeLights, TrainingGain } from './screens/season';
import { Menu, MenuChrome, type MenuItem } from './Menu';
import { PackOpening } from './PackOpening';
import { loadPrefs, savePrefs, VOLUME_STEPS, type Prefs } from './prefs';
import { menuInput } from './menuInput';
import { playMatch } from './matchView';
import type { PlayerRecord } from '../core/player';
import { CapLine, CountUp, Dots, Face, Grade, Meter, money, NO_TEAM, PlayerRow, Ratings, Wallet, WearingContext, type Wearing } from './parts';
import { MapKey, SeasonMapView } from './SeasonMap';
import { downloadText, loadStored, pickTextFile, store } from './storage';

type Screen =
  | { name: 'title' }
  | { name: 'home' }
  | { name: 'roster' }
  | { name: 'player'; playerId: string }
  | { name: 'slot'; playerId: string; slot: string }
  | { name: 'release'; playerId: string }
  | { name: 'packs' }
  | { name: 'reveal'; ids: string[]; shown: number; title: string }
  | { name: 'gear' }
  | { name: 'item'; itemId: string }
  | { name: 'equipOn'; itemId: string }
  | { name: 'freeAgents' }
  | { name: 'lineup' }
  | { name: 'pick'; line: 0 | 1; slot: number }
  | { name: 'exhibition' }
  | { name: 'powerups' }
  | { name: 'load'; slot: number }
  | { name: 'artifacts' }
  | { name: 'report' }
  | { name: 'contracts' }
  | { name: 'contract'; playerId: string }
  | { name: 'tradeTeams' }
  | { name: 'tradeTheirs'; teamId: string }
  | { name: 'tradeMine'; teamId: string; theirId: string }
  | { name: 'tradeConfirm'; teamId: string; theirId: string; mineId: string }
  | { name: 'prestige' }
  | { name: 'finances' }
  | { name: 'staff' }
  | { name: 'hire' }
  | { name: 'staffMember'; staffId: string }
  | { name: 'facilities' }
  | { name: 'mascot' }
  | { name: 'team' }
  | { name: 'office' }
  | { name: 'collection' }
  | { name: 'settings' }
  | { name: 'difficulty'; fresh: boolean }
  | { name: 'rewards'; shown: number }
  | { name: 'jersey' }
  | { name: 'saves' }
  | { name: 'confirmAbandon' }
  | { name: 'confirmNew' };

type Sort = PlayerSort;
type Group = 'team' | 'office' | 'collection' | 'settings';

/** The icon each hub-style row carries, by the row's key. A row can also name its own. */
const TILE_ICONS: Record<string, IconName> = {
  team: 'team',
  office: 'office',
  collection: 'collection',
  settings: 'settings',
  roster: 'roster',
  lineup: 'lineup',
  fa: 'freeAgents',
  trade: 'trade',
  powerups: 'powerups',
  mascot: 'mascot',
  finances: 'finances',
  staff: 'staff',
  facilities: 'facilities',
  prestige: 'prestige',
  report: 'report',
  packs: 'packs',
  gear: 'gear',
  artifacts: 'artifacts',
  jersey: 'jersey',
  difficulty: 'difficulty',
  sound: 'sound',
  volume: 'sound',
  detail: 'detail',
  saves: 'save',
  play: 'play',
  start: 'play',
  simulate: 'simulate',
  exhibition: 'exhibition',
  contracts: 'contracts',
  bailout: 'bailout',
};
const BUTTONS = ['LT', 'RB'];

/** The gear screen's filters, cycled with left and right. */
const GEAR_FILTERS: { label: string; test: (item: GearItem) => boolean }[] = [
  { label: 'everything', test: () => true },
  { label: 'not worn', test: (item) => item.wornBy === null },
  ...[...gearData.slots.skater, ...gearData.slots.goalie].map((slot) => ({ label: slotName(slot).toLowerCase(), test: (item: GearItem) => item.slot === slot })),
  ...gearData.rarities.map((r) => ({ label: r.name.toLowerCase(), test: (item: GearItem) => item.rarity === r.id })),
];
const RARITY_ORDER = gearData.rarities.map((r) => r.id as string);

/** The whole menu side of the game: the off-season hub, the season map and its stops, and the team screens. */
export function App() {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const ref = useRef<Franchise | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState<Sort>('overall');
  const [faPosition, setFaPosition] = useState<PositionFilter>('all');
  const [gearFilter, setGearFilter] = useState(0);
  const [playing, setPlaying] = useState(false);
  // The hub group the player came through, so B from a screen returns there and not to the top.
  const [group, setGroup] = useState<Group | null>(null);
  const [rewards, setRewards] = useState<GameRewards | null>(null);
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // Sound follows the device's preferences from the first moment.
  useEffect(() => gameAudio.configure(prefs.sound, prefs.volume), [prefs]);
  const changePrefs = (next: Prefs): void => {
    savePrefs(next);
    setPrefs(next);
  };

  /** Writes the franchise to storage and redraws. Call after anything changes. */
  const commit = (franchise: Franchise): void => {
    ref.current = franchise;
    store(toSave(franchise, new Date().toISOString())).catch(() => setMessage('Could not save: storage is unavailable in this browser.'));
    redraw(0);
  };
  const startOver = (difficulty?: string): void => commit(newFranchise(generateLeague(String(Date.now())), difficulty));

  // On start: load the stored franchise, or begin a new one.
  useEffect(() => {
    loadStored()
      .then((raw) => {
        const loaded = raw === null ? null : fromSave(raw);
        if (loaded && loaded.ok) {
          ref.current = franchiseOf(loaded.save);
          redraw(0);
        } else {
          startOver();
          if (loaded && !loaded.ok) setMessage(`${loaded.reason} A new franchise was started.`);
        }
      })
      .catch(() => {
        startOver();
        setMessage('Storage is unavailable in this browser, so progress will not be kept.');
      });
  }, []);

  useEffect(() => {
    document.body.className = playing ? 'mode-rink' : 'mode-menu';
    if (playing) menuInput.stop();
    else menuInput.start();
  }, [playing]);

  const f = ref.current;
  if (!f || playing) return null;
  const { league, season } = f;
  const team = userTeam(league);
  const locked = rosterLocked(f);
  // Your crest wears the jersey colour you chose; every other team's comes from its name.
  const myCrest = teamCrest(team.name, jerseyColour(f));
  // A new screen is a new list: its focus starts afresh.
  const screenKey = `${JSON.stringify(screen)}|${season.phase}|${season.current}|${season.stage}`;

  const go = (next: Screen, note = ''): void => {
    setMessage(note);
    setScreen(next);
  };
  /** Shows what an action said, saves, and optionally changes screen. */
  const after = (result: ActionResult | MoveResult, next?: Screen): void => {
    setMessage(result.ok ? ('message' in result ? result.message : '') : result.reason);
    if (next && result.ok) setScreen(next);
    commit(f);
  };
  /** Back to where the player came from: the hub group he opened, or the top. */
  const home = (): void => go(group ? { name: group } : { name: 'home' });
  /** Back to the very top, leaving any group. */
  const top = (): void => {
    setGroup(null);
    go({ name: 'home' });
  };
  const openGroup = (name: Group): void => {
    setGroup(name);
    go({ name });
  };
  /** A hub row: a bold name, a line saying what is inside, and an optional count or lock. */
  const tile = (
    key: string,
    name: string,
    what: string,
    onSelect: () => void,
    extra: { badge?: number; lock?: string; primary?: boolean; disabled?: boolean; detail?: ComponentChildren; icon?: IconName; wide?: boolean } = {},
  ): MenuItem => ({
    key,
    wide: extra.wide,
    label: (
      <span class={`tile${extra.primary ? ' primary' : ''}`}>
        {(extra.icon ?? TILE_ICONS[key]) && <Icon name={(extra.icon ?? TILE_ICONS[key]) as IconName} size={20} />}
        <span class="tile-name">{name}</span>
        <span class="tile-what">{what}</span>
        {extra.badge ? <span class="badge">{extra.badge}</span> : null}
        {extra.lock ? <span class="lock">Locked</span> : null}
      </span>
    ),
    detail: extra.lock ?? extra.detail,
    disabled: extra.disabled ?? Boolean(extra.lock),
    onSelect,
  });
  /** A dashboard tile for the hub's grid: a big icon, a name, and what is going on in there right now. */
  const card = (key: string, name: string, status: string, onSelect: () => void, extra: { badge?: number; disabled?: boolean; detail?: ComponentChildren } = {}): MenuItem => ({
    key,
    label: (
      <span class="dash-tile">
        <Icon name={TILE_ICONS[key] as IconName} size={30} />
        <span class="dash-text">
          <span class="dash-name">{name}</span>
          <span class="dash-status">{status}</span>
        </span>
        {extra.badge ? <span class="badge">{extra.badge}</span> : null}
      </span>
    ),
    detail: extra.detail,
    disabled: extra.disabled,
    onSelect,
  });
  /** What every player is wearing, for the portraits: his team's colours, yours in the jersey you chose. */
  const wearingById = new Map<string, Wearing>();
  for (const club of league.teams) {
    const crest = club.id === league.userTeamId ? myCrest : teamCrest(club.name);
    for (const id of club.roster) wearingById.set(id, { primary: crest.primary, secondary: crest.secondary });
  }
  const wearing = (playerId: string): Wearing => wearingById.get(playerId) ?? NO_TEAM;
  // Staff, facilities and prestige open once you have finished a season, so the first run is not a wall of systems.
  const earlyLock = f.books.length === 0 ? 'Opens after your first season.' : undefined;
  /** The four groups every hub screen ends with. */
  const groupItems = (): MenuItem[] => [
    tile('team', 'Team', locked ? 'Roster, lineup, mascot' : 'Roster, lineup, free agents, trades, mascot', () => openGroup('team'), { badge: f.offseason.pending.length }),
    tile('office', 'Front office', 'Finances, staff, facilities, prestige', () => openGroup('office')),
    tile('collection', 'Collection', locked ? 'Packs, gear, powerups, artifacts, jersey' : 'Packs, gear, artifacts, jersey', () => openGroup('collection'), { badge: f.packs.length }),
    tile('settings', 'Settings', `Difficulty: ${difficultyInfo(f.difficulty).name} · save and load`, () => openGroup('settings')),
  ];
  const bump = (id: string): number => season.bumps[id] ?? 0;
  const fireSale = inFireSale(f);
  const cashLine = (
    <div>
      Cash <b class={f.cash < 0 ? 'down' : ''}>{money(f.cash)}</b> · Franchise value <b>{money(f.value)}</b>
    </div>
  );
  /** Ratings, and what the scouts say about how good he can become. */
  const scouted = (p: PlayerRecord): ComponentChildren => (
    <>
      <Ratings player={p} />
      <div>Potential: {potentialText(f, p)}</div>
    </>
  );
  const staffRow = (member: StaffMember, note = ''): ComponentChildren => (
    <span class="player-row">
      <span class={`grade grade-${member.grade}`}>{member.grade}</span>
      <span class="pname">{member.name}</span>
      <span>{roleOf(member).title}</span>
      <span class="cap">{money(member.salary)}</span>
      <span class="years">{member.contractYears}y</span>
      {note && <span class="note">{note}</span>}
    </span>
  );

  /** Plays the game waiting at the current stop or playoff round. */
  const playSeasonGame = (): void => {
    const game = matchup(f);
    if (!game) return;
    setPlaying(true);
    const homeColour = jerseyColour(f);
    playMatch({ home: game.home, away: game.away, level: game.level, powerups: game.powerups, homeColour, awayColour: teamColour(game.away.name, homeColour), userAtHome: isHomeGame(season.gamesPlayed + 1), forfeitNote: 'Giving the game up counts as a loss, whatever the score.' }, (result) => {
      showOutcome(recordGame(f, result));
      // The pause menu may have changed the sound or the controls.
      setPrefs(loadPrefs());
      setPlaying(false);
    });
  };
  /** After a season game, played or simulated: save, and step through what it earned. */
  const showOutcome = (outcome: ReturnType<typeof recordGame>): void => {
    setGroup(null);
    if (outcome.ok && outcome.rewards) {
      setRewards(outcome.rewards);
      setScreen({ name: 'rewards', shown: 1 });
      setMessage(outcome.message);
    } else {
      setScreen({ name: 'home' });
      setMessage(outcome.ok ? outcome.message : outcome.reason);
    }
    commit(f);
  };

  const nameOf = (playerId: string | null): string | undefined => (playerId ? league.players[playerId]?.name : undefined);

  const teamItems = groupItems;

  const seasonLine = (
    <div>
      Strikes <Dots filled={season.strikes} total={rules.maxStrikes} /> · Powerups {season.powerups.length} · Artifacts {f.artifacts.length}
      {season.temps.length > 0 && <> · {season.temps.map((t) => `${t.label} (${t.games} game${t.games === 1 ? '' : 's'})`).join(', ')}</>}
    </div>
  );

  const loadoutLine = (
    <div>
      {BUTTONS.map((button, slot) => {
        const id = season.loadout[slot];
        return (
          <span key={button}>
            {button}: <b>{id ? powerupInfo(id).name : 'empty'}</b>
            {slot === 0 ? ' · ' : ''}
          </span>
        );
      })}
    </div>
  );

  const view = ((): ComponentChildren => {
  // ---------------------------------------------------------------- title

  if (screen.name === 'title') {
    const last = f.books[f.books.length - 1];
    return (
      <Menu
        key="title"
        stack
        title={team.name}
        header={
          <div class="title-screen">
            <div class="title-mark">{gameInfo.title}</div>
            <div class="title-tag">{gameInfo.tagline}</div>
            <div class="title-team">
              <CrestBadge crest={myCrest} size={64} />
              <div>
                <b>{team.name}</b>
                <span>
                  {locked ? `Season ${league.season} in progress` : `Off-season before season ${league.season}`} · {difficultyInfo(f.difficulty).name}
                </span>
                <span>{last ? `Last season: ${last.wins} wins${last.champion ? ', champions' : ''}` : 'A new franchise'}</span>
              </div>
            </div>
          </div>
        }
        help="A continue"
        items={[{ key: 'continue', label: <b>Continue</b>, onSelect: () => go({ name: 'home' }) }]}
      />
    );
  }

  // ---------------------------------------------------------------- home

  if (screen.name === 'home') {
    // Off-season hub.
    if (season.phase === 'offseason') {
      const ready = canPlay(league, team);
      const pending = f.offseason.pending.length;
      const lastBooks = f.books[f.books.length - 1];
      return (
        <Menu
          key={screenKey}
          remember="hub"
          columns={2}
          title={team.name}
          message={message}
          header={
            <>
              <div class="team-card">
                <CrestBadge crest={myCrest} size={58} />
                <div class="team-card-text">
                  <b>{team.name}</b>
                  <span>
                    Off-season before season {league.season} · {difficultyInfo(f.difficulty).name}
                  </span>
                  <span>
                    All-time {f.record.wins}-{f.record.losses}-{f.record.overtimeLosses}
                    {lastBooks ? ` · last season ${lastBooks.wins} wins${lastBooks.champion ? ', champions' : ''}` : ''}
                  </span>
                </div>
              </div>
              <CapLine league={league} team={team} />
              {cashLine}
              {fireSale && (
                <div class="warn">
                  Fire sale: you are out of cash, and the season cannot start until you are back to zero. Releasing a player under contract or letting
                  staff go now pays half a season of what they earn.
                </div>
              )}
              {f.prestige.level > 0 && <div>Prestige level {f.prestige.level}: {prestigeEffects(f.prestige.level).slice(0, 2).join(' ')}</div>}
              {!ready.ok && <div class="warn">Cannot play yet: {ready.reason}</div>}
            </>
          }
          help="A select · left/right and up/down move"
          items={[
            ...(pending > 0
              ? [
                  tile('contracts', 'Decide contracts', `${pending} to settle before the season can start`, () => go({ name: 'contracts' }), {
                    badge: pending,
                    primary: true,
                    wide: true,
                    detail: 'Re-sign each player or let him go.',
                  }),
                ]
              : []),
            tile('start', 'Start the season', `Season ${league.season}: three regions, then the playoffs`, () => after(startSeason(f)), {
              primary: pending === 0,
              wide: true,
              disabled: !ready.ok || pending > 0 || fireSale,
              detail: pending > 0
                ? 'Decide your expiring contracts first.'
                : fireSale
                  ? 'You are out of cash. Raise money first.'
                  : 'Your seventh skater is the spare: you can swap him in between games.',
            }),
            ...(canBailOut(f)
              ? [
                  tile('bailout', 'League bail-out', 'Ask the league to cover your debt', () => {
                    const result = bailOut(f);
                    after(result.ok ? { ok: true, message: 'The league has covered your debt. Your franchise value has dropped.' } : result);
                  }, { wide: true, detail: 'You have nothing left to sell. The league pays what you owe and your franchise value drops by a tenth.' }),
                ]
              : []),
            card('team', 'Team', pending > 0 ? `${pending} contract${pending === 1 ? '' : 's'} due` : `${rosterOf(league, team).length} players`, () => openGroup('team'), {
              badge: pending,
              detail: 'Roster, lineup, free agents, trades and the mascot.',
            }),
            card('office', 'Front office', `Cash ${money(f.cash)}`, () => openGroup('office'), { detail: 'Finances, staff, facilities and prestige.' }),
            card('collection', 'Collection', f.packs.length > 0 ? `${f.packs.length} pack${f.packs.length === 1 ? '' : 's'} to open` : `${f.gear.length} pieces of gear`, () => openGroup('collection'), {
              badge: f.packs.length,
              detail: 'Packs, gear, artifacts and your jersey.',
            }),
            card('settings', 'Settings', `${difficultyInfo(f.difficulty).name} · sound ${prefs.sound ? 'on' : 'off'}`, () => openGroup('settings'), {
              detail: 'Difficulty, sound, rink detail, save and load.',
            }),
            card('exhibition', 'Exhibition', 'A game that does not count', () => go({ name: 'exhibition' }), {
              disabled: !ready.ok,
              detail: 'A one-off game against any team. Nothing is won or lost.',
            }),
          ]}
        />
      );
    }

    // Season over.
    if (season.phase === 'ended') {
      return (
        <Menu
          key={screenKey}
          stack
          title={`Season ${league.season} is over`}
          message={message}
          header={
            <>
              <SeasonSummaryCard summary={seasonSummary(f)} crest={myCrest} season={league.season} artifacts={f.artifacts.length} />
              {season.outcome === 'champion' && f.prestige.level < prestigeRules.maxLevel && <div class="warn">As champions you can prestige in the off-season.</div>}
            </>
          }
          help="A continue"
          items={[
            tile('next', 'Continue to the off-season', 'XP is banked, everyone is a year older, contracts tick down', () => after(finishSeason(f), { name: 'report' }), {
              primary: true,
              icon: 'play',
            }),
          ]}
        />
      );
    }

    // A boss is beaten: pick an artifact.
    if (season.stage === 'reward') {
      return (
        <Menu
          key={screenKey}
          title="Choose an artifact"
          message={message}
          header="You beat the boss. Take one: artifacts are always on, and you keep them from season to season until you prestige."
          items={season.offer.map((id) => {
            const a = artifactInfo(id);
            return tile(id, a.name, '', () => after(pickArtifact(f, id)), { icon: 'artifacts', primary: true, detail: a.description });
          })}
        />
      );
    }

    /** The four groups as dashboard tiles, for the foot of every in-season screen. */
    const groupCards = (): MenuItem[] => [
      card('team', 'Team', 'Lineup, players, mascot', () => openGroup('team')),
      card('office', 'Front office', `Cash ${money(f.cash)}`, () => openGroup('office')),
      card('collection', 'Collection', f.packs.length > 0 ? `${f.packs.length} to open` : `${f.gear.length} pieces`, () => openGroup('collection'), { badge: f.packs.length }),
      card('settings', 'Settings', 'Sound, detail, save', () => openGroup('settings')),
      card('exhibition', 'Exhibition', 'A game that does not count', () => go({ name: 'exhibition' })),
    ];
    const best = (players: PlayerRecord[]): PlayerRecord[] => [...players].sort((x, y) => y.overall - x.overall).slice(0, 3);

    // A game is waiting: a map game, a boss, or a playoff game.
    const game = matchup(f);
    if (game) {
      const strength = Math.round(game.away.players.reduce((s, p) => s + p.overall, 0) / game.away.players.length);
      const mine = Math.round(game.home.players.reduce((s, p) => s + p.overall, 0) / game.home.players.length);
      const series = season.playoffs;
      const theirCrest = teamCrest(game.away.name, teamColour(game.away.name, jerseyColour(f)));
      const theirStyle = styleInfo(game.away.setup.style);
      /** The goalie of a dressed team: the last player, unless a mascot has somehow taken the spot. */
      const goalieOf = (players: PlayerRecord[]): { goalie?: PlayerRecord } => {
        const g = players[players.length - 1];
        return g && g.position === 'G' ? { goalie: g } : {};
      };
      return (
        <Menu
          key={screenKey}
          remember="game"
          columns={2}
          title={game.title}
          message={message}
          header={
            <MatchupPoster
              home={{ crest: myCrest, name: team.name, strength: mine, stars: best(game.home.players), ...goalieOf(game.home.players) }}
              away={{ crest: theirCrest, name: game.away.name, strength, stars: best(game.away.players), ...goalieOf(game.away.players), ...(theirStyle ? { style: theirStyle.name } : {}) }}
            >
              {theirStyle && (
                <div class="note">
                  {game.away.name} play {theirStyle.name.toLowerCase()}. {theirStyle.describe}
                </div>
              )}
              {game.trait && (
                <div class="banner bad">
                  <Icon name="boss" size={18} />
                  <span>{game.trait}</span>
                </div>
              )}
              {game.mascots.home && (
                <div class="banner good">
                  <Icon name="mascot" size={18} />
                  <span>
                    Your mascot {game.mascots.home.mascot.name} drops in ({mascotRating(game.mascots.home.mascot.power)} overall). {game.mascots.home.sits} sits out.
                  </span>
                </div>
              )}
              {game.mascots.away && (
                <div class="banner bad">
                  <Icon name="mascot" size={18} />
                  <span>
                    Their mascot {game.mascots.away.mascot.name} is playing ({mascotRating(game.mascots.away.mascot.power)} overall):{' '}
                    {game.mascots.away.mascot.talents.map((id) => talentInfo(id).name).join(', ')}.
                  </span>
                </div>
              )}
              {f.prestige.level > 0 && (
                <div class="note">
                  Prestige {f.prestige.level}: they play {f.prestige.level * prestigeRules.opponentRatingPerLevel} points better than shown, and react sooner.
                </div>
              )}
              <div class="poster-foot">
                <StrikeLights strikes={season.strikes} />
                {series && (
                  <span>
                    Best of {rules.seriesWins * 2 - 1}: you <Dots filled={series.wins} total={rules.seriesWins} /> them <Dots filled={series.losses} total={rules.seriesWins} />
                  </span>
                )}
                <span>{isHomeGame(season.gamesPlayed + 1) ? 'Home' : 'Road'}</span>
              </div>
              <div class="poster-loadout">
                <Icon name="powerups" size={16} />
                {loadoutLine}
                <span class="note">Change in Collection</span>
              </div>
            </MatchupPoster>
          }
          help="A select · left/right and up/down move"
          items={[
            tile('play', 'Play', game.kind === 'game' ? 'Take the ice' : game.kind === 'boss' ? 'Bosses must be played' : 'Playoff games must be played', playSeasonGame, { primary: true, wide: true }),
            ...(canSimulate(f)
              ? [
                  tile('simulate', 'Simulate', 'Settle it without playing', () => showOutcome(simulateGame(f)), {
                    wide: true,
                    detail: `The result comes from the two teams' ratings, with yours counted ${rules.simPenalty} points weaker, so playing is the better bet. Powerups are not used.`,
                  }),
                ]
              : []),
            ...groupCards(),
          ]}
        />
      );
    }

    const stop = currentStop(f);

    // Training.
    if (stop && stop.kind === 'training') {
      const gain = Math.round(modified(rules.trainingBump, 'trainingBonus', artifactModifiers(f)));
      return (
        <Menu
          key={screenKey}
          title="Training"
          message={message}
          header={`Pick one dressed player. Every rating of his goes up by ${gain} for the rest of this season.`}
          help="A train him"
          items={season.dressed.map((id) => {
            const p = playerOf(league, id);
            return { key: id, label: <PlayerRow player={p} bump={bump(id)} />, detail: <TrainingGain player={p} gain={gain} />, onSelect: () => after(train(f, id)) };
          })}
        />
      );
    }

    // Event.
    if (stop && stop.kind === 'event' && stop.eventId) {
      const event = eventInfo(stop.eventId);
      return (
        <Menu
          key={screenKey}
          stack
          title={event.title}
          header={
            <>
              <EventHeader text={event.text} />
              <div class="poster-foot">
                <StrikeLights strikes={season.strikes} />
                <span>Pucks {season.currency}</span>
                <span>Powerups {season.powerups.length}</span>
              </div>
            </>
          }
          help="A choose"
          items={event.choices.map((choice, i) => tile(String(i), choice.label, '', () => after(chooseEvent(f, i)), { icon: 'event', primary: true }))}
        />
      );
    }

    // Shop.
    if (stop && stop.kind === 'shop') {
      const stock = stop.stock ?? [];
      return (
        <Menu
          key={screenKey}
          remember="shop"
          columns={2}
          title="Shop"
          message={message}
          header={
            <>
              <div class="purse">
                <i>Pucks to spend</i>
                <b>{season.currency}</b>
              </div>
              <div class="poster-foot">
                <StrikeLights strikes={season.strikes} />
                <span>Powerups in the bag {season.powerups.length}</span>
              </div>
            </>
          }
          help="A buy · left/right and up/down move"
          items={[
            ...stock.map((id, i): MenuItem => {
              const p = powerupInfo(id);
              const price = shopPrice(f, id);
              return {
                key: `${id}-${i}`,
                label: <ShopCard id={id} name={p.name} price={price} affordable={season.currency >= price} />,
                detail: p.description,
                disabled: season.currency < price,
                onSelect: () => after(buy(f, id)),
              };
            }),
            {
              key: 'heal',
              wide: true,
              label: (
                <span class="shop-card">
                  <Icon name="bailout" size={26} />
                  <span class="shop-name">Wipe one strike</span>
                  <span class={`price-tag${season.currency >= healPrice(f) ? '' : ' short'}`}>{healPrice(f)}</span>
                </span>
              ),
              detail: season.strikes === 0 ? 'You have no strikes to wipe.' : 'Removes one of your strikes.',
              disabled: season.strikes === 0 || season.currency < healPrice(f),
              onSelect: () => after(healStrike(f)),
            },
            tile('leave', 'Leave the shop', 'Back to the map', () => after(leaveShop(f)), { wide: true, icon: 'play' }),
          ]}
        />
      );
    }

    // The map: choose where to go next.
    const options = availableStops(f);
    const region = options[0]?.region ?? 0;
    const myStrength = Math.round(teamStrength(league, team.id));
    const stopCard = (s: Stop): { label: ComponentChildren; detail: string } => {
      if (s.kind === 'game' && s.opponentId) {
        const opponent = league.teams.find((x) => x.id === s.opponentId) as Team;
        return {
          label: <StopCard icon="game" kind="Game" title={opponent.name} crest={teamCrest(opponent.name)} theirs={Math.round(teamStrength(league, opponent.id))} mine={myStrength} />,
          detail: 'A win pays Pucks and a pack; a loss is a strike.',
        };
      }
      if (s.kind === 'boss' && s.bossId) {
        const boss = bossInfo(s.bossId);
        return {
          label: <StopCard icon="boss" kind="Boss" title={boss.name} />,
          detail: `${boss.trait}: ${boss.description} Beat him to choose an artifact; lose and it is a strike and a rematch.`,
        };
      }
      if (s.kind === 'training') return { label: <StopCard icon="training" kind="Training" title="One player improves" />, detail: 'One dressed player improves every rating for the rest of the season.' };
      if (s.kind === 'shop') return { label: <StopCard icon="shop" kind="Shop" title="Powerups for Pucks" />, detail: 'Spend Pucks on powerups, or wipe a strike.' };
      return { label: <StopCard icon="event" kind="Event" title="Something happens" />, detail: 'Something happens on the road, and you choose how to handle it.' };
    };
    const ahead = (s: Stop): string => {
      const next = [...new Set(s.next.map((id) => season.map?.stops[id]?.kind).filter(Boolean))];
      return next.length > 0 ? ` Leads to: ${next.join(' or ')}.` : '';
    };
    return (
      <Menu
        key={screenKey}
        remember="map"
        columns={2}
        title={`Season ${league.season} · Region ${region + 1} of ${rules.regions}`}
        message={message}
        onFocus={setMapFocus}
        header={
          <>
            {season.map && (
              <SeasonMapView map={season.map} last={season.last} current={season.current} open={options.map((o) => o.id)} focus={mapFocus} walked={season.visited} region={region} />
            )}
            <MapKey />
            <div class="poster-foot">
              <StrikeLights strikes={season.strikes} />
              <span>Powerups {season.powerups.length}</span>
              <span>Artifacts {f.artifacts.length}</span>
              {season.temps.map((t) => (
                <span key={t.label}>
                  {t.label} ({t.games})
                </span>
              ))}
            </div>
          </>
        }
        help="A go there · left/right and up/down move"
        items={[
          ...options.map((s): MenuItem => {
            const d = stopCard(s);
            return { key: s.id, wide: options.length === 1, label: d.label, detail: `${d.detail}${ahead(s)}`, onSelect: () => after(travel(f, s.id)) };
          }),
          ...groupCards(),
        ]}
      />
    );
  }

  // ---------------------------------------------------------------- team screens

  // ---------------------------------------------------------------- gear and packs

  if (screen.name === 'packs') {
    return (
      <Menu
        key={screenKey}
        remember="packs"
        title="Packs"
        message={message}
        header={
          f.packs.length === 0
            ? 'No packs to open. A season win earns a Bronze pack; a shutout, a 4-goal win or a boss win a Silver; each milestone a Gold.'
            : 'What is inside was decided when the pack was earned.'
        }
        onBack={home}
        help="A open · B back"
        items={f.packs.map((pack) => ({
          key: pack.id,
          label: <b>{packName(pack.type)}</b>,
          detail: `${pack.items.length} pieces. Earned: ${pack.reason}.`,
          onSelect: () => {
            const items = openPack(f, pack.id);
            if (!items) return;
            setScreen({ name: 'reveal', ids: items.map((g) => g.id), shown: 0, title: packName(pack.type) });
            setMessage('');
            commit(f);
          },
        }))}
      />
    );
  }

  if (screen.name === 'reveal') {
    const items = screen.ids.map((id) => f.gear.find((g) => g.id === id)).filter((g): g is GearItem => g !== undefined);
    const shown = Math.min(screen.shown, items.length);
    const all = shown >= items.length;
    const turn = (count: number): void => {
      // The sound for the best piece being turned over: a fanfare for a Legendary.
      const turned = items.slice(shown, count);
      gameAudio.play(turned.some((g) => g.rarity === 'legendary') ? 'legendary' : 'reveal');
      setScreen({ ...screen, shown: count });
    };
    return (
      <Menu
        key={`reveal-${shown}`}
        stack
        title={shown === 0 ? screen.title : `${screen.title}: ${shown} of ${items.length}`}
        header={<PackOpening title={screen.title} items={items} shown={shown} />}
        help={all ? 'A done' : 'A turn the next card'}
        items={
          all
            ? [{ key: 'done', label: <b>Done</b>, onSelect: () => go({ name: f.packs.length > 0 ? 'packs' : 'gear' }) }]
            : [
                { key: 'next', label: <b>{shown === 0 ? 'Open the pack' : 'Turn the next card'}</b>, onSelect: () => turn(shown + 1) },
                ...(shown > 0 ? [{ key: 'all', label: 'Turn them all', onSelect: () => turn(items.length) }] : []),
              ]
        }
      />
    );
  }

  if (screen.name === 'gear') {
    const filter = GEAR_FILTERS[gearFilter % GEAR_FILTERS.length]!;
    const cycle = (step: number): void => setGearFilter((gearFilter + step + GEAR_FILTERS.length) % GEAR_FILTERS.length);
    const shown = f.gear
      .filter(filter.test)
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id));
    return (
      <Menu
        key={screenKey}
        remember="gear"
        title="Gear"
        message={message}
        header={
          <>
            <div>
              {f.gear.length} pieces · <b>{f.tape}</b> tape · showing {filter.label} ({shown.length}) · left and right change what is shown
            </div>
            {f.gear.length === 0 && <div>Nothing yet. Open packs to get gear.</div>}
          </>
        }
        onBack={home}
        help="A equip, level up or scrap · left/right filter · B back"
        items={
          shown.length === 0
            ? [{ key: 'none', label: 'Nothing to show with this filter.', disabled: true, onLeft: () => cycle(-1), onRight: () => cycle(1) }]
            : shown.map((item) => ({
                key: item.id,
                label: <GearRow item={item} wearer={nameOf(item.wornBy)} />,
                detail: <GearCard item={item} />,
                onLeft: () => cycle(-1),
                onRight: () => cycle(1),
                onSelect: () => go({ name: 'item', itemId: item.id }),
              }))
        }
      />
    );
  }

  if (screen.name === 'item') {
    const item = f.gear.find((g) => g.id === screen.itemId);
    if (!item) {
      return <Menu key={screenKey} title="Gear" header="That piece is gone." onBack={() => go({ name: 'gear' })} items={[]} />;
    }
    const cost = levelCost(item);
    const value = rarityInfo(item.rarity).scrap;
    return (
      <Menu
        key={screenKey}
        title="Gear"
        message={message}
        header={
          <>
            <GearCard item={item} />
            <div>
              {item.wornBy ? `Worn by ${nameOf(item.wornBy)}` : 'In the inventory'} · level {item.level} of {gearData.maxLevel} · you have {f.tape} tape
            </div>
          </>
        }
        onBack={() => go({ name: 'gear' })}
        items={[
          { key: 'equip', label: 'Put it on a player', onSelect: () => go({ name: 'equipOn', itemId: item.id }) },
          ...(item.wornBy ? [{ key: 'off', label: 'Take it off', onSelect: () => after(unequip(f, item.id)) }] : []),
          {
            key: 'level',
            label: cost === null ? 'Level up: already at the top level' : `Level up · ${cost} tape`,
            detail: 'Each level adds 1 point to every boost on the piece.',
            disabled: cost === null || f.tape < cost,
            onSelect: () => {
              const result = levelUp(f, item.id);
              after(result.ok ? { ok: true, message: `Levelled up to ${item.level}.` } : result);
            },
          },
          {
            key: 'scrap',
            label: `Scrap for ${value} tape`,
            detail: item.wornBy ? 'Take it off first.' : 'The piece is destroyed.',
            disabled: item.wornBy !== null,
            onSelect: () => {
              const result = scrap(f, item.id);
              after(result.ok ? { ok: true, message: `Scrapped for ${value} tape.` } : result, { name: 'gear' });
            },
          },
        ]}
      />
    );
  }

  if (screen.name === 'equipOn') {
    const item = f.gear.find((g) => g.id === screen.itemId);
    const fits = rosterOf(league, team).filter((p) => item && (p.position === 'G') === (item.kind === 'goalie'));
    return (
      <Menu
        key={screenKey}
        title={item ? `Who wears it? ${slotName(item.slot)}` : 'Gear'}
        header={item ? <GearRow item={item} wearer={nameOf(item.wornBy)} /> : 'That piece is gone.'}
        onBack={() => go({ name: 'item', itemId: screen.itemId })}
        items={
          item
            ? fits.map((p) => {
                const has = wornBy(f, p.id).find((g) => g.slot === item.slot);
                return {
                  key: p.id,
                  label: <PlayerRow player={p} note={has ? (has.id === item.id ? 'wearing it' : 'replaces what he has') : ''} />,
                  detail: <EquipPreview f={f} player={p} slot={item.slot} candidate={item} />,
                  onSelect: () => {
                    const result = equip(f, item.id, p.id);
                    after(result.ok ? { ok: true, message: `${p.name} puts it on.` } : result, { name: 'item', itemId: item.id });
                  },
                };
              })
            : []
        }
      />
    );
  }

  if (screen.name === 'player') {
    const p = playerOf(league, screen.playerId);
    const worn = wornBy(f, p.id);
    const slots = p.position === 'G' ? gearData.slots.goalie : gearData.slots.skater;
    const progress = setProgress(worn);
    return (
      <Menu
        key={screenKey}
        remember={`player-${p.id}`}
        title={p.name}
        message={message}
        header={
          <>
            <div class="player-card">
              <Face player={p} size={64} />
              <div class="player-card-text">
                <div class="player-card-top">
                  <Grade player={p} />
                  <b class="player-card-ovr">{p.overall}</b>
                  <span class="player-card-pos">{p.position === 'F' ? 'Forward' : p.position === 'D' ? 'Defence' : 'Goalie'}</span>
                  {bump(p.id) !== 0 && <span class="bump">+{bump(p.id)} this season</span>}
                </div>
                <span>
                  Age {p.age} · {money(p.capHit)} a season · {p.contractYears} year{p.contractYears === 1 ? '' : 's'} left
                </span>
                <span>Potential: {potentialText(f, p)}</span>
              </div>
            </div>
            <Meter
              label={`Level ${p.level}`}
              tone="cool"
              share={(p.xp + (season.xp[p.id] ?? 0)) / xpForLevel(p.level)}
              value={
                <>
                  {Math.floor(p.xp)} of {xpForLevel(p.level)} XP
                  {(season.xp[p.id] ?? 0) > 0 && <> · +{Math.round(season.xp[p.id] ?? 0)} this season, banked when it ends</>}
                </>
              }
            />
            <GearedRatings f={f} player={p} />
            {!progress && <div>Gear changes ratings on the ice. It never changes his grade or cap hit.</div>}
          </>
        }
        onBack={() => go({ name: 'roster' })}
        help="A change a piece · B back"
        items={[
          ...slots.map((slot) => {
            const item = worn.find((g) => g.slot === slot);
            return {
              key: slot,
              label: (
                <span class="slot-row">
                  {!item && <GearArt slot={slot} rarity="empty" size={26} />}
                  <span class="slot-name">{slotName(slot)}</span>
                  {item ? <GearRow item={item} /> : <span class="note">empty</span>}
                </span>
              ),
              onSelect: () => go({ name: 'slot', playerId: p.id, slot }),
            };
          }),
          ...(locked ? [] : [{ key: 'release', label: 'Release him', onSelect: () => go({ name: 'release', playerId: p.id }) }]),
        ]}
      />
    );
  }

  if (screen.name === 'slot') {
    const p = playerOf(league, screen.playerId);
    const kind = p.position === 'G' ? 'goalie' : 'skater';
    const back: Screen = { name: 'player', playerId: p.id };
    const current = wornBy(f, p.id).find((g) => g.slot === screen.slot);
    const choices = f.gear
      .filter((g) => g.kind === kind && g.slot === screen.slot && g.id !== current?.id)
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || b.level - a.level || a.id.localeCompare(b.id));
    return (
      <Menu
        key={screenKey}
        title={`${p.name}: ${slotName(screen.slot).toLowerCase()}`}
        header={current ? <GearRow item={current} /> : 'Nothing in this slot. The line under the list shows what each piece would change.'}
        onBack={() => go(back)}
        items={[
          ...choices.map((item) => ({
            key: item.id,
            label: <GearRow item={item} wearer={nameOf(item.wornBy)} />,
            detail: <EquipPreview f={f} player={p} slot={screen.slot} candidate={item} />,
            onSelect: () => {
              const result = equip(f, item.id, p.id);
              after(result.ok ? { ok: true, message: `${p.name} puts it on.` } : result, back);
            },
          })),
          ...(current
            ? [
                {
                  key: 'off',
                  label: 'Take it off',
                  detail: <EquipPreview f={f} player={p} slot={screen.slot} candidate={null} />,
                  onSelect: () => after(unequip(f, current.id), back),
                },
              ]
            : []),
          ...(choices.length === 0 && !current ? [{ key: 'none', label: 'You have no gear for this slot yet.', disabled: true }] : []),
        ]}
      />
    );
  }

  // ---------------------------------------------------------------- between seasons

  if (screen.name === 'report') {
    const report = f.offseason.report;
    const pending = f.offseason.pending.length;
    const line = (key: string, label: ComponentChildren): MenuItem => ({ key, label, disabled: true });
    const changed = report ? [...report.improved, ...report.declined] : [];
    return (
      <Menu
        key={screenKey}
        title={report ? `After season ${report.season}` : 'Off-season report'}
        message={message}
        header={
          report ? (
            <>
              <div class="report-counts">
                <span class="pill-count up">
                  <b>{report.improved.length}</b> improved
                </span>
                <span class="pill-count down">
                  <b>{report.declined.length}</b> declined
                </span>
                <span class="pill-count">
                  <b>{report.retired.length}</b> retired
                </span>
              </div>
              <div>{report.leagueRetired} players retired across the league.</div>
              {pending > 0 && <div class="warn">The rest of the league makes its moves once you have decided your expiring contracts.</div>}
              {report.news.length > 0 && (
                <div class="news">
                  <i>League news</i>
                  {report.news.map((text, i) => (
                    <div key={i} class="news-item">
                      {text}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            'Nothing to report yet. Finish a season first.'
          )
        }
        onBack={home}
        help="A continue · B back"
        items={[
          pending > 0
            ? tile('next', 'Decide contracts', `${pending} to settle`, () => go({ name: 'contracts' }), { primary: true, icon: 'contracts', badge: pending })
            : tile('next', 'Continue', 'Back to the hub', home, { primary: true, icon: 'play' }),
          ...changed.map((c) => line(`change-${c.id}`, <ChangeRow player={league.players[c.id]} name={c.name} from={c.from} to={c.to} />)),
          ...(report ? report.retired.map((name, i) => line(`ret-${i}`, <span class="note">Retired: {name}</span>)) : []),
        ]}
      />
    );
  }

  if (screen.name === 'contracts') {
    const waiting = f.offseason.pending.map((id) => playerOf(league, id));
    return (
      <Menu
        key={screenKey}
        remember="contracts"
        title="Expiring contracts"
        message={message}
        header={
          <>
            <div>
              <CapLine league={league} team={team} />
            </div>
            <div>{waiting.length === 0 ? 'Every contract is decided.' : 'A new contract costs what his grade is worth now. Anyone you let go can be signed by another team.'}</div>
          </>
        }
        onBack={home}
        items={
          waiting.length === 0
            ? [{ key: 'done', label: 'Continue', onSelect: () => go({ name: 'report' }) }]
            : waiting.map((p) => ({
                key: p.id,
                label: <PlayerRow player={p} note={`new deal ${money(resignCapHit(p, f))}`} />,
                detail: scouted(p),
                onSelect: () => go({ name: 'contract', playerId: p.id }),
              }))
        }
      />
    );
  }

  if (screen.name === 'contract') {
    const p = playerOf(league, screen.playerId);
    const cost = resignCapHit(p, f);
    const done = (result: MoveResult, note: string): void => {
      if (!result.ok) return after(result);
      const left = f.offseason.pending.length;
      after({ ok: true, message: left > 0 ? note : `${note} The league has made its moves: see the news below.` }, { name: left > 0 ? 'contracts' : 'report' });
    };
    return (
      <Menu
        key={screenKey}
        title={`${p.name}: contract`}
        message={message}
        header={
          <>
            <div>
              <PlayerRow player={p} />
            </div>
            <div>
              He was paid {money(p.capHit)}. A new contract is <b>{money(cost)}</b> a season, and that stays fixed until it runs out.
            </div>
            <div>
              <CapLine league={league} team={team} />
            </div>
          </>
        }
        onBack={() => go({ name: 'contracts' })}
        items={[
          ...offseasonRules.resignYears.map((years) => ({
            key: `y${years}`,
            label: `Re-sign for ${years} season${years === 1 ? '' : 's'} · ${money(cost)} a season`,
            detail: p.age + years > 30 ? `He will be ${p.age + years} when it ends. Players slow down from 31.` : `He will be ${p.age + years} when it ends.`,
            onSelect: () => done(decideContract(f, p.id, years), `${p.name} re-signed for ${years} season${years === 1 ? '' : 's'}.`),
          })),
          {
            key: 'go',
            label: 'Let him go',
            detail: 'He joins the free agents, his gear returns to your inventory, and another team may sign him.',
            onSelect: () => done(decideContract(f, p.id, null), `${p.name} was let go.`),
          },
        ]}
      />
    );
  }

  if (screen.name === 'tradeTeams') {
    const others = league.teams.filter((x) => x.id !== league.userTeamId).sort((a, b) => teamStrength(league, b.id) - teamStrength(league, a.id));
    return (
      <Menu
        key={screenKey}
        remember="tradeTeams"
        title="Trade: choose a team"
        message={message}
        header="One of your players for one of theirs: skater for skater, or goalie for goalie. Both teams must stay under the cap."
        onBack={home}
        items={others.map((other) => {
          const best = rosterOf(league, other)[0];
          return {
            key: other.id,
            label: (
              <span class="team-row">
                <CrestBadge crest={teamCrest(other.name)} size={24} />
                <span class="tname">{other.name}</span>
                <span>average {Math.round(teamStrength(league, other.id))}</span>
                {best && (
                  <span>
                    best: <Grade player={best} /> {best.name}
                  </span>
                )}
              </span>
            ),
            onSelect: () => go({ name: 'tradeTheirs', teamId: other.id }),
          };
        })}
      />
    );
  }

  if (screen.name === 'tradeTheirs') {
    const other = teamOf(league, screen.teamId);
    return (
      <Menu
        key={screenKey}
        title={`${other.name}: who do you want?`}
        header={<CapLine league={league} team={other} />}
        onBack={() => go({ name: 'tradeTeams' })}
        items={rosterOf(league, other).map((p) => ({
          key: p.id,
          label: <PlayerRow player={p} />,
          detail: <Ratings player={p} />,
          onSelect: () => go({ name: 'tradeMine', teamId: other.id, theirId: p.id }),
        }))}
      />
    );
  }

  if (screen.name === 'tradeMine') {
    const other = teamOf(league, screen.teamId);
    const wanted = playerOf(league, screen.theirId);
    const mine = rosterOf(league, team).filter((p) => (p.position === 'G') === (wanted.position === 'G'));
    return (
      <Menu
        key={screenKey}
        title={`For ${wanted.name}: who do you offer?`}
        message={message}
        header={<CapLine league={league} team={team} />}
        onBack={() => go({ name: 'tradeTheirs', teamId: other.id })}
        help="A offer him · B back"
        items={mine.map((p) => {
          const verdict = evaluateTrade(f, p.id, other.id, wanted.id);
          return {
            key: p.id,
            label: <PlayerRow player={p} note={verdict.ok ? 'they would accept' : ''} />,
            detail: <TradeOffer give={p} get={wanted} accepted={verdict.ok} verdict={verdict.ok ? `${other.name} would accept.` : verdict.reason} />,
            onSelect: () => (verdict.ok ? go({ name: 'tradeConfirm', teamId: other.id, theirId: wanted.id, mineId: p.id }) : setMessage(verdict.reason)),
          };
        })}
      />
    );
  }

  if (screen.name === 'tradeConfirm') {
    const other = teamOf(league, screen.teamId);
    const wanted = playerOf(league, screen.theirId);
    const offered = playerOf(league, screen.mineId);
    return (
      <Menu
        key={screenKey}
        stack
        title={`Trade with ${other.name}`}
        header={
          <>
            <TradeOffer give={offered} get={wanted} accepted verdict={`${other.name} accept.`} />
            <div class="note">
              His gear returns to your inventory. Your payroll goes {wanted.capHit >= offered.capHit ? 'up' : 'down'} by {money(Math.abs(wanted.capHit - offered.capHit))}.
            </div>
          </>
        }
        onBack={() => go({ name: 'tradeMine', teamId: other.id, theirId: wanted.id })}
        initialFocus={1}
        items={[
          tile('yes', 'Make the trade', `${offered.name} for ${wanted.name}`, () => {
            const result = trade(f, offered.id, other.id, wanted.id);
            after(result.ok ? { ok: true, message: `Traded ${offered.name} to ${other.name} for ${wanted.name}. Check your lineup.` } : result, { name: 'home' });
          }, { icon: 'trade', primary: true }),
          tile('no', 'No, go back', 'Offer someone else', () => go({ name: 'tradeMine', teamId: other.id, theirId: wanted.id }), { icon: 'play' }),
        ]}
      />
    );
  }

  if (screen.name === 'prestige') {
    const next = f.prestige.level + 1;
    const allowed = canPrestige(f);
    return (
      <Menu
        key={screenKey}
        title="Prestige"
        message={message}
        header={
          <>
            <PrestigeLadder level={f.prestige.level} />
            <div class="note">Climbing a level keeps your roster, contracts, gear, tape and every player's level. It costs you your {f.artifacts.length} artifact{f.artifacts.length === 1 ? '' : 's'}, and cannot be undone.</div>
          </>
        }
        onBack={home}
        initialFocus={1}
        items={[
          tile('yes', allowed.ok ? `Climb to level ${next}` : 'Cannot climb yet', allowed.ok ? 'Give up your artifacts' : allowed.reason, () => {
            const result = prestige(f);
            after(result.ok ? { ok: true, message: `Prestige level ${next}. A new jersey colour is unlocked.` } : result, { name: 'jersey' });
          }, { icon: 'prestige', primary: allowed.ok, disabled: !allowed.ok, detail: allowed.ok ? prestigeEffects(next).join(' ') : allowed.reason }),
          tile('no', 'Not now', 'Back', home, { icon: 'play' }),
        ]}
      />
    );
  }

  if (screen.name === 'jersey') {
    const open = unlockedJerseys(f);
    return (
      <Menu
        key={screenKey}
        title="Jersey colour"
        message={message}
        header={`Your team wears this on the ice. ${open.length} of ${prestigeRules.jerseys.length} unlocked: each prestige level unlocks one more.`}
        onBack={home}
        initialFocus={f.prestige.jersey}
        items={prestigeRules.jerseys.map((jersey, i) => ({
          key: jersey.name,
          label: (
            <span>
              <span class="swatch" style={{ background: jersey.colour }} />
              {jersey.name}
              {i === f.prestige.jersey ? ' (wearing)' : ''}
            </span>
          ),
          detail: i < open.length ? undefined : `Unlocks at prestige level ${i}.`,
          disabled: i >= open.length,
          onSelect: () => after(setJersey(f, i)),
        }))}
      />
    );
  }

  // ---------------------------------------------------------------- the club: money, staff, facilities, mascot

  if (screen.name === 'finances') {
    const bills = seasonEndBills(f);
    const last = f.books[f.books.length - 1];
    const statement = (ledger: Ledger, title: string): MenuItem[] => {
      const t = totals(ledger);
      const lines = [...INCOME_LINES.filter((l) => ledger[l] !== 0), ...EXPENSE_LINES.filter((l) => ledger[l] !== 0)];
      const shares = sharesOf(lines.map((l) => ledger[l]));
      const isIncome = (l: string): boolean => (INCOME_LINES as readonly string[]).includes(l);
      return [
        { key: `${title}-head`, disabled: true, label: <span class="ledger-head">{title}</span> },
        ...lines.map(
          (l, i): MenuItem => ({
            key: `${title}-${l}`,
            disabled: true,
            label: <BarRow name={LINE_NAMES[l]} share={shares[i] ?? 0} tone={isIncome(l) ? 'in' : 'out'} figure={`${isIncome(l) ? '+' : '−'}${money(ledger[l])}`} />,
          }),
        ),
        {
          key: `${title}-net`,
          disabled: true,
          label: <BarRow name={t.profit >= 0 ? 'Profit' : 'Loss'} share={0} tone="net" figure={`${t.profit >= 0 ? '+' : '−'}${money(Math.abs(t.profit))}`} />,
        },
      ];
    };
    const due = bills.salaries + bills.staff + bills.upkeep + bills.mascot;
    return (
      <Menu
        key={screenKey}
        title="Finances"
        message={message}
        header={
          <>
            {cashLine}
            {f.books.length > 0 && (
              <LineChart
                labels={f.books.map((b) => `season ${b.season}`)}
                format={money}
                series={[
                  { name: 'Cash', values: f.books.map((b) => b.cashEnd), colour: 'var(--accent)' },
                  { name: 'Value', values: f.books.map((b) => b.valueEnd), colour: 'var(--good)' },
                ]}
              />
            )}
            <div class="due">
              <i>Due at season end</i>
              <span>
                Players {money(bills.salaries)} · staff {money(bills.staff)} · upkeep {money(bills.upkeep)} · mascot {money(bills.mascot)}
              </span>
              <span>
                Out <b class="down">{money(due)}</b> · sponsorship in <b class="up">{money(bills.sponsorship)}</b>
              </span>
            </div>
            <div class="note">
              Home games bring tickets, road games cost travel, every game sells merchandise ({starCount(f)} star player{starCount(f) === 1 ? '' : 's'}). The cap limits
              player pay; cash pays for everything.
            </div>
          </>
        }
        onBack={home}
        help="B back"
        items={[
          ...statement(f.ledger, locked ? `Season ${league.season} so far` : 'This off-season so far'),
          ...(last ? statement(last.ledger, `Season ${last.season}: ${last.wins} wins${last.champion ? ', champions' : ''}`) : []),
        ]}
      />
    );
  }

  if (screen.name === 'staff') {
    const items: MenuItem[] = STAFF_KINDS.flatMap((kind) => {
      const have = staffOfKind(f, kind);
      const empty = Math.max(0, slotsFor(kind) - have.length);
      return [
        ...have.map((member) => ({
          key: member.id,
          label: <StaffCard member={member} />,
          detail: roleOf(member).blurb,
          onSelect: () => go({ name: 'staffMember', staffId: member.id }),
        })),
        ...Array.from({ length: empty }, (_, i) => ({
          key: `${kind}-empty-${i}`,
          label: <OpenDesk job={kindName(kind)} />,
          detail: 'Nobody is doing this job. Hire someone from the pool.',
          onSelect: () => go({ name: 'hire' }),
        })),
      ];
    });
    return (
      <Menu
        key={screenKey}
        remember="staff"
        columns={2}
        title="Staff"
        message={message}
        header={
          <>
            {cashLine}
            <div>Two trainers, a scout and a promoter. Staff are paid from cash at the end of each season and do not count against the cap.</div>
          </>
        }
        onBack={home}
        help="A open · left/right and up/down move · B back"
        items={[...items, tile('hire', 'Hire from the pool', `${f.staffPool.length} available`, () => go({ name: 'hire' }), { wide: true, icon: 'freeAgents', primary: true })]}
      />
    );
  }

  if (screen.name === 'hire') {
    const pool = [...f.staffPool].sort((a, b) => gradePower(b.grade) - gradePower(a.grade) || a.id.localeCompare(b.id));
    return (
      <Menu
        key={screenKey}
        remember="hire"
        columns={2}
        title="Hire staff"
        message={message}
        header={
          <>
            {cashLine}
            <div>Grade D is one step, S is five: each step is worth what the line below says. A new pool arrives every off-season.</div>
          </>
        }
        onBack={() => go({ name: 'staff' })}
        help="A hire · left/right and up/down move · B back"
        items={pool.map((member) => {
          const kind = roleOf(member).kind;
          const full = staffOfKind(f, kind).length >= slotsFor(kind);
          return {
            key: member.id,
            label: <StaffCard member={member} note={full ? 'no free desk' : ''} />,
            detail: roleOf(member).blurb,
            onSelect: () => {
              const result = hire(f, member.id);
              after(result.ok ? { ok: true, message: `${member.name} hired for ${money(member.salary)} a season.` } : result);
            },
          };
        })}
      />
    );
  }

  if (screen.name === 'staffMember') {
    const member = f.staff.find((x) => x.id === screen.staffId);
    if (!member) return <Menu key={screenKey} title="Staff" header="He no longer works for you." onBack={() => go({ name: 'staff' })} items={[]} />;
    const price = staffSalePrice(f, member);
    return (
      <Menu
        key={screenKey}
        title={member.name}
        header={
          <>
            <StaffCard member={member} />
            <div>{roleOf(member).blurb}</div>
            <div class="note">
              {price > 0
                ? `Fire sale: selling his contract pays you ${money(price)}.`
                : 'Letting him go saves his salary from now on. It pays nothing, and he does not return to the pool.'}
            </div>
          </>
        }
        onBack={() => go({ name: 'staff' })}
        initialFocus={1}
        items={[
          tile('go', price > 0 ? 'Sell his contract' : 'Let him go', price > 0 ? `For ${money(price)}` : 'He leaves for good', () => {
            const result = letGo(f, member.id);
            after(result.ok ? { ok: true, message: `${member.name} has left.${result.paid > 0 ? ` You were paid ${money(result.paid)}.` : ''}` } : result, { name: 'staff' });
          }, { icon: 'trade' }),
          tile('keep', 'Keep him', 'Back to the staff', () => go({ name: 'staff' }), { icon: 'staff', primary: true }),
        ]}
      />
    );
  }

  if (screen.name === 'facilities') {
    return (
      <Menu
        key={screenKey}
        remember="facilities"
        columns={2}
        title="Facilities"
        message={message}
        header={
          <>
            {cashLine}
            <div>
              Each has {MAX_FACILITY_LEVEL} levels. Building is paid at once; every level costs upkeep each season (now {money(facilityUpkeep(f))}) and adds to
              your franchise value.
            </div>
          </>
        }
        onBack={home}
        help="A build the next level · left/right and up/down move · B back"
        items={FACILITIES.map((facility) => {
          const level = facilityLevel(f, facility.id);
          const cost = buildCost(level);
          return {
            key: facility.id,
            label: <FacilityCard id={facility.id} name={facility.name} level={level} maxLevel={MAX_FACILITY_LEVEL} cost={cost} affordable={cost !== null && f.cash >= cost} />,
            detail: facility.description,
            disabled: cost === null || f.cash < cost,
            onSelect: () => {
              const result = build(f, facility.id);
              after(result.ok ? { ok: true, message: `${facility.name} is now level ${level + 1}.` } : result);
            },
          };
        })}
      />
    );
  }

  if (screen.name === 'mascot') {
    const mine = userMascot(f);
    const cost = costumeCost(f);
    return (
      <Menu
        key={screenKey}
        title="Mascot"
        message={message}
        header={
          <MascotPanel name={f.mascot.name} power={mascotPower(f)} chance={dropInChance(mine.power)} rating={mascotRating(mine.power)}>
            <div class="talents">
              {f.mascot.talents.map((id, i) => (
                <TalentBadge key={id} name={talentInfo(id).name} known={i < mine.talents.length} needs={mascotRules.talentUnlockPower[i] ?? 0} />
              ))}
            </div>
          </MascotPanel>
        }
        onBack={home}
        items={[
          tile('costume', cost === null ? 'Costume at the top level' : 'Upgrade his costume', cost === null ? `Level ${f.mascot.costume}` : `To level ${f.mascot.costume + 1} for ${money(cost)}`, () => {
            const result = upgradeCostume(f);
            after(result.ok ? { ok: true, message: `${f.mascot.name} has a new costume.` } : result);
          }, { icon: 'jersey', primary: true, disabled: cost === null || f.cash < cost, detail: `Each costume level is ${mascotRules.costume.powerPerLevel} mascot power.` }),
          ...f.mascot.talents.map((id, i): MenuItem => {
            const talent = talentInfo(id);
            const known = i < mine.talents.length;
            return tile(id, talent.name, known ? 'Knows it' : `At power ${mascotRules.talentUnlockPower[i]}`, () => undefined, { icon: known ? 'prestige' : 'detail', disabled: true, detail: talent.description });
          }),
        ]}
      />
    );
  }

  // ---------------------------------------------------------------- hub groups

  if (screen.name === 'team') {
    const pending = f.offseason.pending.length;
    return (
      <Menu
        key={screenKey}
        remember="group-team"
        title="Team"
        message={message}
        header={<CapLine league={league} team={team} />}
        onBack={top}
        items={[
          ...(pending > 0 ? [tile('contracts', 'Contracts', `${pending} to decide`, () => go({ name: 'contracts' }), { badge: pending, primary: true })] : []),
          tile('roster', locked ? 'Players' : 'Roster', `${rosterOf(league, team).length} players: gear, details${locked ? '' : ', release'}`, () => go({ name: 'roster' })),
          tile('lineup', 'Lineup', 'Two lines of three and a goalie', () => go({ name: 'lineup' })),
          tile('fa', 'Free agents', 'Sign players from the pool', () => go({ name: 'freeAgents' }), { lock: locked ? 'Signing happens in the off-season.' : undefined }),
          tile('trade', 'Trade', 'One player for one player', () => go({ name: 'tradeTeams' }), {
            lock: locked ? 'Trades happen in the off-season.' : pending > 0 ? 'Decide your expiring contracts first.' : undefined,
          }),
          tile('mascot', 'Mascot', f.mascot.name, () => go({ name: 'mascot' })),
        ]}
      />
    );
  }

  if (screen.name === 'office') {
    const mayPrestige = canPrestige(f);
    return (
      <Menu
        key={screenKey}
        remember="group-office"
        title="Front office"
        message={message}
        header={cashLine}
        onBack={top}
        items={[
          tile('finances', 'Finances', `Cash ${money(f.cash)}`, () => go({ name: 'finances' })),
          tile('staff', 'Staff', `${f.staff.length} employed`, () => go({ name: 'staff' }), { lock: earlyLock }),
          tile('facilities', 'Facilities', 'Six buildings to level up', () => go({ name: 'facilities' }), { lock: earlyLock }),
          tile('prestige', 'Prestige', mayPrestige.ok ? `Level ${f.prestige.level}: ready to climb` : `Level ${f.prestige.level}`, () => go({ name: 'prestige' }), {
            lock: earlyLock,
            primary: mayPrestige.ok,
            detail: mayPrestige.ok ? 'You are champions. Give up your artifacts for a harder league and better packs.' : 'See the ladder of levels and what each one gives.',
          }),
          ...(f.offseason.report ? [tile('report', 'Report', `What changed after season ${f.offseason.report.season}`, () => go({ name: 'report' }))] : []),
        ]}
      />
    );
  }

  if (screen.name === 'collection') {
    return (
      <Menu
        key={screenKey}
        remember="group-collection"
        title="Collection"
        message={message}
        onBack={top}
        items={[
          tile('packs', 'Packs', f.packs.length > 0 ? 'Ready to open' : 'None to open', () => go({ name: 'packs' }), {
            badge: f.packs.length,
            primary: f.packs.length > 0,
            detail: 'Packs are earned by winning season games and by reaching milestones.',
          }),
          tile('gear', 'Gear', `${f.gear.length} pieces · ${f.tape} tape`, () => go({ name: 'gear' }), { detail: 'Equip, level up with tape, or scrap for tape.' }),
          ...(locked
            ? [
                tile('powerups', 'Powerups', `${season.powerups.length} in the bag`, () => go({ name: 'powerups' }), {
                  detail: 'Choose what LT and RB trigger in a game. Powerups are used up, and any left over are lost when the season ends.',
                }),
              ]
            : []),
          tile('artifacts', 'Artifacts', `${f.artifacts.length} owned`, () => go({ name: 'artifacts' }), { detail: 'Always on, and kept from season to season until you prestige.' }),
          tile('jersey', 'Jersey', unlockedJerseys(f)[f.prestige.jersey]?.name ?? '', () => go({ name: 'jersey' }), { detail: 'The colour your team wears on the ice.' }),
        ]}
      />
    );
  }

  if (screen.name === 'settings') {
    return (
      <Menu
        key={screenKey}
        remember="group-settings"
        title="Settings"
        message={message}
        onBack={top}
        items={[
          tile('difficulty', 'Difficulty', difficultyInfo(f.difficulty).name, () => go({ name: 'difficulty', fresh: false }), {
            lock: locked ? 'The difficulty can only be changed between seasons.' : undefined,
            detail: difficultyInfo(f.difficulty).description,
          }),
          tile('sound', 'Sound', prefs.sound ? 'On' : 'Off', () => changePrefs({ ...prefs, sound: !prefs.sound }), {
            detail: 'Every sound is made by the game as it runs. Sound starts after your first key press or tap; with only a controller connected, tap the screen once.',
          }),
          tile('volume', 'Volume', `${Math.round(prefs.volume * 100)}%`, () => {
            const next = VOLUME_STEPS[(VOLUME_STEPS.findIndex((v) => v >= prefs.volume - 0.001) + 1) % VOLUME_STEPS.length] as number;
            changePrefs({ ...prefs, volume: next });
            gameAudio.play('chime');
          }, { detail: 'Press to step through the levels.', disabled: !prefs.sound }),
          tile('detail', 'Rink detail', prefs.detail === 'full' ? 'Full' : 'Low', () => changePrefs({ ...prefs, detail: prefs.detail === 'full' ? 'low' : 'full' }), {
            detail: 'Low drops the skate marks, snow, screen shake and crowd movement. Try it if the game does not run smoothly on your phone.',
          }),
          tile('saves', 'Save and load', 'Export, import, or start again', () => go({ name: 'saves' }), {
            detail: 'The game saves by itself after every move, every stop and every game.',
          }),
        ]}
      />
    );
  }

  if (screen.name === 'difficulty') {
    const fresh = screen.fresh;
    return (
      <Menu
        key={screenKey}
        title={fresh ? 'New franchise: how hard?' : 'Difficulty'}
        message={message}
        header={
          fresh
            ? 'Your current team, record, season and artifacts are replaced. Difficulty only changes how sharp the opponents are, and you can change it between seasons.'
            : 'Difficulty only changes how sharp the opponents are: how fast they react and how many mistakes they make. Ratings, money and rewards are the same on every level.'
        }
        onBack={() => go({ name: fresh ? 'saves' : 'settings' })}
        initialFocus={Math.max(0, DIFFICULTIES.findIndex((d) => d.id === f.difficulty))}
        items={DIFFICULTIES.map((d) => ({
          key: d.id,
          label: (
            <span class="tile">
              <span class="tile-name">{d.name}</span>
              <span class="tile-what">{d.description}</span>
              {!fresh && d.id === f.difficulty ? <span class="badge">Now</span> : null}
            </span>
          ),
          onSelect: () => {
            if (fresh) {
              setGroup(null);
              setScreen({ name: 'home' });
              setMessage(`A new franchise has begun on ${d.name}.`);
              startOver(d.id);
            } else {
              after(setDifficulty(f, d.id), { name: 'settings' });
            }
          },
        }))}
      />
    );
  }

  if (screen.name === 'rewards') {
    const r = rewards;
    if (!r) return <Menu key={screenKey} title="Game over" items={[{ key: 'ok', label: 'Continue', onSelect: top }]} />;
    // What is shown builds up one press at a time: result, money, XP, then packs and milestones.
    const extras = r.pack !== null || r.milestones.length > 0;
    const steps = extras ? 4 : 3;
    const shown = Math.min(screen.shown, steps);
    const last = shown >= steps;
    return (
      <Menu
        key={`rewards-${shown}`}
        stack
        title={r.won ? 'Victory' : 'Defeat'}
        header={
          <div class="rewards">
            <div>
            <div class={`result-banner ${r.won ? 'won' : 'lost'}`}>
              {r.won ? 'You win' : r.forfeit ? 'Forfeit' : 'You lose'} {r.score[0]} – {r.score[1]}
            </div>
            {shown >= 2 && (
              <div>
                <div class="reward">
                  <i>Cash</i>
                  <b class={r.cash < 0 ? 'down' : 'up'}>
                    <CountUp value={r.cash} format={(v) => `${r.cash >= 0 ? '+' : ''}${money(v)}`} />
                  </b>
                </div>
                <div class="reward">
                  <i>Pucks</i>
                  <b>{r.pucks > 0 ? <CountUp value={r.pucks} format={(v) => `+${Math.round(v)}`} /> : '0'}</b>
                </div>
                {!r.won && season.phase !== 'ended' && (
                  <div class="reward">
                    <i>Strikes</i>
                    <Dots filled={season.strikes} total={rules.maxStrikes} />
                  </div>
                )}
              </div>
            )}
            {shown >= 4 && (
              <div>
                {r.pack && (
                  <div class="reward">
                    <i>Pack</i>
                    <b>{r.pack}</b>
                  </div>
                )}
                {r.milestones.map((name) => (
                  <div class="reward" key={name}>
                    <i>Milestone</i>
                    <b>{name}</b>
                  </div>
                ))}
              </div>
            )}
            </div>
            {shown >= 3 && (
              <div class="reward-xp">
                {r.xp.map((x) => {
                  const p = league.players[x.id];
                  if (!p) return null;
                  const banked = p.xp + (season.xp[x.id] ?? 0);
                  const need = xpForLevel(p.level);
                  return (
                    <>
                      <span class="reward-who">
                        <Face player={p} size={22} /> {x.name}
                      </span>
                      <span class="meter-bar">
                        <span class={`meter-fill${banked >= need ? '' : ' cool'}`} style={{ width: `${Math.min(1, banked / need) * 100}%`, display: 'block' }} />
                      </span>
                      <span>
                        <CountUp value={x.earned} format={(v) => `+${Math.round(v)} XP`} />
                        {banked >= need ? ' · level up' : ''}
                      </span>
                    </>
                  );
                })}
              </div>
            )}
          </div>
        }
        help="A next"
        items={[
          last
            ? { key: 'done', label: <b>Continue</b>, detail: shown >= 3 ? 'XP is banked, and levels are gained, when the season ends.' : undefined, onSelect: top }
            : { key: 'next', label: <b>Next</b>, onSelect: () => setScreen({ name: 'rewards', shown: shown + 1 }) },
        ]}
      />
    );
  }

  if (screen.name === 'roster') {
    const dressed = new Set([...dressedSkaters(team.lineup), team.lineup.goalie]);
    return (
      <Menu
        key={screenKey}
        remember="roster"
        title={locked ? 'Team' : 'Roster'}
        message={message}
        header={
          <>
            <CapLine league={league} team={team} />
            {locked && <div>The roster is locked until the season ends.</div>}
          </>
        }
        onBack={home}
        help="A gear and details · B back"
        items={rosterOf(league, team).map((p) => ({
          key: p.id,
          label: <PlayerRow player={p} bump={bump(p.id)} note={dressed.has(p.id) ? '' : locked ? 'spare' : 'not dressed'} />,
          detail: <GearedRatings f={f} player={p} />,
          onSelect: () => go({ name: 'player', playerId: p.id }),
        }))}
      />
    );
  }

  if (screen.name === 'release') {
    const p = playerOf(league, screen.playerId);
    return (
      <Menu
        key={screenKey}
        title={`Release ${p.name}?`}
        header={
          <>
            <div>
              <PlayerRow player={p} />
            </div>
            <div>He goes to the free-agent pool and {money(p.capHit)} comes off your cap. His gear returns to your inventory.</div>
            {playerSalePrice(f, p) > 0 && <div class="up">Fire sale: another club pays you {money(playerSalePrice(f, p))} to take over his contract.</div>}
            {fireSale && playerSalePrice(f, p) === 0 && <div class="warn">Releasing him raises no cash: he joined this off-season, or his contract has run out.</div>}
          </>
        }
        onBack={() => go({ name: 'player', playerId: p.id })}
        initialFocus={1}
        items={[
          {
            key: 'yes',
            label: 'Release him',
            onSelect: () => {
              const result = f.offseason.pending.includes(p.id) ? decideContract(f, p.id, null) : releasePlayer(f, p.id);
              after(result.ok ? { ok: true, message: `${p.name} was released.` } : result, { name: 'roster' });
            },
          },
          { key: 'no', label: 'Keep him', onSelect: () => go({ name: 'roster' }) },
        ]}
      />
    );
  }

  if (screen.name === 'freeAgents') {
    const order: Sort[] = ['overall', 'cost', 'age'];
    const positions: PositionFilter[] = ['all', 'F', 'D', 'G'];
    const cycle = (step: number): void => setSort(order[(order.indexOf(sort) + step + order.length) % order.length] as Sort);
    const unseen = hiddenFreeAgents(f);
    const pool = sortPlayers(
      league.freeAgents.filter((id) => !unseen.has(id)).map((id) => playerOf(league, id)),
      sort,
      faPosition,
    );
    const sortNames: Record<Sort, string> = { overall: 'Best', cost: 'Cheapest', age: 'Youngest' };
    const positionNames: Record<PositionFilter, string> = { all: 'All', F: 'Forwards', D: 'Defence', G: 'Goalies' };
    return (
      <Menu
        key={screenKey}
        remember="freeAgents"
        title="Free agents"
        message={message}
        header={
          <>
            <CapLine league={league} team={team} />
            <div class="chips">
              <i>Sort</i>
              {order.map((o) => (
                <span key={o} class={`chip-option${o === sort ? ' on' : ''}`}>
                  {sortNames[o]}
                </span>
              ))}
            </div>
            <div class="chips">
              <i>Show</i>
              {positions.map((p) => (
                <span key={p} class={`chip-option${p === faPosition ? ' on' : ''}`}>
                  {positionNames[p]}
                </span>
              ))}
            </div>
            <div class="note">
              {unseen.size > 0 ? `Your scouts have not found ${unseen.size} more, the ones with the most room to grow.` : 'Your scouts see the whole pool.'} Scouting
              points: {Math.round(scoutingPoints(f) * 10) / 10}.
            </div>
          </>
        }
        onBack={home}
        help="A sign · left/right sort · B back"
        items={[
          tile('show', 'Show', positionNames[faPosition], () => setFaPosition(positions[(positions.indexOf(faPosition) + 1) % positions.length] as PositionFilter), {
            icon: 'detail',
            detail: 'Press to step through all players, forwards, defence and goalies.',
          }),
          ...pool.map((p) => {
            const allowed = canSign(league, team, p.id);
            return {
              key: p.id,
              label: <PlayerRow player={p} note={allowed.ok ? '' : 'cannot sign'} />,
              detail: (
                <>
                  <Compare newcomer={p} current={wouldReplace(league, team, p)} label="Against" />
                  <div>Potential: {potentialText(f, p)}</div>
                  {!allowed.ok && <div class="warn">{allowed.reason}</div>}
                </>
              ),
              onLeft: () => cycle(-1),
              onRight: () => cycle(1),
              onSelect: () => {
                const result = signPlayer(f, p.id);
                const dressedNow = dressedSkaters(team.lineup).includes(p.id) || team.lineup.goalie === p.id;
                const note = dressedNow ? '' : ' He is not dressed yet: set your lineup.';
                after(result.ok ? { ok: true, message: `${p.name} signed for ${money(p.capHit)}.${note}` } : result);
              },
            } satisfies MenuItem;
          }),
        ]}
      />
    );
  }

  if (screen.name === 'lineup') {
    const problems = lineupProblems(league, team);
    /** One place in the formation: a face, his overall and name, and where he plays. */
    const chip = (p: PlayerRecord | null, role: string): ComponentChildren => (
      <span class="lineup-chip">
        <span class="chip-role">{role}</span>
        {p ? <Face player={p} size={34} /> : <span class="chip-empty" />}
        <span class="chip-name">{p ? p.name.split(' ').slice(-1)[0] : 'Empty'}</span>
        {p && (
          <span class="chip-ovr">
            <Grade player={p} /> {p.overall}
            {bump(p.id) !== 0 && <span class="bump"> +{bump(p.id)}</span>}
          </span>
        )}
      </span>
    );
    const slot = (line: 0 | 1, index: number): MenuItem => {
      const id = (line === 0 ? team.lineup.line1 : team.lineup.line2)[index] ?? null;
      const p = id ? playerOf(league, id) : null;
      return {
        key: `${line}-${index}`,
        label: chip(p, `L${line + 1} ${index === 0 ? 'centre' : 'wing'}`),
        detail: p ? <Ratings player={p} /> : 'Nobody plays here. Press A to choose someone.',
        onSelect: () => go({ name: 'pick', line, slot: index }),
      };
    };
    const goalie = team.lineup.goalie ? playerOf(league, team.lineup.goalie) : null;
    const spare = skatersOn(league, team).filter((p) => !dressedSkaters(team.lineup).includes(p.id));
    return (
      <Menu
        key={screenKey}
        remember="lineup"
        columns={3}
        title="Lineup"
        message={message}
        header={
          <>
            <div>Two lines of three: a centre between two wings. The centre takes faceoffs. Lines change by themselves as they tire.</div>
            {spare.length > 0 && (
              <div class="bench">
                <i>{locked ? 'Spare' : 'Not dressed'}</i>
                {spare.map((p) => (
                  <span key={p.id} class="bench-player">
                    <Face player={p} size={22} /> {p.name} <b>{p.overall}</b>
                  </span>
                ))}
              </div>
            )}
            {problems.length > 0 && <div class="warn">{problems.join(' ')}</div>}
          </>
        }
        onBack={home}
        help="A change who plays there · left/right and up/down move · B back"
        items={[
          // Each line is drawn as it lines up: a wing, the centre, the other wing.
          slot(0, 1),
          slot(0, 0),
          slot(0, 2),
          slot(1, 1),
          slot(1, 0),
          slot(1, 2),
          {
            key: 'goalie',
            wide: true,
            label: chip(goalie, 'Goalie'),
            detail: goalie ? <Ratings player={goalie} /> : 'You have no goalie: sign one from the free agents.',
            disabled: true,
          },
          ...(locked
            ? []
            : [
                tile('auto', 'Auto-fill', 'Dress your best six skaters', () => {
                  team.lineup = autoLineup(league, team);
                  after({ ok: true, message: 'Lineup filled with your best six skaters.' });
                }, { wide: true, icon: 'lineup' }),
              ]),
        ]}
      />
    );
  }

  if (screen.name === 'pick') {
    const where = (id: string): string => {
      const a = team.lineup.line1.indexOf(id);
      const b = team.lineup.line2.indexOf(id);
      if (a !== -1) return `line 1 ${a === 0 ? 'centre' : 'wing'}`;
      if (b !== -1) return `line 2 ${b === 0 ? 'centre' : 'wing'}`;
      return locked ? 'spare' : 'not dressed';
    };
    const choices = skatersOn(league, team);
    return (
      <Menu
        key={screenKey}
        title={`Line ${screen.line + 1} ${screen.slot === 0 ? 'centre' : 'wing'}: who plays here?`}
        header="Picking someone already dressed swaps the two."
        onBack={() => go({ name: 'lineup' })}
        items={choices.map((p) => ({
          key: p.id,
          label: <PlayerRow player={p} bump={bump(p.id)} note={where(p.id)} />,
          detail: <Ratings player={p} />,
          onSelect: () => after(setSeasonLineupSlot(f, screen.line, screen.slot, p.id), { name: 'lineup' }),
        }))}
      />
    );
  }

  if (screen.name === 'exhibition') {
    const mine = Math.round(teamStrength(league, team.id));
    const opponents = league.teams.filter((x) => x.id !== league.userTeamId).sort((a, b) => teamStrength(league, a.id) - teamStrength(league, b.id));
    return (
      <Menu
        key={screenKey}
        remember="exhibition"
        title="Exhibition game: choose an opponent"
        header={`Your team averages ${mine} overall. Weakest opponents first. Exhibition games do not count.`}
        onBack={home}
        items={opponents.map((opponent) => {
          const best = rosterOf(league, opponent)[0];
          return {
            key: opponent.id,
            label: (
              <span class="team-row">
                <CrestBadge crest={teamCrest(opponent.name)} size={24} />
                <span class="tname">{opponent.name}</span>
                <span>average {Math.round(teamStrength(league, opponent.id))}</span>
                {best && (
                  <span>
                    best: <Grade player={best} /> {best.name}
                  </span>
                )}
              </span>
            ),
            onSelect: () => {
              const homeTeam = dress(league, team);
              const away = dress(league, opponent);
              if (!homeTeam || !away) return;
              setPlaying(true);
              const homeColour = jerseyColour(f);
              playMatch({ home: homeTeam, away, homeColour, awayColour: teamColour(away.name, homeColour) }, (result) => {
                const verdict = result.winner === 0 ? 'won' : result.winner === 1 ? 'lost' : 'tied';
                setScreen({ name: 'home' });
                setMessage(result.forfeit ? `Exhibition against ${opponent.name} ended early.` : `Exhibition: ${verdict} ${result.score[0]}-${result.score[1]} against ${opponent.name}.`);
                setPrefs(loadPrefs());
                setPlaying(false);
              });
            },
          };
        })}
      />
    );
  }

  if (screen.name === 'powerups') {
    const counts = new Map<string, number>();
    for (const id of season.powerups) counts.set(id, (counts.get(id) ?? 0) + 1);
    return (
      <Menu
        key={screenKey}
        title="Powerups"
        message={message}
        header={
          <>
            <div>Used up when triggered in a game. Anything left over is lost at the end of the season.</div>
            {loadoutLine}
          </>
        }
        onBack={home}
        help="A load on a button · B back"
        items={[
          ...BUTTONS.map((button, slot) => {
            const id = season.loadout[slot];
            return tile(`slot-${slot}`, `${button} button`, id ? powerupInfo(id).name : 'Empty', () => go({ name: 'load', slot }), {
              icon: id ? powerupIcon(id) : 'powerups',
              primary: true,
              detail: id ? powerupInfo(id).description : 'Nothing loaded on this button. Press A to choose.',
            });
          }),
          ...[...counts.entries()].map(([id, count]) => {
            const p = powerupInfo(id);
            return tile(id, p.name, count > 1 ? `×${count} in the bag` : 'In the bag', () => undefined, { icon: powerupIcon(id), detail: p.description, disabled: true });
          }),
        ]}
      />
    );
  }

  if (screen.name === 'load') {
    const distinct = [...new Set(season.powerups)];
    return (
      <Menu
        key={screenKey}
        title={`${BUTTONS[screen.slot]} powerup`}
        header={distinct.length === 0 ? 'Your bag is empty. Win games, visit shops or take your chances at events.' : 'Choose what this button triggers in the next game.'}
        onBack={() => go({ name: 'powerups' })}
        items={[
          { key: 'none', label: 'Nothing', onSelect: () => after(setLoadout(f, screen.slot, null), { name: 'powerups' }) },
          ...distinct.map((id) => {
            const p = powerupInfo(id);
            const count = season.powerups.filter((x) => x === id).length;
            return tile(id, p.name, count > 1 ? `×${count}` : '', () => after(setLoadout(f, screen.slot, id), { name: 'powerups' }), { icon: powerupIcon(id), detail: p.description });
          }),
        ]}
      />
    );
  }

  if (screen.name === 'artifacts') {
    return (
      <Menu
        key={screenKey}
        title="Artifacts"
        header={f.artifacts.length === 0 ? 'None yet. Beat a boss to earn one.' : 'Always on, and kept from season to season.'}
        onBack={home}
        help="B back"
        items={f.artifacts.map((id) => {
          const a = artifactInfo(id);
          return { key: id, label: a.name, detail: a.description, disabled: true };
        })}
      />
    );
  }

  if (screen.name === 'saves') {
    return (
      <Menu
        key={screenKey}
        remember="saves"
        title="Save and load"
        message={message}
        header="The game saves by itself after every move, every stop and every game. A game in progress is not saved."
        onBack={home}
        items={[
          {
            key: 'export',
            label: 'Export the save to a file',
            onSelect: () => {
              downloadText('hockey-save.json', `${JSON.stringify(toSave(f, new Date().toISOString()), null, 2)}\n`);
              setMessage('Saved as hockey-save.json.');
            },
          },
          {
            key: 'import',
            label: 'Import a save from a file',
            onSelect: () => {
              void pickTextFile().then((text) => {
                if (text === null) return;
                const loaded = parseSave(text);
                if (!loaded.ok) return setMessage(loaded.reason);
                setScreen({ name: 'home' });
                setMessage('Save imported.');
                commit(franchiseOf(loaded.save));
              });
            },
          },
          ...(locked ? [{ key: 'abandon', label: 'Abandon this season', detail: 'Ends the season now and goes to the off-season. You keep your franchise.', onSelect: () => go({ name: 'confirmAbandon' }) }] : []),
          { key: 'new', label: 'Start a new franchise', onSelect: () => go({ name: 'confirmNew' }) },
        ]}
      />
    );
  }

  if (screen.name === 'confirmAbandon') {
    return (
      <Menu
        key={screenKey}
        title="Abandon this season?"
        header="The season ends now, without a title. Then the off-season runs as usual: XP is banked, everyone is a year older, contracts tick down and the season's bills are paid. Your Pucks and unused powerups are lost. You keep your team, gear, cash and artifacts. This cannot be undone."
        onBack={() => go({ name: 'saves' })}
        initialFocus={1}
        items={[
          {
            key: 'yes',
            label: 'Yes, abandon the season',
            onSelect: () => {
              setGroup(null);
              after(abandonSeason(f), { name: 'home' });
            },
          },
          { key: 'no', label: 'No, keep playing', onSelect: () => go({ name: 'saves' }) },
        ]}
      />
    );
  }

  return (
    <Menu
      key={screenKey}
      title="Start a new franchise?"
      header="Your current team, record, season and artifacts are replaced. Export the save first if you want to keep them."
      onBack={() => go({ name: 'saves' })}
      initialFocus={1}
      items={[
        {
          key: 'yes',
          label: 'Yes, start again',
          onSelect: () => go({ name: 'difficulty', fresh: true }),
        },
        { key: 'no', label: 'No, keep playing', onSelect: () => go({ name: 'saves' }) },
      ]}
    />
  );
  })();
  return (
    <WearingContext.Provider value={wearing}>
      <MenuChrome.Provider value={<Wallet f={f} />}>{view}</MenuChrome.Provider>
    </WearingContext.Provider>
  );
}
