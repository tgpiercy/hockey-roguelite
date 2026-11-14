import type { ComponentChildren } from 'preact';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { bossInfo, teamStrength } from '../core/bosses';
import { generateLeague } from '../core/generate';
import { playerOf, rosterOf, skatersOn, userTeam, type Team } from '../core/league';
import { autoLineup, dressedSkaters, lineupProblems } from '../core/lineup';
import { dress } from '../core/matchup';
import { canPlay, canSign, release, sign } from '../core/roster';
import { franchiseOf, fromSave, parseSave, toSave } from '../core/save';
import {
  artifactInfo,
  availableStops,
  buy,
  chooseEvent,
  currentStop,
  endSeason,
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
import rules from '../data/season.json';
import { Menu, type MenuItem } from './Menu';
import { menuInput } from './menuInput';
import { playMatch } from './matchView';
import { CapLine, Dots, Grade, money, PlayerRow, Ratings } from './parts';
import { downloadText, loadStored, pickTextFile, store } from './storage';

type Screen =
  | { name: 'home' }
  | { name: 'roster' }
  | { name: 'release'; playerId: string }
  | { name: 'freeAgents' }
  | { name: 'lineup' }
  | { name: 'pick'; line: 0 | 1; slot: number }
  | { name: 'exhibition' }
  | { name: 'powerups' }
  | { name: 'load'; slot: number }
  | { name: 'artifacts' }
  | { name: 'saves' }
  | { name: 'confirmNew' };

type Sort = 'overall' | 'cost' | 'position';
const BUTTONS = ['LT', 'RB'];

/** The whole menu side of the game: the off-season hub, the season map and its stops, and the team screens. */
export function App() {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const ref = useRef<Franchise | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState<Sort>('overall');
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
  const after = (result: ActionResult, next?: Screen): void => {
    setMessage(result.ok ? result.message : result.reason);
    if (next && result.ok) setScreen(next);
    commit(f);
  };
  const home = (): void => go({ name: 'home' });
  const bump = (id: string): number => season.bumps[id] ?? 0;

  /** Plays the game waiting at the current stop or playoff round. */
  const playSeasonGame = (): void => {
    const game = matchup(f);
    if (!game) return;
    setPlaying(true);
    playMatch({ home: game.home, away: game.away, level: game.level, powerups: game.powerups }, (result) => {
      const outcome = recordGame(f, result);
      setScreen({ name: 'home' });
      setMessage(outcome.ok ? outcome.message : outcome.reason);
      commit(f);
      setPlaying(false);
    });
  };

  const teamItems = (): MenuItem[] => [
    { key: 'roster', label: 'Team', onSelect: () => go({ name: 'roster' }) },
    { key: 'lineup', label: 'Lineup', onSelect: () => go({ name: 'lineup' }) },
    { key: 'powerups', label: `Powerups (${season.powerups.length})`, onSelect: () => go({ name: 'powerups' }) },
    { key: 'artifacts', label: `Artifacts (${f.artifacts.length})`, onSelect: () => go({ name: 'artifacts' }) },
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
              {!ready.ok && <div class="warn">Cannot play yet: {ready.reason}</div>}
            </>
          }
          items={[
            {
              key: 'start',
              label: 'Start the season',
              detail: 'Your dressed lineup is locked in for the whole season. The seventh skater stays home.',
              disabled: !ready.ok,
              onSelect: () => after(startSeason(f)),
            },
            { key: 'roster', label: 'Roster', onSelect: () => go({ name: 'roster' }) },
            { key: 'lineup', label: 'Lineup', onSelect: () => go({ name: 'lineup' }) },
            { key: 'fa', label: 'Free agents', onSelect: () => go({ name: 'freeAgents' }) },
            { key: 'artifacts', label: `Artifacts (${f.artifacts.length})`, onSelect: () => go({ name: 'artifacts' }) },
            {
              key: 'exhibition',
              label: 'Exhibition game',
              detail: 'A one-off game against any team. It does not count.',
              disabled: !ready.ok,
              onSelect: () => go({ name: 'exhibition' }),
            },
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
            </>
          }
          items={[
            { key: 'next', label: 'Continue to the off-season', onSelect: () => after(endSeason(f)) },
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
        help={locked ? 'B back' : 'A release · B back'}
        items={rosterOf(league, team).map((p) => ({
          key: p.id,
          label: <PlayerRow player={p} bump={bump(p.id)} note={dressed.has(p.id) ? '' : locked ? 'at home this season' : 'not dressed'} />,
          detail: <Ratings player={p} />,
          onSelect: locked ? undefined : () => go({ name: 'release', playerId: p.id }),
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
            <div>He goes to the free-agent pool and {money(p.capHit)} comes off your cap.</div>
          </>
        }
        onBack={() => go({ name: 'roster' })}
        initialFocus={1}
        items={[
          {
            key: 'yes',
            label: 'Release him',
            onSelect: () => {
              const result = release(league, team, p.id);
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
    const pool = league.freeAgents
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
                <Ratings player={p} />
                {!allowed.ok && <div class="warn">{allowed.reason}</div>}
              </>
            ),
            onLeft: () => cycle(-1),
            onRight: () => cycle(1),
            onSelect: () => {
              const result = sign(league, team, p.id);
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
              playMatch({ home: homeTeam, away }, (result) => {
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
