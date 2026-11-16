import { opened } from '../../core/opening';
import { kindName as tacticKindName, nextTactic, readTactics, TACTIC_KINDS, tacticInfo } from '../../sim/tactics';
import { points } from '../../core/standings';
import leagueRules from '../../data/league.json';
import type { ComponentChildren } from 'preact';
import { sortPlayers, wouldReplace, type PositionFilter } from '../../core/compare';
import { playerSalePrice } from '../../core/economy';
import { releasePlayer } from '../../core/gear';
import { playerOf, rosterOf, skatersOn, type Team } from '../../core/league';
import { autoLineup, dressedSkaters, lineupProblems } from '../../core/lineup';
import { decideContract } from '../../core/offseason';
import { canSign, deadCapFor } from '../../core/roster';
import { hiddenFreeAgents, potentialText, scoutingPoints, signPlayer } from '../../core/scouting';
import { setSeasonLineupSlot } from '../../core/season';
import { GearedRatings } from '../gearParts';
import { Compare } from '../screens/club';
import { Menu, type MenuItem } from '../Menu';
import type { PlayerRecord } from '../../core/player';
import { CapLine, Face, Grade, money, PlayerRow, Ratings, OptionCard } from '../parts';
import type { AppCtx } from '../App';
import { type Sort } from './shared';

/** The roster, free agents and the lineup. */
export function rosterPages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, message, sort, setSort, faPosition, setFaPosition, joined, plan, f, league,
    season, team, locked, screenKey, go, after, home, tile, bump, fireSale,
  } = app;

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
          label: <PlayerRow player={p} bump={bump(p.id)} note={dressed.has(p.id) ? '' : locked ? 'spare' : 'sitting'} />,
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
            {!fireSale && deadCapFor(league, p.id) > 0 && (
              <div class="warn">He is under contract: {money(deadCapFor(league, p.id))} stays on your cap as dead money until the end of the coming season.</div>
            )}
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
            <div>
              {([0, 1] as const).map((line) => {
                const three = (line === 0 ? team.lineup.line1 : team.lineup.line2).filter((id): id is string => id !== null).map((id) => playerOf(league, id));
                const on = three.some((x) => x.position === 'F') && three.some((x) => x.position === 'D');
                return (
                  <span key={line} class={on ? 'up' : 'warn'}>
                    Line {line + 1}: {on ? 'balanced' : 'no bonus'}
                    {line === 0 ? ' · ' : ''}
                  </span>
                );
              })}
              <span class="dim"> · {leagueRules.lineBonus.description}</span>
            </div>
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
          ...(opened(f, 'tactics') ? TACTIC_KINDS : []).map((kind): MenuItem => {
            const plan = readTactics(team.lineup.tactics);
            return {
              key: `tactic-${kind}`,
              label: <OptionCard icon={kind === 'forecheck' ? 'forecheck' : kind === 'attack' ? 'game' : 'defence'} name={tacticKindName(kind)} value={tacticInfo(kind, plan[kind]).name} />,
              detail: `${tacticInfo(kind, plan[kind]).describe} Press to change. This tells your linemates how to play; the skater you control does what you tell him.`,
              onSelect: () => {
                team.lineup.tactics = nextTactic(plan, kind);
                after({ ok: true, message: `${tacticKindName(kind)}: ${tacticInfo(kind, team.lineup.tactics[kind]).name}.` });
              },
            };
          }),
          ...(opened(f, 'tactics') ? [{
            key: 'shift',
            wide: true,
            label: <OptionCard icon="shifts" name="Shifts" value={team.lineup.heavy === undefined ? 'Even' : `Line ${team.lineup.heavy + 1} plays more`} chip="Change" />,
            detail: 'Press to change. The line that plays more stays on until it is more tired, and the other line comes off sooner. Put your best three on it.',
            onSelect: () => {
              if (team.lineup.heavy === undefined) team.lineup.heavy = 0;
              else if (team.lineup.heavy === 0) team.lineup.heavy = 1;
              else delete team.lineup.heavy;
              after({ ok: true, message: team.lineup.heavy === undefined ? 'Even shifts.' : `Line ${team.lineup.heavy + 1} will play more.` });
            },
          }] as MenuItem[] : []),
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
      return locked ? 'spare' : 'sitting';
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

  return undefined;
}
