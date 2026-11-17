import type { ComponentChildren } from 'preact';
import { assistStrengths } from '../../core/assists';
import { teamStrength } from '../../core/bosses';
import { dress } from '../../core/matchup';
import { jerseyColour } from '../../core/prestige';
import { teamColour } from '../../core/teamColours';
import lessons from '../../data/lessons.json';
import look from '../../data/rinkLook.json';
import signs from '../../data/signs.json';
import type { AppCtx } from '../App';
import { Menu } from '../Menu';
import { playMatch } from '../playMatch';
import { loadPrefs } from '../prefs';

const RET = look.reticle;
const COL = look.colours;

/** A small drawing of one of the rink's signs, as it is drawn on the ice. */
export function SignArt({ kind }: { kind: string }): ComponentChildren {
  const edge = { stroke: RET.edge, 'stroke-width': 5, fill: 'none' };
  const red = { stroke: RET.colour, 'stroke-width': 2.6, fill: 'none' };
  const blue = { stroke: RET.colour2, 'stroke-width': 2.6, fill: 'none' };
  const body = <circle cx="20" cy="14" r="6" fill="currentColor" opacity="0.35" />;
  let art: ComponentChildren = null;
  if (kind === 'ring')
    art = (
      <>
        {body}
        <ellipse cx="20" cy="24" rx="13" ry="7" {...edge} />
        <ellipse cx="20" cy="24" rx="13" ry="7" {...red} />
        <line x1="33" y1="24" x2="38" y2="24" {...red} />
      </>
    );
  else if (kind === 'ring2')
    art = (
      <>
        {body}
        <ellipse cx="20" cy="24" rx="14" ry="7.5" {...edge} />
        <ellipse cx="20" cy="24" rx="14" ry="7.5" {...blue} />
        <ellipse cx="20" cy="24" rx="9" ry="4.6" {...blue} />
      </>
    );
  else if (kind === 'arrow')
    art = (
      <>
        <circle cx="20" cy="28" r="6" fill="currentColor" opacity="0.35" />
        <polygon points="12,6 28,6 20,18" fill={RET.colour} stroke={RET.edge} stroke-width="1.6" />
      </>
    );
  else if (kind === 'diamond')
    art = (
      <>
        {body}
        <polygon points="8,26 20,20 32,26 20,32" {...edge} />
        <polygon points="8,26 20,20 32,26 20,32" {...red} />
      </>
    );
  else if (kind === 'reach')
    art = (
      <>
        <circle cx="20" cy="20" r="5" fill="currentColor" opacity="0.35" />
        <circle cx="20" cy="20" r="15" stroke={RET.colour} stroke-width="1.6" fill="none" opacity="0.7" />
      </>
    );
  else if (kind === 'bar')
    art = (
      <>
        <circle cx="20" cy="26" r="6" fill="currentColor" opacity="0.35" />
        <rect x="5" y="9" width="30" height="6" rx="3" fill="currentColor" opacity="0.3" />
        <rect x="5" y="9" width="19" height="6" rx="3" fill={COL.charge} />
      </>
    );
  else if (kind === 'momentum')
    art = (
      <>
        <rect x="4" y="12" width="32" height="12" rx="2" fill="currentColor" opacity="0.25" />
        <rect x="4" y="24" width="22" height="3.5" fill={COL.accent} />
      </>
    );
  else if (kind === 'fire')
    art = (
      <>
        <rect x="4" y="12" width="32" height="12" rx="2" fill="currentColor" opacity="0.25" />
        <rect x="4" y="24" width="32" height="3.5" fill={COL.fire} />
      </>
    );
  else if (kind === 'energy')
    art = (
      <>
        <rect x="5" y="10" width="30" height="5" rx="2.5" fill={COL.accent} />
        <rect x="5" y="20" width="22" height="5" rx="2.5" fill="currentColor" opacity="0.7" />
        <rect x="5" y="28" width="30" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
        <rect x="3.5" y="18.5" width="33" height="8" rx="4" stroke="currentColor" stroke-width="1.2" fill="none" />
      </>
    );
  else if (kind === 'pips')
    art = (
      <>
        <circle cx="10" cy="20" r="4" fill={COL.accent} />
        <circle cx="20" cy="20" r="4" fill={COL.accent} />
        <circle cx="30" cy="20" r="4" fill="currentColor" opacity="0.3" />
      </>
    );
  else if (kind === 'word')
    art = (
      <text x="20" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="currentColor">
        STOLEN!
      </text>
    );
  else if (kind === 'heavy')
    art = (
      <>
        {body}
        <ellipse cx="20" cy="24" rx="15" ry="7" stroke={COL.ice} stroke-width="4.5" fill="none" />
      </>
    );
  else if (kind === 'wall')
    art = (
      <>
        <circle cx="14" cy="20" r="6" fill="currentColor" opacity="0.35" />
        <line x1="27" y1="10" x2="27" y2="30" stroke={COL.ice} stroke-width="4.5" stroke-linecap="round" />
      </>
    );
  else if (kind === 'flash')
    art = (
      <>
        <circle cx="20" cy="20" r="6" fill="currentColor" opacity="0.35" />
        <circle cx="20" cy="20" r="14" stroke={COL.fire} stroke-width="3" fill="none" />
      </>
    );
  else if (kind === 'lanes')
    art = (
      <>
        <line x1="8" y1="30" x2="32" y2="8" stroke={COL.accent} stroke-width="1.8" opacity="0.6" />
        <line x1="8" y1="30" x2="34" y2="26" stroke={COL.accent} stroke-width="1.8" opacity="0.6" />
        <circle cx="8" cy="30" r="4.5" fill="currentColor" opacity="0.45" />
        <circle cx="32" cy="8" r="4.5" fill="currentColor" opacity="0.3" />
        <circle cx="34" cy="26" r="4.5" fill="currentColor" opacity="0.3" />
      </>
    );
  return (
    <svg class="sign-art" viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
      {art}
    </svg>
  );
}

/** Starts the first skate: your team on the practice rink against the weakest club in the league, with the lesson run on it. */
export function startLesson(app: AppCtx): void {
  const { f, league, team, setPlaying, setScreen, setMessage, setPrefs } = app;
  const opponent = league.teams.filter((x) => x.id !== league.userTeamId).sort((a, b) => teamStrength(league, a.id) - teamStrength(league, b.id))[0];
  const homeTeam = dress(league, team);
  const away = opponent ? dress(league, opponent) : null;
  if (!homeTeam || !away) {
    setScreen({ name: 'home' });
    return;
  }
  setPlaying(true);
  const homeColour = jerseyColour(f);
  playMatch({ assists: assistStrengths(f), home: homeTeam, away, level: lessons.opponentLevel, homeColour, awayColour: teamColour(away.name, homeColour), lesson: true, forfeitNote: 'Leave the first skate?' }, () => {
    setScreen({ name: 'home' });
    setMessage('Back from the first skate. It is under Exhibition whenever you want it again, beside the practice rink.');
    setPrefs(loadPrefs());
    setPlaying(false);
  });
}

/** The offer of a first skate before the first game, and the page of the rink's signs. */
export function teachPages(app: AppCtx): ComponentChildren | undefined {
  const { screen, screenKey, go, setFirstRun, tile } = app;

  if (screen.name === 'firstSkate') {
    return (
      <Menu
        key={screenKey}
        title="A first skate?"
        header={`About two minutes on the practice rink: ${lessons.steps.length} moves, one at a time, each with a line saying what it is for. Nothing is at stake and you can leave from the pause menu. The game is made for a controller: one paired with the phone is the best way to play. The on-screen buttons do everything, with less finesse.`}
        items={[
          tile('take', 'Take the first skate', 'Six moves, two minutes', () => {
            setFirstRun(false);
            startLesson(app);
          }, {
            icon: 'training',
            primary: true,
            detail: 'Each move is asked for once or twice against the weakest club in the league. It ends by itself and takes you to your club.',
          }),
          tile('skip', 'Skip it', 'Straight to the club', () => {
            setFirstRun(false);
            go({ name: 'home' }, 'The first skate is under Exhibition if you want it later. You can change the difficulty between seasons and player switching at any time, both under Settings.');
          }, { icon: 'play', detail: 'You know your way round a hockey game. The hints during games still say what each move is the first few times it is on.' }),
        ]}
      />
    );
  }

  if (screen.name === 'signs') {
    return (
      <Menu
        key={screenKey}
        title="Signs on the rink"
        header="What each mark on the ice and on the scoreboard means. The ones under 'A boss' appear only against the club that has that trick."
        onBack={() => go({ name: 'settings' })}
        items={[
          ...signs.signs.map((s) => ({
            key: `sign-${s.id}`,
            label: (
              <span class="tile">
                <SignArt kind={s.art} />
                <span class="tile-name">{s.name}</span>
                <span class="tile-what">{s.where}</span>
              </span>
            ),
            detail: s.means,
            onSelect: () => undefined,
          })),
          tile('back', 'Back', 'To the settings', () => go({ name: 'settings' }), { icon: 'play' }),
        ]}
      />
    );
  }

  return undefined;
}
