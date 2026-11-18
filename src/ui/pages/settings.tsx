import { assistLine } from '../../core/assists';
import seasonRules from '../../data/season.json';
import { progress } from '../../core/achievements';
import { currentScreenPlan, goFullscreen } from '../fullscreen';
import { BACKUP_KEY, backupDue, backupWords, lastExport, noteExported } from '../safety';
import { rumble } from '../../game/rumble';
import { buzz } from '../../game/rumbleMap';
import { dropSecond } from '../../game/gamepad';
import { music } from '../../game/music';
import type { ComponentChildren } from 'preact';
import { franchiseOf, fromSave, parseSave, toSave } from '../../core/save';
import { periodSecondsOf, setPeriodSeconds, DIFFICULTIES, difficultyInfo, setDifficulty, abandonSeason } from '../../core/season';
import rules from '../../data/season.json';
import { gameAudio } from '../../game/audio';
import { canSpeak, sayVoiceSample, voiceChoices } from '../../game/voice';
import { Menu, type MenuItem } from '../Menu';
import { hasCustomPadMap } from '../../game/padMap';
import { PadReadout } from '../PadReadout';
import { PadSetup } from '../PadSetup';
import { COMMENTARY_MODES, COMMENTARY_NAMES, loadHintCounts, saveHintCounts, VOLUME_STEPS, type Prefs } from '../prefs';
import { HINT_IDS, retired } from '../../game/hints';
import { money, Ratings } from '../parts';
import { downloadText, loadStored, pickTextFile } from '../storage';
import type { AppCtx } from '../App';
import { type Screen, count } from './shared';

/** The groups the settings are shown in, and the rows (by key) each holds. Save and load stands beside them. */
const SETTING_GROUPS: { id: string; name: string; icon: 'detail' | 'sound' | 'settings' | 'report'; what: string; keys: string[] }[] = [
  { id: 'game', name: 'The game', icon: 'settings', what: 'Difficulty, game length, switching, replays', keys: ['difficulty', 'length', 'switching', 'replays'] },
  { id: 'sound', name: 'Sound', icon: 'sound', what: 'Volume, music, commentary', keys: ['sound', 'volume', 'music', 'commentary', 'voice'] },
  { id: 'screen', name: 'Screen', icon: 'detail', what: 'Rink detail, puck, full screen, shake', keys: ['detail', 'puck', 'fullscreen', 'calm'] },
  { id: 'pad', name: 'Controller', icon: 'settings', what: 'Rumble, set up, test', keys: ['rumble', 'padSetup', 'padSetup2', 'padTest'] },
  { id: 'help', name: 'Help', icon: 'report', what: 'How you are helped, hints, signs, ratings', keys: ['assists', 'hints', 'hintsAgain', 'signs', 'ratingWorth'] },
];
/** Which group of settings is open: kept here so that coming back from one of its screens returns to it. */
let settingsGroup: string | null = null;

/** Settings, difficulty, the save, the controller, and the two "are you sure" screens. The last one is what shows when nothing else does. */
export function settingsPages(app: AppCtx): ComponentChildren {
  const {
    screen, setScreen, message, setMessage, playing, joined, setJoined, keptSafe, group, setGroup,
    rewards, prefs, changePrefs, commit, startOver, shown, f, season, team, locked,
    screenKey, go, after, weeklyOn, home, top, tile,
  } = app;

  if (screen.name === 'settings') {
    const open = SETTING_GROUPS.find((g) => g.id === settingsGroup);
    // Every row is made, then either one group's are shown or a tile for each group.
    const grouped = (all: MenuItem[]): MenuItem[] => {
      if (open) return all.filter((item) => open.keys.includes(item.key));
      return [
        ...SETTING_GROUPS.map((g) =>
          tile(
            `group-${g.id}`,
            g.name,
            g.what,
            () => {
              settingsGroup = g.id;
              go({ name: 'settings' });
            },
            { icon: g.icon },
          ),
        ),
        // Save and load, and any row no group has claimed, so that a new setting can never go missing.
        ...all.filter((item) => !SETTING_GROUPS.some((g) => g.keys.includes(item.key))),
      ];
    };
    return (
      <Menu
        key={`${screenKey}-${settingsGroup ?? 'all'}`}
        remember={open ? `settings-${open.id}` : 'group-settings'}
        title={open ? `Settings · ${open.name}` : 'Settings'}
        message={message}
        onBack={
          open
            ? () => {
                settingsGroup = null;
                go({ name: 'settings' });
              }
            : top
        }
        items={grouped([
          tile('difficulty', 'Difficulty', difficultyInfo(f.difficulty).name, () => go({ name: 'difficulty', fresh: false }), {
            lock: locked ? 'The difficulty can only be changed between seasons.' : undefined,
            detail: difficultyInfo(f.difficulty).description,
          }),
          tile(
            'length',
            'Game length',
            `${Math.floor(periodSecondsOf(f) / 60)}:00 periods`,
            () => {
              const lengths = rules.periodLengths;
              after(setPeriodSeconds(f, lengths[(lengths.indexOf(periodSecondsOf(f)) + 1) % lengths.length] as number));
            },
            {
              icon: 'detail',
              detail: `How long each of a game's three periods lasts: ${rules.periodLengths.map((x) => `${Math.floor(x / 60)}:00`).join(', ')}. Shorter games make a season quicker to play. Everything else about the season is the same.`,
            },
          ),
          tile('sound', 'Sound', prefs.sound ? 'On' : 'Off', () => changePrefs({ ...prefs, sound: !prefs.sound }), {
            detail: 'Every sound is made by the game as it runs. Sound starts after your first key press or tap; with only a controller connected, tap the screen once.',
          }),
          tile('volume', 'Volume', `${Math.round(prefs.volume * 100)}%`, () => {
            const next = VOLUME_STEPS[(VOLUME_STEPS.findIndex((v) => v >= prefs.volume - 0.001) + 1) % VOLUME_STEPS.length] as number;
            changePrefs({ ...prefs, volume: next });
            gameAudio.play('chime');
          }, { detail: 'Press to step through the levels.', disabled: !prefs.sound }),
          tile('music', 'Music', prefs.music ? `On · ${Math.round(prefs.musicVolume * 100)}%` : 'Off', () => {
            // Off, then each volume step in turn.
            const at = VOLUME_STEPS.findIndex((v) => v >= prefs.musicVolume - 0.001);
            if (!prefs.music) changePrefs({ ...prefs, music: true, musicVolume: VOLUME_STEPS[0] as number });
            else if (at >= VOLUME_STEPS.length - 1) changePrefs({ ...prefs, music: false });
            else changePrefs({ ...prefs, musicVolume: VOLUME_STEPS[at + 1] as number });
          }, { icon: 'sound', detail: 'A theme on the menus and short pieces for goals, wins and pack openings; nothing plays during a game. Press to step through the volumes and Off.', disabled: !prefs.sound }),
          tile('detail', 'Rink detail', prefs.detail === 'full' ? 'Full' : 'Low', () => changePrefs({ ...prefs, detail: prefs.detail === 'full' ? 'low' : 'full' }), {
            detail: 'Low drops the skate marks, snow, screen shake and crowd movement. Try it if the game does not run smoothly on your phone.',
          }),
          tile('commentary', 'Commentary', COMMENTARY_NAMES[prefs.commentary], () => changePrefs({ ...prefs, commentary: COMMENTARY_MODES[(COMMENTARY_MODES.indexOf(prefs.commentary) + 1) % COMMENTARY_MODES.length] as Prefs['commentary'] }), {
            icon: 'sound',
            detail: 'Short lines for the big plays during a game. Text shows them on the rink; Text and voice also reads them aloud with one of this device\'s own voices: choose which below.',
          }),
          ...(prefs.commentary === 'voice' && canSpeak()
            ? [
                tile('voice', 'Commentary voice', prefs.voice === '' || !voiceChoices().includes(prefs.voice) ? 'Best on this device' : prefs.voice, () => {
                  // Step through the best voice and then each English voice the device has, and say a line in it.
                  const choices = ['', ...voiceChoices()];
                  const next = choices[(Math.max(0, choices.indexOf(prefs.voice)) + 1) % choices.length] as string;
                  changePrefs({ ...prefs, voice: next });
                  sayVoiceSample(next, prefs.sound ? prefs.volume : 0);
                }, {
                  icon: 'sound',
                  detail: 'Which of this device\'s voices calls the game. Press to hear the next one. A goal is shouted, a save called quickly, the end of a period read out level; the radio announcer, at the opening and between periods, is a second voice where the device has one. More and better voices can be installed in the phone\'s own text-to-speech settings.',
                }),
              ]
            : []),
          tile('assists', 'How you are helped', assistLine(f), () => go({ name: 'assists' }), {
            icon: 'target',
            detail: 'The help your shots, passes, checks and goalie are given, each of which you can turn down or off, and what the opponents are not given.',
          }),
          tile('signs', 'Signs on the rink', 'What every ring, bar and arrow means', () => go({ name: 'signs' }), {
            icon: 'report',
            detail: 'The marks on the ice and the scoreboard, each with a drawing and what it is telling you, and the marks that give away a boss\'s trick.',
          }),
          tile('ratingWorth', 'What ratings are worth', 'Ten points of each, in numbers', () => go({ name: 'ratingWorth' }), {
            icon: 'report',
            detail: 'What ten points of speed, shooting and the rest change on the ice, worked out from the game\'s own numbers.',
          }),
          tile('switching', 'Player switching', prefs.holdSwitch ? 'Hold' : 'Automatic', () => changePrefs({ ...prefs, holdSwitch: !prefs.holdSwitch }), {
            detail: 'Automatic: you always control whoever of yours has the puck. Hold: you keep your skater until you press switch, and a team-mate who gets the puck plays it himself.',
          }),
          tile('puck', 'Puck', prefs.bigPuck ? 'Large, bright edge' : 'Standard', () => changePrefs({ ...prefs, bigPuck: !prefs.bigPuck }), {
            icon: 'target',
            detail: 'Large draws the puck bigger with a bright ring round it, for a small screen or a busy rink. Nothing about the play changes.',
          }),
          tile(
            'fullscreen',
            'Full screen',
            currentScreenPlan() === 'hint' ? 'Add to Home Screen' : prefs.fullscreen ? 'On' : 'Off',
            () => {
              changePrefs({ ...prefs, fullscreen: !prefs.fullscreen });
              // Turned on by a touch, it can take effect at once.
              if (!prefs.fullscreen && currentScreenPlan() === 'request') goFullscreen();
            },
            {
              icon: 'detail',
              detail:
                currentScreenPlan() === 'hint'
                  ? 'This browser will not let a page hide its address bar. To play without it: press the Share button, choose Add to Home Screen, and open Third Line from there.'
                  : 'On a phone held sideways, your first touch hides the browser\'s address bar and keeps the screen sideways. Opened from the home screen there is no address bar at all.',
            },
          ),
          tile('calm', 'Shake and flashes', prefs.calm ? 'Reduced' : 'On', () => changePrefs({ ...prefs, calm: !prefs.calm }), {
            icon: 'report',
            detail: 'Reduced: the screen does not shake on a goal or a hit, the crowd\'s cameras do not flash, and marks that pulse hold steady. Nothing about the play changes. Takes effect from your next game.',
          }),
          tile(
            'rumble',
            'Rumble',
            prefs.rumble ? 'On' : 'Off',
            () => {
              changePrefs({ ...prefs, rumble: !prefs.rumble });
              // Turning it on gives a buzz at once, so you know whether this controller can.
              if (!prefs.rumble) rumble.play(0, buzz('hit'));
            },
            {
              icon: 'pHit',
              detail: 'The controller shakes for a body check, a goal, a post and a save. Not every controller or browser can: turning it on gives one buzz to show whether yours does. With no controller, a phone shakes itself where it can.',
            },
          ),
          tile('replays', 'Goal replays', prefs.replays ? 'On' : 'Off', () => changePrefs({ ...prefs, replays: !prefs.replays }), {
            detail: 'After each goal the last few seconds are shown again at half speed. Any button skips it.',
          }),
          tile('hints', 'Hints', prefs.hints ? 'On' : 'Off', () => changePrefs({ ...prefs, hints: !prefs.hints }), {
            icon: 'detail',
            detail: 'Reminders of the moves during a game: one-timer, fake, deke, saucer pass, give and go, poke, body check, block. Each stops once you have done it three times.',
          }),
          tile('hintsAgain', 'Show hints again', `${HINT_IDS.filter((id) => retired(id, loadHintCounts())).length} of ${HINT_IDS.length} learned`, () => {
            saveHintCounts({});
            changePrefs({ ...prefs });
          }, {
            icon: 'detail',
            detail: 'Forget which moves you have done, so every hint appears again.',
          }),
          tile('padSetup', 'Set up controller', hasCustomPadMap() ? 'Set up by you' : 'Standard layout', () => go({ name: 'padSetup' }), {
            icon: 'detail',
            detail: 'If a button does the wrong thing, press each one in turn and the game learns your controller. About 20 seconds.',
          }),
          tile('padSetup2', 'Set up controller: player 2', !joined ? 'Press a button on the second controller' : hasCustomPadMap(1) ? 'Set up by him' : 'Standard layout', () => go({ name: 'padSetup', player: 1 }), {
            icon: 'detail',
            lock: joined ? undefined : 'Press any button on a second controller to join as player 2 first.',
            detail: "If player 2's buttons do the wrong thing, press each one in turn on his controller.",
          }),
          ...(joined
            ? [
                tile('p2leave', 'Player 2: leave', 'Back to one player', () => {
                  dropSecond();
                  setJoined(false);
                  setMessage('Player 2 has left.');
                }, { icon: 'team', detail: 'The second controller stops being player 2. It can join again by pressing a button.' }),
              ]
            : []),
          tile('padTest', 'Controller test', 'See what the game reads', () => go({ name: 'padTest' }), {
            icon: 'detail',
            detail: 'Shows which controller buttons and on-screen buttons the game sees as you press them.',
          }),
          tile('saves', 'Save and load', weeklyOn ? 'Leave the weekly run first' : 'Export, import, or start again', () => go({ name: 'saves' }), {
            disabled: weeklyOn,
            detail: weeklyOn ? 'Saving, loading and starting again are for your own franchise: leave the weekly run first.' : 'The game saves by itself after every move, every stop and every game.',
          }),
        ])}
      />
    );
  }

  if (screen.name === 'difficulty') {
    const fresh = screen.fresh;
    const first = screen.first === true;
    return (
      <Menu
        key={screenKey}
        title={first ? 'How hard should it be?' : fresh ? 'New franchise: how hard?' : 'Difficulty'}
        message={message}
        header={
          first
            ? 'Welcome. Choose how sharp the opponents are. Rookie is the place to start if arcade hockey is new to you; you can change it between seasons.'
            : fresh
              ? 'Your current team, record, season and artifacts are replaced. Difficulty only changes how sharp the opponents are, and you can change it between seasons.'
              : 'Difficulty only changes how sharp the opponents are: how fast they react and how many mistakes they make. Ratings, money and rewards are the same on every level.'
        }
        onBack={() => go({ name: first ? 'title' : fresh ? 'saves' : 'settings' })}
        initialFocus={Math.max(0, DIFFICULTIES.findIndex((d) => d.id === (first ? seasonRules.suggestedDifficulty : f.difficulty)))}
        items={DIFFICULTIES.map((d) => ({
          key: d.id,
          detail: d.description,
          label: (
            <span class="tile">
              <span class="tile-name">{d.name}</span>
              <span class="tile-what">{d.short ?? d.description}</span>
              {!fresh && d.id === f.difficulty ? <span class="badge">Now</span> : null}
              {first && d.id === seasonRules.suggestedDifficulty ? <span class="badge">Start here</span> : null}
            </span>
          ),
          onSelect: () => {
            if (first) {
              setGroup(null);
              startOver(d.id);
              go({ name: 'switching' });
            } else if (fresh) {
              setGroup(null);
              setScreen({ name: 'home' });
              setMessage(`A new franchise has begun on ${d.name}.`);
              startOver(d.id);
            } else {
              after(setDifficulty(f, d.id), { name: 'settings' });
            }
          },
        }))}
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
        header={
          <>
            <div>The game saves by itself after every move, every stop and every game. A game in progress is not saved.</div>
            <div class={backupDue(lastExport(), Date.now()) ? 'warn' : 'note'}>
              The save lives in this browser only: clearing the browser's data would lose it. Your copy outside the phone: {backupWords(lastExport(), Date.now())}.
            </div>
            <div class="note">{keptSafe === null ? '' : keptSafe ? 'This browser has agreed not to clear the save by itself.' : 'This browser may clear the save if the phone runs short of space: export it now and then.'}</div>
          </>
        }
        onBack={home}
        items={[
          {
            key: 'export',
            label: 'Export the save to a file',
            onSelect: () => {
              const when = new Date().toISOString();
              downloadText('hockey-save.json', `${JSON.stringify(toSave(f, when), null, 2)}\n`);
              noteExported(when);
              setMessage('Saved as hockey-save.json. Keep it somewhere other than this phone.');
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
          {
            key: 'restore',
            label: 'Go back to the start of this season',
            detail: 'The game keeps one copy of your franchise from the moment each season began. This puts it back, losing everything since.',
            onSelect: () => {
              void loadStored(BACKUP_KEY).then((raw) => {
                const loaded = raw ? fromSave(raw) : null;
                if (!loaded || !loaded.ok) return setMessage('There is no copy from the start of a season yet.');
                setScreen({ name: 'home' });
                setMessage('Back at the start of the season.');
                commit(franchiseOf(loaded.save));
              });
            },
          },
          ...(locked ? [{ key: 'abandon', label: 'Abandon this season', detail: 'Ends the season now and goes to the off-season. You keep your franchise.', onSelect: () => go({ name: 'confirmAbandon' }) }] : []),
          { key: 'new', label: 'Start a new franchise', onSelect: () => go({ name: 'confirmNew' }) },
        ]}
      />
    );
  }

  if (screen.name === 'padSetup') {
    return (
      <PadSetup
        player={screen.player ?? 0}
        onDone={(text) => {
          go({ name: 'settings' });
          if (text) setMessage(text);
        }}
      />
    );
  }

  if (screen.name === 'padTest') {
    return (
      <Menu
        key={screenKey}
        title="Controller test"
        header={<PadReadout />}
        onBack={home}
        help="B back"
        items={[{ key: 'back', label: 'Back', detail: 'Press each button and check it shows above with the action you expect: A pass, B check, X shoot, Y switch, Menu pause.', onSelect: home }]}
      />
    );
  }

  if (screen.name === 'confirmAbandon') {
    return (
      <Menu
        key={screenKey}
        title="Abandon this season?"
        header="The season ends now, without a title. Then the off-season runs as usual: XP is banked, everyone is a year older, contracts tick down and the season's bills are paid. Your Pucks and unused powerups are lost. You keep your team, gear, cash and artifacts. This cannot be undone."
        onBack={() => go({ name: 'saves' })}
        initialFocus={1}
        items={[
          {
            key: 'yes',
            label: 'Yes, abandon the season',
            onSelect: () => {
              setGroup(null);
              after(abandonSeason(f), { name: 'home' });
            },
          },
          { key: 'no', label: 'No, keep playing', onSelect: () => go({ name: 'saves' }) },
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
          onSelect: () => go({ name: 'difficulty', fresh: true }),
        },
        { key: 'no', label: 'No, keep playing', onSelect: () => go({ name: 'saves' }) },
      ]}
    />
  );
}
