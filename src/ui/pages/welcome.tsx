import type { ComponentChildren } from 'preact';
import { ASSIST_STEPS, ASSISTS, assistsChanged, assistSteps, nextAssistStep, presetStep, resetAssists, setAssist, type AssistKind } from '../../core/assists';
import { difficultyInfo } from '../../core/season';
import ai from '../../data/ai.json';
import mascotRules from '../../data/mascot.json';
import physics from '../../data/physics.json';
import { Menu } from '../Menu';
import type { AppCtx } from '../App';

const pct = (share: number): number => Math.round(share * 100);

/** What each kind of help does at full strength, with the numbers the game uses. */
function fullWords(kind: AssistKind): string {
  const check = physics.checkAssist;
  if (kind === 'aim') return `At full, a shot pointed roughly at the net goes for the open corner (the game chooses the side) and scatters ${pct(1 - physics.aimAssist.spreadScale)}% less than an opponent's would. At part, it goes for the corner on the side you point: you choose the side, and it scatters a little more. Off, it goes exactly where you point.`;
  if (kind === 'pass') return 'At full, a pass goes to the team-mate nearest to where you point, and prefers one whose lane is open. The diamond under a team-mate shows who would get it. Off, the pass goes exactly where you point.';
  if (kind === 'check') return `At full, your poke check reaches wider and takes the puck ${pct(check.pokeChanceBonus)} points more often, your body check needs a shorter hold and lands ${pct(check.bodyChanceBonus)} points more often, and your team-mates' checks land ${pct(check.matePokeBonus)} points more often. At part, half of each.`;
  return `At full, when an opponent comes in with nobody in his way, your goalie reacts ${pct(1 - physics.goalieAssist.reactionScale)}% sooner and comes further out to meet him. At part, half of that.`;
}

/** The two questions a new player is asked before the first game, and the page that says how you are helped. */
export function welcomePages(app: AppCtx): ComponentChildren | undefined {
  const { screen, screenKey, go, after, f, message, prefs, changePrefs, setFirstRun, tile } = app;

  if (screen.name === 'switching') {
    const pick = (hold: boolean): void => {
      changePrefs({ ...prefs, holdSwitch: hold });
      setFirstRun(false);
      go({ name: 'home' }, 'You can change the difficulty between seasons and player switching at any time, both under Settings.');
    };
    return (
      <Menu
        key={screenKey}
        title="Who chooses your skater?"
        header="You control one skater at a time. When a team-mate gets the puck, either the game hands you that team-mate, or you stay on your own man until you press switch."
        initialFocus={prefs.holdSwitch ? 1 : 0}
        items={[
          tile('auto', 'The game does', 'You always have the puck carrier', () => pick(false), {
            icon: 'play',
            detail: 'Automatic. Whoever of yours has the puck is yours to control, as in most hockey games. Simplest to start with.',
          }),
          tile('hold', 'I do', 'You keep your skater until you press switch', () => pick(true), {
            icon: 'target',
            detail: 'Hold. A team-mate who gets the puck plays it himself until you press switch (X on the controller). Choose this if being moved from skater to skater feels wrong.',
          }),
        ]}
      />
    );
  }

  if (screen.name === 'assists') {
    const steps = assistSteps(f);
    return (
      <Menu
        key={screenKey}
        title="How you are helped"
        message={message}
        header={
          <>
            <div>
              Everything the game does for your team that it does not do for the other. {difficultyInfo(f.difficulty).name} sets each one; you may change any of them, between games, and nothing is taken away for doing so.
            </div>
          </>
        }
        onBack={() => go({ name: 'settings' })}
        items={[
          ...ASSISTS.map((a) =>
            tile(`assist-${a.id}`, a.name, `${steps[a.id].name}${f.assists?.[a.id] !== undefined ? ' (your choice)' : ''}`, () => after(setAssist(f, a.id, nextAssistStep(f, a.id))), {
              icon: 'target',
              detail: `${fullWords(a.id)} Press to change: ${a.steps.map((id) => ASSIST_STEPS.find((s) => s.id === id)?.name).join(', ')}. ${difficultyInfo(f.difficulty).name} gives ${ASSIST_STEPS.find((s) => s.id === presetStep(f.difficulty, a.id))?.name.toLowerCase()}.`,
            }),
          ),
          tile('others', 'The opponents, and the score', 'What they get: nothing', () => undefined, {
            icon: 'report',
            detail: `The opponents get none of this: difficulty changes only how fast they think. Nothing changes with the score behind your back. What does depend on the score is in plain sight and the same for both teams: a mascot may arrive for a team ${mascotRules.trailBy} goals down, and an artifact or a temperament says so when it works while trailing or leading. Your team-mates are also ${pct(ai.mateCheckBoost - 1)}% readier to throw a check than the other team's.`,
          }),
          tile('reset', `As ${difficultyInfo(f.difficulty).name} sets them`, assistsChanged(f) ? 'Undo your changes' : 'Nothing is changed', () => after(resetAssists(f)), { icon: 'play', disabled: !assistsChanged(f) }),
          tile('back', 'Back', 'To the settings', () => go({ name: 'settings' }), { icon: 'play' }),
        ]}
      />
    );
  }

  return undefined;
}
