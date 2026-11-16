import { paperLines, paperName } from '../../core/voice';
import { clubRecords, leagueNews } from '../../core/chronicle';
import { gamesPlayed, placeOf, points, ranked, type Row } from '../../core/standings';
import type { ComponentChildren } from 'preact';
import { teamStrength } from '../../core/bosses';
import { teamOf, type Team } from '../../core/league';
import { Menu } from '../Menu';
import type { AppCtx } from '../App';
import { count, ordinal } from './shared';

/** The league: standings, news and the trophy room. */
export function leaguePages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, message, group, f, league, season, team, screenKey, go, top,
    tile,
  } = app;

  // ---------------------------------------------------------------- hub groups

  if (screen.name === 'league') {
    const table = season.standings;
    return (
      <Menu
        key={screenKey}
        remember="group-league"
        title="League"
        message={message}
        header={
          table
            ? `${team.name}: ${ordinal(placeOf(table, league.userTeamId))} of ${league.teams.length}. The top three of the other teams join you in the playoffs if you clear the map.`
            : 'The league keeps a table from the start of each season.'
        }
        onBack={top}
        items={[
          tile('standings', 'Standings', table ? 'The table, and who is in the playoff places' : 'Starts with the season', () => go({ name: 'standings' }), { lock: table ? undefined : 'The table starts when the season does.' }),
          tile('news', 'News', table ? (leagueNews(f)[0] ?? 'Nothing yet') : 'Starts with the season', () => go({ name: 'news' }), { lock: table ? undefined : 'The news starts when the season does.' }),
          tile('trophies', 'Trophy room', `${count((f.history ?? []).filter((x) => x.outcome === 'champion').length, 'championship')} · ${count((f.history ?? []).length, 'season')}`, () => go({ name: 'trophies' })),
        ]}
      />
    );
  }

  if (screen.name === 'news') {
    const lines = leagueNews(f);
    return (
      <Menu
        key={screenKey}
        title="The paper"
        message={message}
        header={
          <div class="news">
            <div class="masthead">{paperName(team.name)}</div>
            {paperLines(f).map((text) => (
              <div key={text} class="news-item lead">
                {text}
              </div>
            ))}
            {lines.length === 0 ? <div class="news-item">Nothing more from round the league yet.</div> : lines.map((text, i) => (
              <div key={i} class="news-item">
                {text}
              </div>
            ))}
          </div>
        }
        stack
        onBack={() => go({ name: 'league' })}
        items={[{ key: 'back', label: 'Back', onSelect: () => go({ name: 'league' }) }]}
      />
    );
  }

  if (screen.name === 'trophies') {
    const records = clubRecords(f);
    const past = [...(f.history ?? [])].reverse();
    const finish = (s: { outcome: string }): string => (s.outcome === 'champion' ? 'Champions' : s.outcome === 'eliminated' ? 'Lost in the playoffs' : s.outcome === 'abandoned' ? 'Abandoned' : 'Struck out on the map');
    return (
      <Menu
        key={screenKey}
        remember="trophies"
        title="Trophy room"
        message={message}
        header={
          <>
            {records.map((line) => (
              <div key={line.label}>
                {line.label}: <b>{line.value}</b>
              </div>
            ))}
            {(f.promotions ?? []).map((p) => (
              <div key={p.season}>
                After season {p.season}: up to <b>{p.league}</b>
              </div>
            ))}
            {(f.greats ?? []).length > 0 && (
              <div class="news">
                <i>Retired greats</i>
                {(f.greats ?? []).map((text, i) => (
                  <div key={i} class="news-item">
                    {text}
                  </div>
                ))}
              </div>
            )}
          </>
        }
        onBack={() => go({ name: 'league' })}
        items={
          past.length === 0
            ? [{ key: 'none', label: 'No season finished yet', onSelect: () => go({ name: 'league' }) }]
            : past.map((s) => ({
                key: `s${s.season}`,
                label: `Season ${s.season}: ${finish(s)} · ${s.wins}-${s.losses}${s.place !== null ? ` · ${ordinal(s.place)} in the table` : ''}${s.cup ? ' · Cup winners' : ''}${s.coop ? ' · two players' : ''}`,
                detail: `${s.topScorer ? `Top scorer: ${s.topScorer.name}, ${s.topScorer.goals} goals. ` : ''}${s.awards.length > 0 ? `Awards: ${s.awards.join(', ')}.` : 'No awards.'}`,
                onSelect: () => undefined,
              }))
        }
      />
    );
  }

  if (screen.name === 'standings') {
    const table = season.standings ?? {};
    const order = ranked(table);
    const inPlaces = new Set(order.filter((id) => id !== league.userTeamId).slice(0, 3));
    return (
      <Menu
        key={screenKey}
        remember="standings"
        title="Standings"
        message={message}
        header={
          <>
            <div class="table-row table-head">
              <span>#</span>
              <span>Team</span>
              <span>GP</span>
              <span>W</span>
              <span>L</span>
              <span>OTL</span>
              <span>GF</span>
              <span>GA</span>
              <span>PTS</span>
              <span>Run</span>
            </div>
            <div class="note">A win is 2 points, an overtime loss 1. Teams marked P hold the three playoff places beside yours.</div>
          </>
        }
        stack
        onBack={() => go({ name: 'league' })}
        items={order.map((id, i) => {
          const row = table[id] as Row;
          const mine = id === league.userTeamId;
          return {
            key: id,
            label: (
              <span class={`table-row${mine ? ' mine' : ''}`}>
                <span>{i + 1}</span>
                <span class="table-team">
                  {teamOf(league, id).name}
                  {inPlaces.has(id) ? ' · P' : ''}
                </span>
                <span>{gamesPlayed(row)}</span>
                <span>{row.wins}</span>
                <span>{row.losses}</span>
                <span>{row.overtimeLosses}</span>
                <span>{row.goalsFor}</span>
                <span>{row.goalsAgainst}</span>
                <b>{points(row)}</b>
                <span class={row.streak > 0 ? 'up' : row.streak < 0 ? 'warn' : ''}>{row.streak > 0 ? `W${row.streak}` : row.streak < 0 ? `L${-row.streak}` : '-'}</span>
              </span>
            ),
            detail: mine ? 'Your team.' : `${teamOf(league, id).name}: strength ${Math.round(teamStrength(league, id))}.`,
            onSelect: () => undefined,
          };
        })}
      />
    );
  }

  return undefined;
}
