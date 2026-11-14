import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { generateLeague } from '../core/generate';
import { goaliesOn, playerOf, rosterOf, skatersOn, userTeam, type League, type Team } from '../core/league';
import { autoLineup, dressedSkaters, lineupProblems, setLineupSlot } from '../core/lineup';
import { applyResult, dress } from '../core/matchup';
import type { PlayerRecord } from '../core/player';
import { canPlay, canSign, capSpace, payroll, release, sign } from '../core/roster';
import { emptyRecord, fromSave, parseSave, toSave, type SaveFile, type TeamRecord } from '../core/save';
import rules from '../data/league.json';
import type { GoalieRatings, SkaterRatings } from '../sim/ratings';
import { Menu, type MenuItem } from './Menu';
import { menuInput } from './menuInput';
import { playMatch } from './matchView';
import { downloadText, loadStored, pickTextFile, store } from './storage';

type Screen =
  | { name: 'hub' }
  | { name: 'roster' }
  | { name: 'release'; playerId: string }
  | { name: 'freeAgents' }
  | { name: 'lineup' }
  | { name: 'pick'; line: 0 | 1; slot: number }
  | { name: 'play' }
  | { name: 'saves' }
  | { name: 'confirmNew' };

type Sort = 'overall' | 'cost' | 'position';

const money = (dollars: number): string => `$${(dollars / 1_000_000).toFixed(2)}M`;

function Grade({ player }: { player: PlayerRecord }) {
  return <span class={`grade grade-${player.grade.replace('+', 'plus')}`}>{player.grade}</span>;
}

/** One player as a row: grade, overall, name, position, age, cap hit, years. */
function PlayerRow({ player, note }: { player: PlayerRecord; note?: string }) {
  return (
    <span class="player-row">
      <Grade player={player} />
      <span class="ovr">{player.overall}</span>
      <span class="pname">{player.name}</span>
      <span class="pos">{player.position}</span>
      <span class="age">{player.age}y</span>
      <span class="cap">{money(player.capHit)}</span>
      <span class="years">{player.contractYears}y</span>
      {note && <span class="note">{note}</span>}
    </span>
  );
}

/** A player's individual ratings, shown under the list for whoever is focused. */
function Ratings({ player }: { player: PlayerRecord }) {
  const pairs: [string, number][] =
    player.position === 'G'
      ? (() => {
          const r = player.ratings as GoalieRatings;
          return [
            ['Reflexes', r.reflexes],
            ['Positioning', r.positioning],
            ['Rebounds', r.reboundControl],
            ['Stamina', r.stamina],
          ];
        })()
      : (() => {
          const r = player.ratings as SkaterRatings;
          return [
            ['Shooting', r.shooting],
            ['Passing', r.passing],
            ['Speed', r.speed],
            ['Checking', r.checking],
            ['Puck control', r.puckControl],
            ['Stamina', r.stamina],
          ];
        })();
  return (
    <span class="ratings">
      {pairs.map(([label, value]) => (
        <span key={label}>
          {label} <b>{value}</b>
        </span>
      ))}
    </span>
  );
}

function CapLine({ league, team }: { league: League; team: Team }) {
  return (
    <span>
      Cap {money(payroll(league, team))} of {money(rules.cap)} · space <b>{money(capSpace(league, team))}</b> · {skatersOn(league, team).length}/
      {rules.rosterSkaters} skaters, {goaliesOn(league, team).length}/{rules.rosterGoalies} goalie
    </span>
  );
}

const teamStrength = (league: League, team: Team): number => {
  const roster = rosterOf(league, team);
  return Math.round(roster.reduce((sum, p) => sum + p.overall, 0) / Math.max(1, roster.length));
};

/** The whole menu side of the game: hub, roster, free agents, lineup, play and saves. */
export function App() {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const saveRef = useRef<SaveFile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'hub' });
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState<Sort>('overall');
  const [playing, setPlaying] = useState(false);

  /** Keeps the current league and record, writes them to storage and redraws. */
  const commit = (league: League, record: TeamRecord): void => {
    saveRef.current = toSave(league, record, new Date().toISOString());
    store(saveRef.current).catch(() => setMessage('Could not save: storage is unavailable in this browser.'));
    redraw(0);
  };
  const newFranchise = (): void => commit(generateLeague(String(Date.now())), emptyRecord());

  // On start: load the stored franchise, or begin a new one.
  useEffect(() => {
    loadStored()
      .then((raw) => {
        const loaded = raw === null ? null : fromSave(raw);
        if (loaded && loaded.ok) {
          saveRef.current = loaded.save;
          redraw(0);
        } else {
          newFranchise();
          if (loaded && !loaded.ok) setMessage(`${loaded.reason} A new franchise was started.`);
        }
      })
      .catch(() => {
        newFranchise();
        setMessage('Storage is unavailable in this browser, so progress will not be kept.');
      });
  }, []);

  useEffect(() => {
    document.body.className = playing ? 'mode-rink' : 'mode-menu';
    if (playing) menuInput.stop();
    else menuInput.start();
  }, [playing]);

  const save = saveRef.current;
  if (!save || playing) return null;
  const { league, record } = save;
  const team = userTeam(league);
  // A new screen is a new list: its focus starts afresh.
  const screenKey = JSON.stringify(screen);
  const go = (next: Screen, note = ''): void => {
    setMessage(note);
    setScreen(next);
  };
  const changed = (note = ''): void => {
    setMessage(note);
    commit(league, record);
  };

  if (screen.name === 'hub') {
    const ready = canPlay(league, team);
    return (
      <Menu
        key={screenKey}
        title={team.name}
        remember="hub"
        message={message}
        header={
          <>
            <div>
              Record {record.wins}-{record.losses}-{record.overtimeLosses} (wins, losses, overtime losses) · Season {league.season}
            </div>
            <div>
              <CapLine league={league} team={team} />
            </div>
            {!ready.ok && <div class="warn">Cannot play yet: {ready.reason}</div>}
          </>
        }
        items={[
          { key: 'play', label: 'Play a game', onSelect: () => go({ name: 'play' }), disabled: !ready.ok },
          { key: 'roster', label: 'Roster', onSelect: () => go({ name: 'roster' }) },
          { key: 'lineup', label: 'Lineup', onSelect: () => go({ name: 'lineup' }) },
          { key: 'fa', label: 'Free agents', onSelect: () => go({ name: 'freeAgents' }) },
          { key: 'saves', label: 'Save and load', onSelect: () => go({ name: 'saves' }) },
        ]}
      />
    );
  }

  if (screen.name === 'roster') {
    const dressed = new Set([...dressedSkaters(team.lineup), team.lineup.goalie]);
    const players = rosterOf(league, team);
    return (
      <Menu
        key={screenKey}
        title="Roster"
        remember="roster"
        message={message}
        header={<CapLine league={league} team={team} />}
        onBack={() => go({ name: 'hub' })}
        help="A release · B back"
        items={players.map((p) => ({
          key: p.id,
          label: <PlayerRow player={p} note={dressed.has(p.id) ? '' : 'not dressed'} />,
          detail: <Ratings player={p} />,
          onSelect: () => go({ name: 'release', playerId: p.id }),
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
              release(league, team, p.id);
              setScreen({ name: 'roster' });
              changed(`${p.name} was released.`);
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
        title="Free agents"
        remember="freeAgents"
        message={message}
        header={
          <>
            <div>
              <CapLine league={league} team={team} />
            </div>
            <div>Sorted by {sort === 'overall' ? 'best first' : sort === 'cost' ? 'cheapest first' : 'position'} (left and right change the order)</div>
          </>
        }
        onBack={() => go({ name: 'hub' })}
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
              changed(result.ok ? `${p.name} signed for ${money(p.capHit)}.${note}` : result.reason);
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
            {p ? <PlayerRow player={p} /> : <span class="warn">empty</span>}
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
        title="Lineup"
        remember="lineup"
        message={message}
        header={
          <>
            <div>Two lines of three skaters and a goalie. The centre takes faceoffs.</div>
            {spare.length > 0 && <div>Not dressed: {spare.map((p) => p.name).join(', ')}</div>}
            {problems.length > 0 && <div class="warn">{problems.join(' ')}</div>}
          </>
        }
        onBack={() => go({ name: 'hub' })}
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
                {goalie ? <PlayerRow player={goalie} /> : <span class="warn">none: sign one from the free agents</span>}
              </span>
            ),
            detail: goalie ? <Ratings player={goalie} /> : undefined,
            disabled: true,
          },
          {
            key: 'auto',
            label: 'Auto-fill: best six skaters',
            onSelect: () => {
              team.lineup = autoLineup(league, team);
              changed('Lineup filled with your best six skaters.');
            },
          },
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
      return 'not dressed';
    };
    return (
      <Menu
        key={screenKey}
        title={`Line ${screen.line + 1} ${screen.slot === 0 ? 'centre' : 'wing'}: who plays here?`}
        header="Picking someone already dressed swaps the two."
        onBack={() => go({ name: 'lineup' })}
        items={skatersOn(league, team).map((p) => ({
          key: p.id,
          label: <PlayerRow player={p} note={where(p.id)} />,
          detail: <Ratings player={p} />,
          onSelect: () => {
            setLineupSlot(league, team, screen.line, screen.slot, p.id);
            setScreen({ name: 'lineup' });
            changed();
          },
        }))}
      />
    );
  }

  if (screen.name === 'play') {
    const mine = teamStrength(league, team);
    const opponents = league.teams.filter((t) => t.id !== league.userTeamId).sort((a, b) => teamStrength(league, a) - teamStrength(league, b));
    return (
      <Menu
        key={screenKey}
        title="Play a game: choose an opponent"
        remember="play"
        header={`Your team averages ${mine} overall. Weakest opponents first.`}
        onBack={() => go({ name: 'hub' })}
        items={opponents.map((opponent) => {
          const best = rosterOf(league, opponent)[0];
          return {
            key: opponent.id,
            label: (
              <span class="team-row">
                <span class="tname">{opponent.name}</span>
                <span>average {teamStrength(league, opponent)}</span>
                {best && (
                  <span>
                    best: <Grade player={best} /> {best.name}
                  </span>
                )}
              </span>
            ),
            onSelect: () => {
              const home = dress(league, team);
              const away = dress(league, opponent);
              if (!home || !away) return;
              setPlaying(true);
              playMatch(home, away, (result) => {
                const verdict = result.winner === 0 ? 'Won' : result.winner === 1 ? 'Lost' : 'Tied';
                setScreen({ name: 'hub' });
                setMessage(`${verdict} ${result.score[0]}-${result.score[1]} against ${opponent.name}${result.overtime ? ' in overtime' : ''}.`);
                commit(league, applyResult(record, result));
                setPlaying(false);
              });
            },
          };
        })}
      />
    );
  }

  if (screen.name === 'saves') {
    return (
      <Menu
        key={screenKey}
        title="Save and load"
        remember="saves"
        message={message}
        header="The game saves by itself after every roster move, lineup change and game."
        onBack={() => go({ name: 'hub' })}
        items={[
          {
            key: 'export',
            label: 'Export the save to a file',
            onSelect: () => {
              downloadText('hockey-save.json', `${JSON.stringify(save, null, 2)}\n`);
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
                setScreen({ name: 'hub' });
                setMessage('Save imported.');
                commit(loaded.save.league, loaded.save.record);
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
      header="Your current team, record and league are replaced. Export the save first if you want to keep them."
      onBack={() => go({ name: 'saves' })}
      initialFocus={1}
      items={[
        {
          key: 'yes',
          label: 'Yes, start again',
          onSelect: () => {
            setScreen({ name: 'hub' });
            setMessage('A new franchise has begun.');
            newFranchise();
          },
        },
        { key: 'no', label: 'No, keep playing', onSelect: () => go({ name: 'saves' }) },
      ]}
    />
  );
}
