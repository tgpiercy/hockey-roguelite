import type { ComponentChildren } from 'preact';
import { teamStrength } from '../../core/bosses';
import { teamCrest } from '../../core/crest';
import { playerOf, rosterOf, teamOf } from '../../core/league';
import { decideContract, resignCapHit } from '../../core/offseason';
import { canPrestige, leagueName, prestige, prestigeEffects, setJersey, unlockedJerseys } from '../../core/prestige';
import { type MoveResult } from '../../core/roster';
import { evaluateTrade, trade } from '../../core/trades';
import offseasonRules from '../../data/offseason.json';
import prestigeRules from '../../data/prestige.json';
import { CrestBadge } from '../Crest';
import { PrestigeLadder, TradeOffer } from '../screens/club';
import { ChangeRow } from '../screens/season';
import { SeasonScene } from '../Scene';
import { Menu, type MenuItem } from '../Menu';
import { retired } from '../../game/hints';
import { CapLine, Grade, money, PlayerRow, Ratings } from '../parts';
import type { AppCtx } from '../App';
import { count } from './shared';

/** Between seasons: the report, contracts, trades, prestige and the jersey. */
export function offseasonPages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, message, setMessage, f, league, season, team, screenKey, go, after,
    home, tile, wearing, scouted,
  } = app;

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
      after({ ok: true, message: left > 0 ? note : `${note} You have first pick of the free agents: the other teams make their moves when you start the season.` }, { name: left > 0 ? 'contracts' : 'report' });
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
              He was paid {money(p.capHit)}. A one-season contract is <b>{money(cost)}</b>, and the price stays fixed until it runs out.
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
            label: `Re-sign for ${years} season${years === 1 ? '' : 's'} · ${money(resignCapHit(p, f, years))} a season`,
            detail: `${p.age + years > 30 ? `He will be ${p.age + years} when it ends. Players slow down from 31.` : `He will be ${p.age + years} when it ends.`} ${p.age <= offseasonRules.contract.youngMaxAge ? 'He is still improving, so each extra year costs more: you are buying his better seasons at a set price.' : p.age >= offseasonRules.contract.oldMinAge ? 'He is past his peak, so each extra year costs less: he takes security over pay, and you carry the risk of his decline.' : 'In his prime: the price is the same for any length.'}`,
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
            {allowed && <SeasonScene kind="up" crest={teamCrest(team.name)} words={`Up to ${leagueName(next)}`} />}
            <PrestigeLadder level={f.prestige.level} />
            <div class="note">Climbing a level keeps your roster, contracts, gear and every player's level. It costs you your {f.artifacts.length} artifact{f.artifacts.length === 1 ? '' : 's'}, and cannot be undone.</div>
          </>
        }
        onBack={home}
        initialFocus={1}
        items={[
          tile('yes', allowed.ok ? `Climb to level ${next}` : 'Cannot climb yet', allowed.ok ? 'Give up your artifacts' : allowed.reason, () => {
            const result = prestige(f);
            after(result.ok ? { ok: true, message: `You go up to ${leagueName(next)}. Prestige level ${next}; a new jersey colour is unlocked.` } : result, { name: 'jersey' });
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

  return undefined;
}
