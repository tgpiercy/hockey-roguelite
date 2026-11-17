import { keptGame } from './keptGame';
import { opened } from '../core/opening';
import { assistStrengths } from '../core/assists';
import { seasonRegions } from '../core/season';
import { progress } from '../core/achievements';
import { storageProtected } from './safety';
import { pregameLine } from '../core/voice';
import { type Tournament } from '../core/tournament';
import { setupLine, type SeasonSetup } from '../core/charter';
import { newWeekly, weekKey } from '../core/weekly';
import { STANDARD_RINK } from '../core/rinks';
import { openJoining, secondJoined } from '../game/gamepad';
import { music } from '../game/music';
import type { ComponentChildren } from 'preact';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { bossInfo } from '../core/bosses';
import { type PositionFilter } from '../core/compare';
import { teamCrest } from '../core/crest';
import { homeGame, inFireSale } from '../core/economy';
import { build } from '../core/facilities';
import { generateLeague } from '../core/generate';
import { userTeam, type Team } from '../core/league';
import { jerseyColour, prestige } from '../core/prestige';
import { type MoveResult } from '../core/roster';
import { potentialText } from '../core/scouting';
import { roleOf, type StaffMember } from '../core/staff';
import { franchiseOf, fromSave, toSave } from '../core/save';
import { periodSecondsOf, maxStrikes, setupOf, currentStop, difficultyInfo, matchup, newFranchise, powerupInfo, recordGame, rosterLocked, type ActionResult, type Franchise, type GameRewards, isRival } from '../core/season';
import { teamColour } from '../core/teamColours';
import rules from '../data/season.json';
import { gameAudio } from '../game/audio';
import { CrestBadge } from './Crest';
import { Icon, type IconName } from './Icon';
import { MenuChrome, MenuCrest, type MenuItem } from './Menu';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { menuInput } from './menuInput';
import { playMatch } from './playMatch';
import type { PlayerRecord } from '../core/player';
import { Dots, money, NO_TEAM, Ratings, Wallet, WearingContext, type Wearing } from './parts';
import { loadStored, store, WEEKLY_KEY } from './storage';
import { type Screen, type Sort, type Group, TILE_ICONS, BUTTONS, count, menuTint } from './pages/shared';
import { startPages } from './pages/start';
import { homePages } from './pages/home';
import { gearPages } from './pages/gear';
import { offseasonPages } from './pages/offseason';
import { clubPages } from './pages/club';
import { leaguePages } from './pages/league';
import { groupPages } from './pages/groups';
import { rosterPages } from './pages/roster';
import { playPages } from './pages/play';
import { deadlinePages } from './pages/deadline';
import { welcomePages } from './pages/welcome';
import { teachPages } from './pages/teach';
import { settingsPages } from './pages/settings';

/**
 * Everything the menu screens share: the franchise, which screen is showing, the device preferences, and the
 * helpers every screen uses to move about, save and build its rows. Null while there is nothing to show (the
 * save is still loading, or a game is on the ice).
 */
function useApp() {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const ref = useRef<Franchise | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState<Sort>('overall');
  const [faPosition, setFaPosition] = useState<PositionFilter>('all');
  const [gearFilter, setGearFilter] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** The score and period of a game kept from before for the game now waiting, or null. */
  const [keptWords, setKeptWords] = useState<string | null>(null);
  /** Two players: whether a second controller has joined, and how the two will play. */
  const [joined, setJoined] = useState(false);
  const [together, setTogether] = useState<'coop' | 'versus'>('coop');
  // Exhibition: the rink to play on, and whether it is a game or a shootout.
  const [exRink, setExRink] = useState<string>(STANDARD_RINK);
  const [exShootout, setExShootout] = useState(false);
  // An exhibition tournament in progress, or null. It is not saved: it counts for nothing.
  const [tourney, setTourney] = useState<Tournament | null>(null);
  // The charter and handicaps being chosen for the next season.
  const [plan, setPlan] = useState<SeasonSetup>({});
  // Whether the browser has agreed to keep the save (null until it has answered).
  const [keptSafe, setKeptSafe] = useState<boolean | null>(null);
  // True from a start with no save until the new player has said how hard and who switches.
  const [firstRun, setFirstRun] = useState(false);
  useEffect(() => {
    void storageProtected().then(setKeptSafe);
  }, []);
  // During a weekly run your own franchise waits here, untouched; null the rest of the time.
  const mainRef = useRef<Franchise | null>(null);
  useEffect(() => {
    // A second controller may join on the menus; during a game the seats are fixed.
    openJoining(!playing);
    if (playing) return;
    const timer = setInterval(() => setJoined(secondJoined()), 300);
    return () => clearInterval(timer);
  }, [playing]);
  // Say so when a second controller joins, so one that joins by accident is noticed.
  useEffect(() => {
    if (joined) setMessage('Player 2 has joined with a second controller. Send him away under Settings, or on the Exhibition screen.');
  }, [joined]);
  // The hub group the player came through, so B from a screen returns there and not to the top.
  const [group, setGroup] = useState<Group | null>(null);
  const [rewards, setRewards] = useState<GameRewards | null>(null);
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  /** At a training stop: the player chosen, while what he trains is being picked. */
  const [trainee, setTrainee] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // Sound follows the device's preferences from the first moment.
  useEffect(() => gameAudio.configure(prefs.sound, prefs.volume), [prefs]);
  // Music has its own switch and volume, and falls silent with the sound.
  useEffect(() => music.configure(prefs.sound && prefs.music, prefs.musicVolume), [prefs]);
  // The theme plays on the menus; a game stops it and starts it again when it ends.
  useEffect(() => music.loop('theme'), []);
  const changePrefs = (next: Prefs): void => {
    savePrefs(next);
    setPrefs(next);
  };

  /** Writes the franchise to storage and redraws. Call after anything changes. */
  const commit = (franchise: Franchise): void => {
    ref.current = franchise;
    // A weekly run is a save of its own.
    store(toSave(franchise, new Date().toISOString()), mainRef.current ? WEEKLY_KEY : undefined).catch(() => setMessage('Could not save: storage is unavailable in this browser.'));
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
          if (raw === null) setFirstRun(true);
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

  // The team colours reach every screen as CSS variables.
  const shown = ref.current;
  const shownColour = shown && !playing ? JSON.stringify(menuTint(shown, screen)) : '';
  useEffect(() => {
    if (shownColour === '') return;
    const c = JSON.parse(shownColour) as { team: string; deep: string; ink: string };
    const root = document.documentElement.style;
    root.setProperty('--team', c.team);
    root.setProperty('--team-deep', c.deep);
    root.setProperty('--team-ink', c.ink);
  }, [shownColour]);

  const f = ref.current;
  if (!f || playing) return null;
  const { league, season } = f;
  const team = userTeam(league);
  const locked = rosterLocked(f);
  // Your crest wears the jersey colour you chose; every other team's comes from its name.
  const myCrest = teamCrest(team.name, jerseyColour(f));
  // The menus wear the colours of the team whose screens these are: yours, or the boss or rival you are about to play.
  const foe = ((): { name: string; colour: string } | null => {
    if (screen.name !== 'home' || season.stage !== 'arrived') return null;
    const stop = currentStop(f);
    const waiting = stop && (stop.kind === 'boss' || (stop.kind === 'game' && isRival(f, stop.opponentId))) ? matchup(f) : null;
    return waiting ? { name: waiting.away.name, colour: teamColour(waiting.away.name, jerseyColour(f)) } : null;
  })();
  const barCrest = foe ? teamCrest(foe.name, foe.colour) : myCrest;
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
  /** This week's key, from today's date. */
  const thisWeek = (): string => {
    const now = new Date();
    return weekKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  };
  const weeklyOn = mainRef.current !== null;
  /** Sets your franchise aside and opens this week's run: the one in progress, or a new one. */
  const enterWeekly = (fresh = false): void => {
    const key = thisWeek();
    const open = (run: Franchise): void => {
      if (!mainRef.current) mainRef.current = f;
      setGroup(null);
      setScreen({ name: 'home' });
      setMessage(`Weekly run ${key}: ${setupLine(setupOf(run)) || 'standard rules'}. One region and its boss. Your own franchise is untouched.`);
      commit(run);
    };
    if (fresh) return open(newWeekly(key));
    loadStored(WEEKLY_KEY)
      .then((raw) => {
        const loaded = raw === null ? null : fromSave(raw);
        const kept = loaded && loaded.ok ? franchiseOf(loaded.save) : null;
        open(kept && kept.season.weekly === key ? kept : newWeekly(key));
      })
      .catch(() => open(newWeekly(key)));
  };
  /** Back to your own franchise. The run is kept as it stands. */
  const leaveWeekly = (note: string): void => {
    const main = mainRef.current;
    if (!main) return;
    mainRef.current = null;
    setGroup(null);
    setScreen({ name: 'home' });
    setMessage(note);
    commit(main);
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
  /** The weekly run's tile: into it from your franchise, or back out of it. */
  const weeklyCard = (): MenuItem =>
    weeklyOn
      ? card('weekly', 'Leave the weekly run', 'Back to your franchise', () => leaveWeekly('Back with your franchise. The weekly run is kept as you left it.'), { detail: 'The run stays as it is; come back to it any time this week.' })
      : card('weekly', 'Weekly run', `${thisWeek()}${f.weeklyClaimed === thisWeek() ? ' · won' : ''}`, () => enterWeekly(), {
          detail: 'A short season, one region and its boss, with a roster and rules that are the same for everyone this week. It is separate from your franchise; beat the boss and your franchise earns a Gold pack, once a week.',
        });
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

  /** Which game this is: one kept from before under the same name is picked up where it was. */
  const gameKeyOf = (opponent: string): string => `${season.weekly ?? 'club'}/${season.seed}/${league.season}/${season.gamesPlayed}/${season.strikes}/${opponent}`;
  // Whether the game waiting was begun before and kept: the game screen says so.
  const waiting = playing ? null : matchup(f);
  const waitingKey = waiting ? gameKeyOf(waiting.away.name) : null;
  useEffect(() => {
    let live = true;
    if (!waitingKey) setKeptWords(null);
    else void keptGame(waitingKey).then((world) => {
      if (live) setKeptWords(world && world.phase !== 'final' ? `${world.score[0]}-${world.score[1]}, ${world.overtime ? 'overtime' : `period ${world.period}`}` : world ? 'the final horn has gone' : null);
    });
    return () => {
      live = false;
    };
  }, [waitingKey]);
  /** Plays the game waiting at the current stop or playoff round. */
  const playSeasonGame = (): void => {
    const game = matchup(f);
    if (!game) return;
    setPlaying(true);
    setKeptWords(null);
    const homeColour = jerseyColour(f);
    const gameKey = gameKeyOf(game.away.name);
    // A second player who has joined plays on your team in a season game.
    // A boss is introduced before the puck drops: his club, his man, and what they do.
    const bossStop = game.kind === 'boss' ? currentStop(f) : null;
    const boss = bossStop?.bossId ? bossInfo(bossStop.bossId) : null;
    void keptGame(gameKey).then((kept) => playMatch({ keep: gameKey, ...(kept ? { resume: kept } : {}), ...(boss ? { intro: { title: boss.name, person: `${boss.person.name}, ${boss.person.role}`, lines: [boss.club, boss.trick] } } : {}), periodSeconds: periodSecondsOf(f), assists: assistStrengths(f), noTactics: !opened(f, 'tactics'), stage: season.phase === 'playoffs' ? seasonRegions(f) : (currentStop(f)?.region ?? 0), home: game.home, away: game.away, level: game.level, powerups: game.powerups, homeColour, awayColour: teamColour(game.away.name, homeColour), userAtHome: homeGame(f, season.gamesPlayed + 1), ...(game.rink ? { rink: game.rink } : {}), ...(game.rules ? { rules: game.rules } : {}), opening: pregameLine(f), forfeitNote: 'Giving the game up counts as a loss, whatever the score.', ...(joined ? { second: 0 as const } : {}) }, (result) => {
      // A game with a second player on your team marks the season as one played together.
      if (joined) f.season.coop = true;
      showOutcome(recordGame(f, result));
      // The pause menu may have changed the sound or the controls.
      setPrefs(loadPrefs());
      setPlaying(false);
    }));
  };
  /** After a season game, played or simulated: save, and step through what it earned. */
  const showOutcome = (outcome: ReturnType<typeof recordGame>): void => {
    setGroup(null);
    // A championship gets its fanfare.
    if (f.season.outcome === 'champion') music.sting('fanfare');
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
      Strikes <Dots filled={season.strikes} total={maxStrikes(f)} /> · Powerups {season.powerups.length} · Artifacts {f.artifacts.length}
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

  return {
    screen, setScreen, message, setMessage, sort, setSort, faPosition, setFaPosition, gearFilter, setGearFilter,
    playing, setPlaying, joined, setJoined, together, setTogether, exRink, setExRink, exShootout, setExShootout,
    tourney, setTourney, plan, setPlan, keptSafe, firstRun, setFirstRun, mainRef, group, setGroup, rewards, mapFocus,
    setMapFocus, trainee, setTrainee, prefs, setPrefs, changePrefs, commit, startOver, shown, f,
    league, season, team, locked, myCrest, barCrest, screenKey, go, after, weeklyOn,
    enterWeekly, leaveWeekly, home, top, openGroup, tile, weeklyCard, card, wearing, earlyLock,
    bump, fireSale, cashLine, scouted, playSeasonGame, keptWords, showOutcome, nameOf, loadoutLine,
  };
}

/** What the screens in `pages/` are given. */
export type AppCtx = NonNullable<ReturnType<typeof useApp>>;

/** The whole menu side of the game: the off-season hub, the season map and its stops, and the team screens. */
export function App() {
  const app = useApp();
  if (!app) return null;
  const { f, barCrest, wearing } = app;
  // Each file in `pages/` answers for its own screens; the first that has the one showing draws it.
  const view: ComponentChildren =
    startPages(app) ??
    homePages(app) ??
    gearPages(app) ??
    offseasonPages(app) ??
    clubPages(app) ??
    leaguePages(app) ??
    groupPages(app) ??
    rosterPages(app) ??
    playPages(app) ??
    deadlinePages(app) ??
    welcomePages(app) ??
    teachPages(app) ??
    settingsPages(app);
  return (
    <WearingContext.Provider value={wearing}>
      <MenuCrest.Provider value={<CrestBadge crest={barCrest} size={26} />}>
        <MenuChrome.Provider value={<Wallet f={f} />}>{view}</MenuChrome.Provider>
      </MenuCrest.Provider>
    </WearingContext.Provider>
  );
}
