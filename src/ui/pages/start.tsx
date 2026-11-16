import { progress } from '../../core/achievements';
import { currentScreenPlan } from '../fullscreen';
import { betterResult, claimWeekly, resultLine, weeklyOver, weeklyResult } from '../../core/weekly';
import { loadWeeklyBest, saveWeeklyBest } from '../prefs';
import type { ComponentChildren } from 'preact';
import { difficultyInfo, type Franchise } from '../../core/season';
import rules from '../../data/season.json';
import gameInfo from '../../data/game.json';
import { CrestBadge } from '../Crest';
import { Menu } from '../Menu';
import type { AppCtx } from '../App';
import { type Screen } from './shared';

/** A finished weekly run, and the title screen. */
export function startPages(app: AppCtx): ComponentChildren | undefined {
  const {
    firstRun, screen, message, mainRef, f, league, season, team, locked, myCrest, go,
    weeklyOn, enterWeekly, leaveWeekly, home,
  } = app;

  // ---------------------------------------------------------------- a finished weekly run

  if (weeklyOn && weeklyOver(f)) {
    const result = weeklyResult(f);
    const best = betterResult(loadWeeklyBest(), result);
    saveWeeklyBest(best);
    const main = mainRef.current as Franchise;
    const prize = result.won && main.weeklyClaimed !== result.week;
    return (
      <Menu
        key="weekly-over"
        stack
        title={`Weekly run ${result.week}`}
        message={message}
        header={
          <div class="note">
            {resultLine(result)} Your best this week: {resultLine(best)} {prize ? 'Your franchise earns a Gold pack.' : result.won ? "This week's pack has already been collected." : 'Beat the boss to earn your franchise a Gold pack.'}
          </div>
        }
        items={[
          {
            key: 'back',
            label: 'Back to your franchise',
            detail: 'The weekly run changes nothing else about your franchise.',
            onSelect: () => {
              const given = claimWeekly(main, result);
              leaveWeekly(given ? 'You beat the weekly run: a Gold pack is waiting in your collection.' : 'Back with your franchise.');
            },
          },
          { key: 'again', label: "Play this week's run again", detail: 'The same league, roster, map and rules, from the start.', onSelect: () => { claimWeekly(main, result); enterWeekly(true); } },
        ]}
      />
    );
  }

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
            <div class="title-band">
              {/* The emblem: three lines across the ice, and a puck. */}
              <svg class="title-emblem" width="74" height="74" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="30" />
                <path d="M14 40l14-22M24 46l14-28M34 50l14-26" />
                <ellipse cx="46" cy="46" rx="6" ry="3" />
              </svg>
              <div class="title-words">
                <div class="title-mark">{gameInfo.title}</div>
                <div class="title-tag">{gameInfo.tagline}</div>
                {currentScreenPlan() === 'hint' && <div class="title-hint">For the full screen: Share, then Add to Home Screen.</div>}
              </div>
            </div>
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
        items={[{ key: 'continue', label: <b>{firstRun ? 'Start' : 'Continue'}</b>, onSelect: () => go(firstRun ? { name: 'difficulty', fresh: true, first: true } : { name: 'home' }) }]}
      />
    );
  }

  return undefined;
}
