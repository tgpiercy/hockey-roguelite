import { progress } from '../../core/achievements';
import { currentScreenPlan } from '../fullscreen';
import { betterResult, claimWeekly, resultLine, weeklyOver, weeklyResult } from '../../core/weekly';
import { loadWeeklyBest, saveWeeklyBest } from '../prefs';
import type { ComponentChildren } from 'preact';
import { difficultyInfo, type Franchise } from '../../core/season';
import rules from '../../data/season.json';
import gameInfo from '../../data/game.json';
import { teamCrest } from '../../core/crest';
import { canPlay } from '../../core/roster';
import { skinTone, STANDING } from '../../game/figure';
import { FigureArt } from '../FigureArt';
import { Icon, type IconName } from '../Icon';
import { Menu, type MenuItem } from '../Menu';
import type { AppCtx } from '../App';
import { type Screen } from './shared';

/** The goalie on the main menu wears another club's colours: a made-up one, so it is nobody's rival in particular. */
const RIVAL = teamCrest('Harbour Visitors');

/** A finished weekly run, and the main menu. */
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
    const ready = canPlay(league, team);
    const career = firstRun
      ? `${team.name}: a new club`
      : `${team.name} · ${locked ? `season ${league.season}` : `before season ${league.season}`}`;
    /** One of the three ways in: an icon, a name, a line under it. */
    const way = (key: string, icon: IconName, name: string, line: string, detail: string, onSelect: () => void, disabled = false): MenuItem => ({
      key,
      label: (
        <span class="way">
          <Icon name={icon} size={34} />
          <span class="way-text">
            <b>{name}</b>
            <span>{line}</span>
          </span>
        </span>
      ),
      detail,
      disabled,
      onSelect,
    });
    return (
      <Menu
        key="title"
        stack
        columns={3}
        title={gameInfo.title}
        header={
          <div class="landing">
            {/* The picture: a skater bearing down on a goalie, the name across the ice between them. */}
            <div class="landing-art">
              <span class="landing-figure left">
                <FigureArt pose={{ ...STANDING, stride: Math.PI / 2, speed: 1, pattern: myCrest.pattern }} crest={myCrest} skin={skinTone(2)} size={104} />
              </span>
              <div class="landing-words">
                <svg class="title-emblem" width="38" height="38" viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="30" />
                  <path d="M14 40l14-22M24 46l14-28M34 50l14-26" />
                  <ellipse cx="46" cy="46" rx="6" ry="3" />
                </svg>
                <div class="landing-mark">{gameInfo.title}</div>
                <div class="title-tag">{gameInfo.tagline}</div>
                {currentScreenPlan() === 'hint' && <div class="title-hint">For the full screen: Share, then Add to Home Screen.</div>}
              </div>
              <span class="landing-figure right">
                <FigureArt pose={{ ...STANDING, goalie: true, side: -1 }} who={{ hair: 'short', beard: 'none', build: 'tall' }} crest={RIVAL} skin={skinTone(0)} size={98} kit="away" />
              </span>
            </div>
          </div>
        }
        items={[
          way('career', 'prestige', 'Career', career, `Your club, season after season: the run across the map, the roster, the money and the league. ${difficultyInfo(f.difficulty).name}. ${last ? `Last season: ${last.wins} wins${last.champion ? ', champions' : ''}.` : 'A new franchise.'}`, () => go(firstRun ? { name: 'difficulty', fresh: true, first: true } : { name: 'home' })),
          way('exhibition', 'exhibition', 'Exhibition', 'One game, any team', ready.ok ? 'A one-off game, a shootout or a four-team tournament against any club, on any rink. One or two players. Nothing is won or lost.' : `Not yet: ${ready.reason}`, () => go({ name: 'exhibition' }), !ready.ok),
          way('practice', 'training', 'Practice', 'The rink to yourself', ready.ok ? 'The practice rink with no clock, and the two skates that teach the moves one at a time.' : `Not yet: ${ready.reason}`, () => go({ name: 'practice' }), !ready.ok),
        ]}
      />
    );
  }

  return undefined;
}
