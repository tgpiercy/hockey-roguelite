import { achieved, ACHIEVEMENTS, progress, unlockWords } from '../../core/achievements';
import { ArtifactCard } from '../screens/season';
import { charterInfo } from '../../core/charter';
import { points } from '../../core/standings';
import type { ComponentChildren } from 'preact';
import { scrap } from '../../core/gear';
import { playerOf, rosterOf, type Team } from '../../core/league';
import { canPrestige, prestige, unlockedJerseys } from '../../core/prestige';
import { trade } from '../../core/trades';
import { autoSpend, canGrow, spendPoint } from '../../core/xp';
import gearData from '../../data/gear.json';
import { Menu, type MenuItem } from '../Menu';
import { CapLine, money, PlayerRow, Ratings, OptionCard } from '../parts';
import type { AppCtx } from '../App';
import { everyArtifact, allEvents } from './shared';

/** The hub groups (team, front office, collection), skill points, feats and what has been found. */
export function groupPages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, message, together, group, shown, f, league, season, team, locked,
    screenKey, go, after, top, tile, earlyLock, cashLine,
  } = app;

  if (screen.name === 'skills') {
    const withPoints = rosterOf(league, team).filter((p) => (p.points ?? 0) > 0);
    return (
      <Menu
        key={screenKey}
        remember="skills"
        title="Skill points"
        message={message}
        header="Players who levelled up have points to spend. Put them where you like: what a player is good at decides what kind of player he is."
        onBack={() => go({ name: 'team' })}
        items={
          withPoints.length === 0
            ? [{ key: 'done', label: 'Every point is spent', onSelect: () => go({ name: 'team' }) }]
            : [
                ...withPoints.map((p) => ({
                  key: p.id,
                  label: <PlayerRow player={p} note={`${p.points} point${p.points === 1 ? '' : 's'}`} />,
                  detail: <Ratings player={p} />,
                  onSelect: () => go({ name: 'skill', playerId: p.id }),
                })),
                {
                  key: 'auto',
                  label: 'Spend them all automatically',
                  detail: 'Each point goes where his position values it most, as it did before you could choose.',
                  onSelect: () => {
                    for (const p of withPoints) autoSpend(p);
                    after({ ok: true, message: 'Every point was placed.' }, { name: 'team' });
                  },
                },
              ]
        }
      />
    );
  }

  if (screen.name === 'skill') {
    const p = playerOf(league, screen.playerId);
    const ratings = p.ratings as unknown as Record<string, number>;
    const names = gearData.ratingNames as Record<string, string>;
    const left = p.points ?? 0;
    return (
      <Menu
        key={screenKey}
        remember={`skill-${p.id}`}
        title={`${p.name}: ${left} point${left === 1 ? '' : 's'}`}
        message={message}
        header={
          <>
            <div>
              <PlayerRow player={p} />
            </div>
            <Ratings player={p} />
            {!canGrow(p) && <div class="warn">He has reached his ceiling and cannot get any better.</div>}
          </>
        }
        onBack={() => go({ name: 'skills' })}
        items={[
          ...Object.keys(ratings).map((key) => ({
            key,
            label: `${names[key] ?? key} ${ratings[key]} → ${Math.min(99, (ratings[key] as number) + 1)}`,
            disabled: left <= 0,
            onSelect: () => {
              const result = spendPoint(p, key);
              after(result.ok ? { ok: true, message: `${names[key] ?? key} is now ${ratings[key]}.` } : result, (p.points ?? 0) > 0 ? undefined : { name: 'skills' });
            },
          })),
          {
            key: 'auto',
            label: 'Place the rest automatically',
            disabled: left <= 0,
            onSelect: () => {
              autoSpend(p);
              after({ ok: true, message: `${p.name}'s points were placed.` }, { name: 'skills' });
            },
          },
        ]}
      />
    );
  }

  if (screen.name === 'team') {
    const pending = f.offseason.pending.length;
    const pointsToSpend = rosterOf(league, team).reduce((sum, p) => sum + (p.points ?? 0), 0);
    return (
      <Menu
        key={screenKey}
        remember="group-team"
        title="Team"
        message={message}
        header={
          <>
            <CapLine league={league} team={team} />
            {team.deadCap ? <div>Dead cap this season: {money(team.deadCap)}.</div> : null}
          </>
        }
        onBack={top}
        items={[
          ...(pending > 0 ? [tile('contracts', 'Contracts', `${pending} to decide`, () => go({ name: 'contracts' }), { badge: pending, primary: true })] : []),
          ...(pointsToSpend > 0 ? [tile('skills', 'Skill points', `${pointsToSpend} to spend`, () => go({ name: 'skills' }), { badge: pointsToSpend, icon: 'roster' })] : []),
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

  if (screen.name === 'feats') {
    return (
      <Menu
        key={screenKey}
        title="Feats"
        header={<div class="note">{(f.feats ?? []).length} of {ACHIEVEMENTS.length} done. A feat is done once and what it opens stays open, whatever happens to the club after.</div>}
        onBack={() => go({ name: 'collection' })}
        help="B back"
        items={ACHIEVEMENTS.map((a): MenuItem => {
          const done = achieved(f, a.id);
          const at = progress(f, a);
          return {
            key: a.id,
            label: (
              <span class={`found-row${done ? '' : ' unfound'}`}>
                <OptionCard icon={a.unlock.kind === 'jersey' ? 'jersey' : a.unlock.kind === 'charter' ? 'charter' : 'powerups'} name={a.name} value={a.text} {...(a.n > 1 ? { pips: { filled: Math.round((at / a.n) * Math.min(a.n, 6)), total: Math.min(a.n, 6) } } : {})} />
                {done && <i class="found-mark">Done</i>}
              </span>
            ),
            detail: `${a.text} Opens ${unlockWords(a, (id) => charterInfo(id).name)}.${done ? ' Done.' : a.n > 1 ? ` So far: ${at} of ${a.n}.` : ''}`,
          };
        })}
      />
    );
  }

  if (screen.name === 'found') {
    const seen = new Set(f.seen?.artifacts ?? []);
    const events = (f.seen?.events ?? []).length;
    return (
      <Menu
        key={screenKey}
        title="Found so far"
        header={
          <div class="note">
            {seen.size} of {everyArtifact.length} artifacts held at least once, and {events} of {allEvents.length} events met. Ones you have not had come up three times as often. A mark shows the most handicap points you have won a title with
            while holding an artifact.
          </div>
        }
        onBack={() => go({ name: 'collection' })}
        help="B back"
        items={everyArtifact.map((a): MenuItem => {
          const has = seen.has(a.id);
          const won = f.wonWith?.[a.id];
          return {
            key: a.id,
            label: (
              <span class={`found-row${has ? '' : ' unfound'}`}>
                {has ? <ArtifactCard name={a.name} description={a.description} modifiers={a.modifiers} /> : <ArtifactCard name="Not found yet" description="" modifiers={a.modifiers} />}
                {won !== undefined && <i class="found-mark">Title{won > 0 ? ` · ${won}` : ''}</i>}
              </span>
            ),
            detail: has ? `${a.description}${a.recipe ? ' Made by holding two others together.' : ''}${won !== undefined ? ` You have won a title holding it${won > 0 ? `, with ${won} handicap ${won === 1 ? 'point' : 'points'}` : ''}.` : ''}` : 'You have not held this one yet. Its family is shown; the rest is for you to find.',
          };
        })}
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
          tile('gear', 'Gear', `${f.gear.length} pieces`, () => go({ name: 'gear' }), { detail: 'Equip, level up, or sell for scrap for tape.' }),
          ...(locked
            ? [
                tile('powerups', 'Powerups', `${season.powerups.length} in the bag`, () => go({ name: 'powerups' }), {
                  detail: 'Choose what LT and RB trigger in a game. Powerups are used up, and any left over are lost when the season ends.',
                }),
              ]
            : []),
          tile('artifacts', 'Artifacts', `${f.artifacts.length} held this season`, () => go({ name: 'artifacts' }), { detail: 'The artifacts you hold this season.' }),
          tile('feats', 'Feats', `${(f.feats ?? []).length} of ${ACHIEVEMENTS.length} done`, () => go({ name: 'feats' }), {
            icon: 'prestige',
            detail: 'Things done once in the life of your club. Each opens something for good: a jersey, a charter, or a wider choice of powerup.',
          }),
          tile('found', 'Found so far', `${(f.seen?.artifacts ?? []).length} of ${everyArtifact.length} artifacts`, () => go({ name: 'found' }), {
            icon: 'artifacts',
            detail: 'Every artifact there is, found or not, and the hardest title you have won while holding each.',
          }),
          tile('jersey', 'Jersey', unlockedJerseys(f)[f.prestige.jersey]?.name ?? '', () => go({ name: 'jersey' }), { detail: 'The colour your team wears on the ice.' }),
        ]}
      />
    );
  }

  return undefined;
}
