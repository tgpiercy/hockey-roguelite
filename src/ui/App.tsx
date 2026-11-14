import type { ComponentChildren } from 'preact';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { bossInfo, teamStrength } from '../core/bosses';
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
  availableStops,
  buy,
  chooseEvent,
  currentStop,
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
  setLoadout,
  setSeasonLineupSlot,
  shopPrice,
  startSeason,
  train,
  travel,
  type ActionResult,
  type Franchise,
} from '../core/season';
import type { Stop } from '../core/seasonMap';
import { evaluateTrade, trade } from '../core/trades';
import { xpForLevel } from '../core/xp';
import gearData from '../data/gear.json';
import offseasonRules from '../data/offseason.json';
import mascotRules from '../data/mascot.json';
import prestigeRules from '../data/prestige.json';
import rules from '../data/season.json';
import { EquipPreview, GearCard, GearedRatings, GearRow, setProgress, slotName } from './gearParts';
import { Menu, type MenuItem } from './Menu';
import { menuInput } from './menuInput';
import { playMatch } from './matchView';
import type { PlayerRecord } from '../core/player';
import { CapLine, Dots, Grade, money, PlayerRow, Ratings } from './parts';
import { downloadText, loadStored, pickTextFile, store } from './storage';

type Screen =
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
  | { name: 'jersey' }
  | { name: 'saves' }
  | { name: 'confirmNew' };

type Sort = 'overall' | 'cost' | 'position';
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
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState<Sort>('overall');
  const [gearFilter, setGearFilter] = useState(0);
  const [playing, setPlaying] = useState(false);

  /** Writes the franchise to storage and redraws. Call after anything changes. */
  const commit = (franchise: Franchise): void => {
    ref.current = franchise;
    store(toSave(franchise, new Date().toISOString())).catch(() => setMessage('Could not save: storage is unavailable in this browser.'));
    redraw(0);
  };
  const startOver = (): void => commit(newFranchise(generateLeague(String(Date.now()))));

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
  const home = (): void => go({ name: 'home' });
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
      <span class="grade">{member.grade}</span>
      <span class="pname">{member.name}</span>
      <span>{roleOf(member).title}</span>
      <span class="cap">{money(member.salary)}</span>
      <span class="years">{member.contractYears}y</span>
      {note && <span class="note">{note}</span>}
    </span>
  );
  const clubItems = (): MenuItem[] => [
    { key: 'finances', label: `Finances · ${money(f.cash)}`, onSelect: () => go({ name: 'finances' }) },
    { key: 'staff', label: `Staff (${f.staff.length})`, onSelect: () => go({ name: 'staff' }) },
    { key: 'facilities', label: 'Facilities', onSelect: () => go({ name: 'facilities' }) },
    { key: 'mascot', label: `Mascot: ${f.mascot.name}`, onSelect: () => go({ name: 'mascot' }) },
  ];

  /** Plays the game waiting at the current stop or playoff round. */
  const playSeasonGame = (): void => {
    const game = matchup(f);
    if (!game) return;
    setPlaying(true);
    playMatch({ home: game.home, away: game.away, level: game.level, powerups: game.powerups, homeColour: jerseyColour(f) }, (result) => {
      const outcome = recordGame(f, result);
      setScreen({ name: 'home' });
      setMessage(outcome.ok ? outcome.message : outcome.reason);
      commit(f);
      setPlaying(false);
    });
  };

  const gearItems = (): MenuItem[] => [
    {
      key: 'packs',
      label: f.packs.length > 0 ? <b>Packs to open ({f.packs.length})</b> : 'Packs (0)',
      detail: 'Packs are earned by winning season games and by reaching milestones.',
      onSelect: () => go({ name: 'packs' }),
    },
    { key: 'gear', label: `Gear (${f.gear.length}) · ${f.tape} tape`, onSelect: () => go({ name: 'gear' }) },
  ];
  const nameOf = (playerId: string | null): string | undefined => (playerId ? league.players[playerId]?.name : undefined);

  const teamItems = (): MenuItem[] => [
    { key: 'roster', label: 'Team', onSelect: () => go({ name: 'roster' }) },
    { key: 'lineup', label: 'Lineup', onSelect: () => go({ name: 'lineup' }) },
    ...gearItems(),
    { key: 'powerups', label: `Powerups (${season.powerups.length})`, onSelect: () => go({ name: 'powerups' }) },
    { key: 'artifacts', label: `Artifacts (${f.artifacts.length})`, onSelect: () => go({ name: 'artifacts' }) },
    ...clubItems(),
    { key: 'saves', label: 'Save and load', onSelect: () => go({ name: 'saves' }) },
  ];

  const seasonLine = (
    <div>
      Strikes <Dots filled={season.strikes} total={rules.maxStrikes} /> · Currency <b>{season.currency}</b> · Powerups {season.powerups.length} · Artifacts{' '}
      {f.artifacts.length}
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

  // ---------------------------------------------------------------- home

  if (screen.name === 'home') {
    // Off-season hub.
    if (season.phase === 'offseason') {
      const ready = canPlay(league, team);
      const pending = f.offseason.pending.length;
      const mayPrestige = canPrestige(f);
      return (
        <Menu
          key={screenKey}
          remember="hub"
          title={team.name}
          message={message}
          header={
            <>
              <div>
                Off-season · Season {league.season} · Record {f.record.wins}-{f.record.losses}-{f.record.overtimeLosses} (wins, losses, overtime losses)
              </div>
              <div>
                <CapLine league={league} team={team} />
              </div>
              {cashLine}
              {fireSale && (
                <div class="warn">
                  Fire sale: you are out of cash, and the season cannot start until you are back to zero. Releasing a player under contract or letting
                  staff go now pays half a season of what they earn.
                </div>
              )}
              {f.prestige.level > 0 && <div>Prestige level {f.prestige.level}: {prestigeEffects(f.prestige.level).slice(0, 2).join(' ')}</div>}
              {pending > 0 && (
                <div class="warn">
                  {pending} contract{pending === 1 ? ' has' : 's have'} run out. Decide {pending === 1 ? 'it' : 'them'} before the season can start.
                </div>
              )}
              {!ready.ok && <div class="warn">Cannot play yet: {ready.reason}</div>}
            </>
          }
          items={[
            ...(pending > 0
              ? [{ key: 'contracts', label: <b>Expiring contracts ({pending})</b>, detail: 'Re-sign each player or let him go.', onSelect: () => go({ name: 'contracts' }) }]
              : []),
            {
              key: 'start',
              label: 'Start the season',
              detail:
                pending > 0
                  ? 'Decide your expiring contracts first.'
                  : 'Your dressed lineup is locked in for the whole season. The seventh skater stays home.',
              disabled: !ready.ok || pending > 0 || fireSale,
              onSelect: () => after(startSeason(f)),
            },
            ...(canBailOut(f)
              ? [
                  {
                    key: 'bailout',
                    label: <b>Ask the league to cover your debt</b>,
                    detail: 'You have nothing left to sell. The league pays what you owe and your franchise value drops by a tenth.',
                    onSelect: () => {
                      const result = bailOut(f);
                      after(result.ok ? { ok: true, message: 'The league has covered your debt. Your franchise value has dropped.' } : result);
                    },
                  },
                ]
              : []),
            { key: 'roster', label: 'Roster', onSelect: () => go({ name: 'roster' }) },
            { key: 'lineup', label: 'Lineup', onSelect: () => go({ name: 'lineup' }) },
            { key: 'fa', label: 'Free agents', onSelect: () => go({ name: 'freeAgents' }) },
            {
              key: 'trade',
              label: 'Trade',
              detail: pending > 0 ? 'Decide your expiring contracts first.' : 'One player for one player with any other team.',
              disabled: pending > 0,
              onSelect: () => go({ name: 'tradeTeams' }),
            },
            ...clubItems(),
            ...(f.offseason.report ? [{ key: 'report', label: `Off-season report: after season ${f.offseason.report.season}`, onSelect: () => go({ name: 'report' }) }] : []),
            ...gearItems(),
            { key: 'artifacts', label: `Artifacts (${f.artifacts.length})`, onSelect: () => go({ name: 'artifacts' }) },
            {
              key: 'exhibition',
              label: 'Exhibition game',
              detail: 'A one-off game against any team. It does not count.',
              disabled: !ready.ok,
              onSelect: () => go({ name: 'exhibition' }),
            },
            {
              key: 'prestige',
              label: mayPrestige.ok ? <b>Prestige: move up to level {f.prestige.level + 1}</b> : `Prestige (level ${f.prestige.level})`,
              detail: mayPrestige.ok ? 'You are champions. Give up your artifacts for a harder league and better packs.' : mayPrestige.reason,
              disabled: !mayPrestige.ok,
              onSelect: () => go({ name: 'prestige' }),
            },
            { key: 'jersey', label: `Jersey colour: ${unlockedJerseys(f)[f.prestige.jersey]?.name ?? ''}`, onSelect: () => go({ name: 'jersey' }) },
            { key: 'saves', label: 'Save and load', onSelect: () => go({ name: 'saves' }) },
          ]}
        />
      );
    }

    // Season over.
    if (season.phase === 'ended') {
      const verdict =
        season.outcome === 'champion' ? 'Champions!' : season.outcome === 'eliminated' ? 'Knocked out in the playoffs' : 'Three strikes: the season is over';
      return (
        <Menu
          key={screenKey}
          title={`Season ${league.season}: ${verdict}`}
          message={message}
          header={
            <>
              <div>
                {season.gamesWon} wins in {season.gamesPlayed} games · {season.strikes} strike{season.strikes === 1 ? '' : 's'}
              </div>
              <div>Powerups, currency and training bumps do not carry over. Your {f.artifacts.length} artifacts stay.</div>
              {season.outcome === 'champion' && f.prestige.level < prestigeRules.maxLevel && <div class="warn">As champions you can prestige in the off-season.</div>}
            </>
          }
          items={[
            {
              key: 'next',
              label: 'Continue to the off-season',
              detail: 'Players bank their XP, everyone gets a year older, and contracts tick down.',
              onSelect: () => after(finishSeason(f), { name: 'report' }),
            },
            { key: 'artifacts', label: `Artifacts (${f.artifacts.length})`, onSelect: () => go({ name: 'artifacts' }) },
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
          header="Artifacts are always on, and you keep them from season to season."
          items={season.offer.map((id) => {
            const a = artifactInfo(id);
            return { key: id, label: a.name, detail: a.description, onSelect: () => after(pickArtifact(f, id)) };
          })}
        />
      );
    }

    // A game is waiting: a map game, a boss, or a playoff game.
    const game = matchup(f);
    if (game) {
      const strength = Math.round(game.away.players.reduce((s, p) => s + p.overall, 0) / game.away.players.length);
      const mine = Math.round(game.home.players.reduce((s, p) => s + p.overall, 0) / game.home.players.length);
      const series = season.playoffs;
      return (
        <Menu
          key={screenKey}
          remember="game"
          title={game.title}
          message={message}
          header={
            <>
              <div>
                <b>{game.away.name}</b> average {strength} · your dressed team averages {mine}
              </div>
              {game.trait && <div class="warn">{game.trait}</div>}
              {game.mascots.home && (
                <div class="up">
                  Your mascot {game.mascots.home.mascot.name} drops in for this game ({mascotRating(game.mascots.home.mascot.power)} overall).{' '}
                  {game.mascots.home.sits} sits this one out.
                </div>
              )}
              {game.mascots.away && (
                <div class="warn">
                  Their mascot {game.mascots.away.mascot.name} is playing ({mascotRating(game.mascots.away.mascot.power)} overall):{' '}
                  {game.mascots.away.mascot.talents.map((id) => talentInfo(id).name).join(', ')}.
                </div>
              )}
              <div>{isHomeGame(season.gamesPlayed + 1) ? 'Home game: ticket money.' : 'Road game: travel costs.'}</div>
              {f.prestige.level > 0 && (
                <div>
                  Prestige level {f.prestige.level}: they play {f.prestige.level * prestigeRules.opponentRatingPerLevel} rating points better than that, and react
                  sooner.
                </div>
              )}
              {series && (
                <div>
                  Best of {rules.seriesWins * 2 - 1}: you <Dots filled={series.wins} total={rules.seriesWins} /> them{' '}
                  <Dots filled={series.losses} total={rules.seriesWins} />
                </div>
              )}
              {seasonLine}
            </>
          }
          items={[
            { key: 'play', label: 'Play', onSelect: playSeasonGame },
            ...BUTTONS.map((button, slot) => {
              const id = season.loadout[slot];
              return {
                key: `load-${slot}`,
                label: `${button} powerup: ${id ? powerupInfo(id).name : 'empty'}`,
                detail: id ? powerupInfo(id).description : 'Choose a powerup to trigger with this button during the game.',
                onSelect: () => go({ name: 'load', slot }),
              };
            }),
            ...teamItems(),
          ]}
        />
      );
    }

    const stop = currentStop(f);

    // Training.
    if (stop && stop.kind === 'training') {
      return (
        <Menu
          key={screenKey}
          title="Training"
          message={message}
          header="Pick one dressed player. Every rating of his goes up for the rest of this season."
          items={season.dressed.map((id) => {
            const p = playerOf(league, id);
            return { key: id, label: <PlayerRow player={p} bump={bump(id)} />, detail: <Ratings player={p} />, onSelect: () => after(train(f, id)) };
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
          title={event.title}
          header={
            <>
              <div class="event-text">{event.text}</div>
              {seasonLine}
            </>
          }
          items={event.choices.map((choice, i) => ({ key: String(i), label: choice.label, onSelect: () => after(chooseEvent(f, i)) }))}
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
          title="Shop"
          message={message}
          header={seasonLine}
          items={[
            ...stock.map((id, i) => {
              const p = powerupInfo(id);
              const price = shopPrice(f, id);
              return {
                key: `${id}-${i}`,
                label: `${p.name} · ${price} currency`,
                detail: p.description,
                disabled: season.currency < price,
                onSelect: () => after(buy(f, id)),
              };
            }),
            {
              key: 'heal',
              label: `Wipe one strike · ${healPrice(f)} currency`,
              detail: 'Removes one of your strikes.',
              disabled: season.strikes === 0 || season.currency < healPrice(f),
              onSelect: () => after(healStrike(f)),
            },
            { key: 'leave', label: 'Leave the shop', onSelect: () => after(leaveShop(f)) },
          ]}
        />
      );
    }

    // The map: choose where to go next.
    const options = availableStops(f);
    const region = options[0]?.region ?? 0;
    const describe = (s: Stop): { label: ComponentChildren; detail: ComponentChildren } => {
      if (s.kind === 'game' && s.opponentId) {
        const opponent = league.teams.find((x) => x.id === s.opponentId) as Team;
        return { label: `Game: ${opponent.name}`, detail: `Average ${Math.round(teamStrength(league, opponent.id))}. A win pays currency; a loss is a strike.` };
      }
      if (s.kind === 'boss' && s.bossId) {
        const boss = bossInfo(s.bossId);
        return { label: `Boss: ${boss.name}`, detail: `${boss.trait}: ${boss.description} Beat him to choose an artifact; lose and it is a strike and a rematch.` };
      }
      if (s.kind === 'training') return { label: 'Training', detail: 'One dressed player improves every rating for the rest of the season.' };
      if (s.kind === 'shop') return { label: 'Shop', detail: 'Spend currency on powerups, or wipe a strike.' };
      return { label: 'Event', detail: 'Something happens on the road, and you choose how to handle it.' };
    };
    const ahead = (s: Stop): string => {
      const next = s.next.map((id) => season.map?.stops[id]?.kind).filter(Boolean);
      return next.length > 0 ? ` Leads to: ${next.join(' or ')}.` : '';
    };
    return (
      <Menu
        key={screenKey}
        remember="map"
        title={`Season ${league.season} · Region ${region + 1} of ${rules.regions}`}
        message={message}
        header={
          <>
            {seasonLine}
            <div>Each region: a game, a stop, a game, a stop, then the boss. Choose your next stop.</div>
          </>
        }
        items={[
          ...options.map((s) => {
            const d = describe(s);
            return {
              key: s.id,
              label: <b>{d.label}</b>,
              detail: (
                <>
                  {d.detail}
                  {ahead(s)}
                </>
              ),
              onSelect: () => after(travel(f, s.id)),
            };
          }),
          ...teamItems(),
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
            setScreen({ name: 'reveal', ids: items.map((g) => g.id), shown: 1, title: packName(pack.type) });
            setMessage('');
            commit(f);
          },
        }))}
      />
    );
  }

  if (screen.name === 'reveal') {
    const items = screen.ids.map((id) => f.gear.find((g) => g.id === id)).filter((g): g is GearItem => g !== undefined);
    const all = screen.shown >= items.length;
    const current = items[Math.min(screen.shown, items.length) - 1];
    return (
      <Menu
        key={`reveal-${screen.shown}`}
        title={`${screen.title}: piece ${Math.min(screen.shown, items.length)} of ${items.length}`}
        header={
          <>
            {current && <GearCard item={current} />}
            {all && items.length > 1 && (
              <div class="reveal-list">
                {items.map((g) => (
                  <div key={g.id}>
                    <GearRow item={g} />
                  </div>
                ))}
              </div>
            )}
          </>
        }
        help="A next"
        items={[
          all
            ? { key: 'done', label: 'Done', onSelect: () => go({ name: f.packs.length > 0 ? 'packs' : 'gear' }) }
            : { key: 'next', label: 'Next piece', onSelect: () => setScreen({ ...screen, shown: screen.shown + 1 }) },
        ]}
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
            <div>
              <PlayerRow player={p} bump={bump(p.id)} />
            </div>
            <div>
              <GearedRatings f={f} player={p} />
            </div>
            <div>Potential: {potentialText(f, p)}</div>
            <div>
              Level {p.level} · {Math.floor(p.xp)} of {xpForLevel(p.level)} XP to the next level
              {(season.xp[p.id] ?? 0) > 0 && <> · {Math.round(season.xp[p.id] ?? 0)} XP earned this season, banked when it ends</>}
            </div>
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
    return (
      <Menu
        key={screenKey}
        title={report ? `After season ${report.season}` : 'Off-season report'}
        message={message}
        header={
          report ? (
            <>
              <div>
                {report.improved.length} of your players improved, {report.declined.length} declined, {report.retired.length} retired ·{' '}
                {report.leagueRetired} retired across the league
              </div>
              {pending > 0 && <div class="warn">The rest of the league makes its moves once you have decided your expiring contracts.</div>}
            </>
          ) : (
            'Nothing to report yet. Finish a season first.'
          )
        }
        onBack={home}
        help="A continue · B back"
        items={[
          pending > 0
            ? { key: 'next', label: <b>Decide expiring contracts ({pending})</b>, onSelect: () => go({ name: 'contracts' }) }
            : { key: 'next', label: 'Continue', onSelect: home },
          ...(report
            ? [
                ...report.improved.map((c) =>
                  line(
                    `up-${c.id}`,
                    <span>
                      <span class="up">▲</span> {c.name} {c.from} → <b>{c.to}</b>
                    </span>,
                  ),
                ),
                ...report.declined.map((c) =>
                  line(
                    `down-${c.id}`,
                    <span>
                      <span class="down">▼</span> {c.name} {c.from} → <b>{c.to}</b>
                    </span>,
                  ),
                ),
                ...report.retired.map((name, i) => line(`ret-${i}`, `Retired: ${name}`)),
                ...report.news.map((text, i) => line(`news-${i}`, text)),
              ]
            : []),
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
        header={
          <>
            <div>
              <PlayerRow player={wanted} />
            </div>
            <div>
              <CapLine league={league} team={team} />
            </div>
          </>
        }
        onBack={() => go({ name: 'tradeTheirs', teamId: other.id })}
        help="A offer him · B back"
        items={mine.map((p) => {
          const verdict = evaluateTrade(f, p.id, other.id, wanted.id);
          return {
            key: p.id,
            label: <PlayerRow player={p} note={verdict.ok ? 'they would accept' : ''} />,
            detail: verdict.ok ? <Ratings player={p} /> : <span class="warn">{verdict.reason}</span>,
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
        title={`${other.name} accept. Make the trade?`}
        header={
          <>
            <div>
              You get: <PlayerRow player={wanted} />
            </div>
            <div>
              You give: <PlayerRow player={offered} />
            </div>
            <div>His gear returns to your inventory. Your payroll goes {wanted.capHit >= offered.capHit ? 'up' : 'down'} by{' '}
              {money(Math.abs(wanted.capHit - offered.capHit))}.</div>
          </>
        }
        onBack={() => go({ name: 'tradeMine', teamId: other.id, theirId: wanted.id })}
        initialFocus={1}
        items={[
          {
            key: 'yes',
            label: 'Make the trade',
            onSelect: () => {
              const result = trade(f, offered.id, other.id, wanted.id);
              after(result.ok ? { ok: true, message: `Traded ${offered.name} to ${other.name} for ${wanted.name}. Check your lineup.` } : result, { name: 'home' });
            },
          },
          { key: 'no', label: 'No, go back', onSelect: () => go({ name: 'tradeMine', teamId: other.id, theirId: wanted.id }) },
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
        title={`Prestige to level ${next}?`}
        message={message}
        header={
          <>
            <div>
              <b>You keep:</b> your roster and contracts, all gear and tape, and every player's level and ratings.
            </div>
            <div>
              <b>You lose:</b> your {f.artifacts.length} artifact{f.artifacts.length === 1 ? '' : 's'}.
            </div>
            <div>
              <b>From then on:</b> {prestigeEffects(next).join(' ')}
            </div>
            <div>You will need to win the championship again before the next level. This cannot be undone.</div>
            {!allowed.ok && <div class="warn">{allowed.reason}</div>}
          </>
        }
        onBack={home}
        initialFocus={1}
        items={[
          {
            key: 'yes',
            label: `Yes, prestige to level ${next}`,
            disabled: !allowed.ok,
            onSelect: () => {
              const result = prestige(f);
              after(result.ok ? { ok: true, message: `Prestige level ${next}. A new jersey colour is unlocked.` } : result, { name: 'jersey' });
            },
          },
          { key: 'no', label: 'Not now', onSelect: home },
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
      const row = (key: string, name: string, amount: number, sign: string): MenuItem => ({
        key,
        disabled: true,
        label: (
          <span class="slot-row">
            <span class="slot-name">{name}</span>
            <span>
              {sign}
              {money(amount)}
            </span>
          </span>
        ),
      });
      return [
        { key: `${title}-head`, disabled: true, label: <b>{title}</b> },
        ...INCOME_LINES.filter((line) => ledger[line] !== 0).map((line) => row(`${title}-${line}`, LINE_NAMES[line], ledger[line], '+')),
        ...EXPENSE_LINES.filter((line) => ledger[line] !== 0).map((line) => row(`${title}-${line}`, LINE_NAMES[line], ledger[line], '−')),
        row(`${title}-net`, t.profit >= 0 ? 'Profit' : 'Loss', Math.abs(t.profit), t.profit >= 0 ? '+' : '−'),
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
            <div>
              Due when this season ends: players {money(bills.salaries)}, staff {money(bills.staff)}, upkeep {money(bills.upkeep)}, mascot{' '}
              {money(bills.mascot)} = <b>{money(due)}</b>. Sponsorship then pays <b>{money(bills.sponsorship)}</b>.
            </div>
            <div>
              Home games bring ticket money and road games cost travel; every game sells merchandise ({starCount(f)} star player
              {starCount(f) === 1 ? '' : 's'} graded B+ or better). The salary cap is separate: it limits player pay, cash pays for everything.
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
          label: staffRow(member),
          detail: roleOf(member).blurb,
          onSelect: () => go({ name: 'staffMember', staffId: member.id }),
        })),
        ...Array.from({ length: empty }, (_, i) => ({
          key: `${kind}-empty-${i}`,
          label: (
            <span class="slot-row">
              <span class="slot-name">{kindName(kind)}</span>
              <span class="note">nobody: hire one</span>
            </span>
          ),
          onSelect: () => go({ name: 'hire' }),
        })),
      ];
    });
    return (
      <Menu
        key={screenKey}
        remember="staff"
        title="Staff"
        message={message}
        header={
          <>
            {cashLine}
            <div>Two trainers, a scout and a promoter. Staff are paid from cash at the end of each season and do not count against the cap.</div>
          </>
        }
        onBack={home}
        items={[...items, { key: 'hire', label: `Hire from the pool (${f.staffPool.length} available)`, onSelect: () => go({ name: 'hire' }) }]}
      />
    );
  }

  if (screen.name === 'hire') {
    const pool = [...f.staffPool].sort((a, b) => gradePower(b.grade) - gradePower(a.grade) || a.id.localeCompare(b.id));
    return (
      <Menu
        key={screenKey}
        remember="hire"
        title="Hire staff"
        message={message}
        header={
          <>
            {cashLine}
            <div>Grade D is one step, S is five: each step is worth what the line under the list says. A new pool arrives every off-season.</div>
          </>
        }
        onBack={() => go({ name: 'staff' })}
        help="A hire · B back"
        items={pool.map((member) => {
          const kind = roleOf(member).kind;
          const full = staffOfKind(f, kind).length >= slotsFor(kind);
          return {
            key: member.id,
            label: staffRow(member, full ? 'no free slot' : ''),
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
            <div>{staffRow(member)}</div>
            <div>{roleOf(member).blurb}</div>
            <div>
              {price > 0
                ? `Fire sale: selling his contract pays you ${money(price)}.`
                : 'Letting him go saves his salary from now on. It pays nothing, and he does not return to the pool.'}
            </div>
          </>
        }
        onBack={() => go({ name: 'staff' })}
        initialFocus={1}
        items={[
          {
            key: 'go',
            label: price > 0 ? `Sell his contract for ${money(price)}` : 'Let him go',
            onSelect: () => {
              const result = letGo(f, member.id);
              after(result.ok ? { ok: true, message: `${member.name} has left.${result.paid > 0 ? ` You were paid ${money(result.paid)}.` : ''}` } : result, { name: 'staff' });
            },
          },
          { key: 'keep', label: 'Keep him', onSelect: () => go({ name: 'staff' }) },
        ]}
      />
    );
  }

  if (screen.name === 'facilities') {
    return (
      <Menu
        key={screenKey}
        remember="facilities"
        title="Facilities"
        message={message}
        header={
          <>
            {cashLine}
            <div>
              Each has {MAX_FACILITY_LEVEL} levels. Building is paid at once; every level built costs upkeep each season (now {money(facilityUpkeep(f))}) and
              adds to your franchise value.
            </div>
          </>
        }
        onBack={home}
        help="A build the next level · B back"
        items={FACILITIES.map((facility) => {
          const level = facilityLevel(f, facility.id);
          const cost = buildCost(level);
          return {
            key: facility.id,
            label: (
              <span class="slot-row">
                <span class="slot-name">{facility.name}</span>
                <Dots filled={level} total={MAX_FACILITY_LEVEL} />
                <span>{cost === null ? 'top level' : `next level ${money(cost)}`}</span>
              </span>
            ),
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
    const next = nextTalentAt(mine.power);
    const power = Math.round(mascotPower(f) * 10) / 10;
    return (
      <Menu
        key={screenKey}
        title={`Mascot: ${f.mascot.name}`}
        message={message}
        header={
          <>
            <div>
              Power <b>{power}</b> · drops in for <b>{Math.round(dropInChance(mine.power) * 100)}%</b> of games · plays at <b>{mascotRating(mine.power)}</b>{' '}
              overall · costs {money(mascotRules.salary)} a season
            </div>
            <div>
              Before each game he may drop in and take a random dressed skater's place for that game. He never plays goal, earns no XP and never ages.
              Power comes from his costume, the mascot den and a promoter.
            </div>
            <div>{next === null ? 'He knows every talent.' : `He learns his next talent at power ${next}.`}</div>
            {cashLine}
          </>
        }
        onBack={home}
        items={[
          {
            key: 'costume',
            label: cost === null ? `Costume: level ${f.mascot.costume}, the top level` : `Upgrade his costume to level ${f.mascot.costume + 1} · ${money(cost)}`,
            detail: `Each costume level is ${mascotRules.costume.powerPerLevel} mascot power.`,
            disabled: cost === null || f.cash < cost,
            onSelect: () => {
              const result = upgradeCostume(f);
              after(result.ok ? { ok: true, message: `${f.mascot.name} has a new costume.` } : result);
            },
          },
          ...f.mascot.talents.map((id, i) => {
            const talent = talentInfo(id);
            const known = i < mine.talents.length;
            return {
              key: id,
              label: known ? <b>{talent.name}</b> : `${talent.name} (at power ${mascotRules.talentUnlockPower[i]})`,
              detail: talent.description,
              disabled: true,
            };
          }),
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
          label: <PlayerRow player={p} bump={bump(p.id)} note={dressed.has(p.id) ? '' : locked ? 'at home this season' : 'not dressed'} />,
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
    const order: Sort[] = ['overall', 'cost', 'position'];
    const cycle = (step: number): void => setSort(order[(order.indexOf(sort) + step + order.length) % order.length] as Sort);
    const unseen = hiddenFreeAgents(f);
    const pool = league.freeAgents
      .filter((id) => !unseen.has(id))
      .map((id) => playerOf(league, id))
      .sort((a, b) =>
        sort === 'cost'
          ? a.capHit - b.capHit || b.overall - a.overall
          : sort === 'position'
            ? a.position.localeCompare(b.position) || b.overall - a.overall
            : b.overall - a.overall || a.capHit - b.capHit,
      );
    return (
      <Menu
        key={screenKey}
        remember="freeAgents"
        title="Free agents"
        message={message}
        header={
          <>
            <div>
              <CapLine league={league} team={team} />
            </div>
            <div>Sorted by {sort === 'overall' ? 'best first' : sort === 'cost' ? 'cheapest first' : 'position'} (left and right change the order)</div>
            <div>
              {unseen.size > 0
                ? `Your scouts have not found ${unseen.size} more, the ones with the most room to grow. A scout or the scouting office brings them into view.`
                : 'Your scouts see the whole pool.'}{' '}
              Scouting points: {Math.round(scoutingPoints(f) * 10) / 10}.
            </div>
          </>
        }
        onBack={home}
        help="A sign · left/right sort · B back"
        items={pool.map((p) => {
          const allowed = canSign(league, team, p.id);
          return {
            key: p.id,
            label: <PlayerRow player={p} note={allowed.ok ? '' : 'cannot sign'} />,
            detail: (
              <>
                {scouted(p)}
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
        })}
      />
    );
  }

  if (screen.name === 'lineup') {
    const problems = lineupProblems(league, team);
    const slot = (line: 0 | 1, index: number): MenuItem => {
      const id = (line === 0 ? team.lineup.line1 : team.lineup.line2)[index] ?? null;
      const p = id ? playerOf(league, id) : null;
      const label = `Line ${line + 1} ${index === 0 ? 'centre' : 'wing'}`;
      return {
        key: `${line}-${index}`,
        label: (
          <span class="slot-row">
            <span class="slot-name">{label}</span>
            {p ? <PlayerRow player={p} bump={bump(p.id)} /> : <span class="warn">empty</span>}
          </span>
        ),
        detail: p ? <Ratings player={p} /> : undefined,
        onSelect: () => go({ name: 'pick', line, slot: index }),
      };
    };
    const goalie = team.lineup.goalie ? playerOf(league, team.lineup.goalie) : null;
    const spare = skatersOn(league, team).filter((p) => !dressedSkaters(team.lineup).includes(p.id));
    return (
      <Menu
        key={screenKey}
        remember="lineup"
        title="Lineup"
        message={message}
        header={
          <>
            <div>Two lines of three skaters and a goalie. The centre takes faceoffs.</div>
            {spare.length > 0 && (
              <div>
                {locked ? 'At home this season' : 'Not dressed'}: {spare.map((p) => p.name).join(', ')}
              </div>
            )}
            {problems.length > 0 && <div class="warn">{problems.join(' ')}</div>}
          </>
        }
        onBack={home}
        help="A change who plays there · B back"
        items={[
          slot(0, 0),
          slot(0, 1),
          slot(0, 2),
          slot(1, 0),
          slot(1, 1),
          slot(1, 2),
          {
            key: 'goalie',
            label: (
              <span class="slot-row">
                <span class="slot-name">Goalie</span>
                {goalie ? <PlayerRow player={goalie} bump={bump(goalie.id)} /> : <span class="warn">none: sign one from the free agents</span>}
              </span>
            ),
            detail: goalie ? <Ratings player={goalie} /> : undefined,
            disabled: true,
          },
          ...(locked
            ? []
            : [
                {
                  key: 'auto',
                  label: 'Auto-fill: best six skaters',
                  onSelect: () => {
                    team.lineup = autoLineup(league, team);
                    after({ ok: true, message: 'Lineup filled with your best six skaters.' });
                  },
                },
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
      return locked ? 'at home this season' : 'not dressed';
    };
    const choices = skatersOn(league, team).filter((p) => !locked || season.dressed.includes(p.id));
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
              playMatch({ home: homeTeam, away, homeColour: jerseyColour(f) }, (result) => {
                const verdict = result.winner === 0 ? 'won' : result.winner === 1 ? 'lost' : 'tied';
                setScreen({ name: 'home' });
                setMessage(`Exhibition: ${verdict} ${result.score[0]}-${result.score[1]} against ${opponent.name}.`);
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
            return {
              key: `slot-${slot}`,
              label: `${button}: ${id ? powerupInfo(id).name : 'empty'}`,
              detail: id ? powerupInfo(id).description : 'Nothing loaded on this button.',
              onSelect: () => go({ name: 'load', slot }),
            };
          }),
          ...[...counts.entries()].map(([id, count]) => {
            const p = powerupInfo(id);
            return { key: id, label: `${p.name}${count > 1 ? ` ×${count}` : ''}`, detail: p.description, disabled: true };
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
        onBack={home}
        items={[
          { key: 'none', label: 'Nothing', onSelect: () => after(setLoadout(f, screen.slot, null), { name: 'home' }) },
          ...distinct.map((id) => {
            const p = powerupInfo(id);
            const count = season.powerups.filter((x) => x === id).length;
            return {
              key: id,
              label: `${p.name}${count > 1 ? ` ×${count}` : ''}`,
              detail: p.description,
              onSelect: () => after(setLoadout(f, screen.slot, id), { name: 'home' }),
            };
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
          { key: 'new', label: 'Start a new franchise', onSelect: () => go({ name: 'confirmNew' }) },
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
          onSelect: () => {
            setScreen({ name: 'home' });
            setMessage('A new franchise has begun.');
            startOver();
          },
        },
        { key: 'no', label: 'No, keep playing', onSelect: () => go({ name: 'saves' }) },
      ]}
    />
  );
}
