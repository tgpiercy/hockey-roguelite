import type { ComponentChildren } from 'preact';
import ai from '../../data/ai.json';
import mascotRules from '../../data/mascot.json';
import physics from '../../data/physics.json';
import { Menu } from '../Menu';
import type { AppCtx } from '../App';

const pct = (share: number): number => Math.round(share * 100);

/** The help a person's team is given on the ice, in plain words, from the numbers the game uses. */
function assistLines(): { name: string; what: string }[] {
  const check = physics.checkAssist;
  return [
    { name: 'Your shots', what: `A shot pointed roughly at the net goes for the open corner, and scatters ${pct(1 - physics.aimAssist.spreadScale)}% less than an opponent's would.` },
    { name: 'Your passes', what: 'A pass goes to the team-mate nearest to where you point, and prefers one whose lane is open. The diamond under a team-mate shows who would get it.' },
    { name: 'Your checks', what: `Your poke check reaches wider and takes the puck ${pct(check.pokeChanceBonus)} points more often. Your body check needs a shorter hold and lands ${pct(check.bodyChanceBonus)} points more often.` },
    { name: 'Your team-mates', what: `Their poke checks land ${pct(check.matePokeBonus)} points more often and their body checks ${pct(check.mateBodyBonus)} points more often than an opponent's, and they are ${pct(ai.mateCheckBoost - 1)}% readier to throw one. Otherwise they play by the same rules as the other team.` },
    { name: 'Your goalie', what: `When an opponent comes in with nobody in his way, your goalie reacts ${pct(1 - physics.goalieAssist.reactionScale)}% sooner and comes further out to meet him.` },
    { name: 'The opponents', what: 'They get none of this. Difficulty changes only how fast they think and how many mistakes they make: never their ratings, the physics or your team.' },
    { name: 'The score', what: `Nothing is changed behind your back when you lead or trail. What does depend on the score is in plain sight and the same for both teams: a mascot may arrive for a team ${mascotRules.trailBy} goals down, and an artifact or a temperament says so when it works while trailing or leading.` },
  ];
}

/** The two questions a new player is asked before the first game, and the page that says how you are helped. */
export function welcomePages(app: AppCtx): ComponentChildren | undefined {
  const { screen, screenKey, go, prefs, changePrefs, setFirstRun, tile } = app;

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
    return (
      <Menu
        key={screenKey}
        title="How you are helped"
        header="Everything the game does for your team that it does not do for the other, said plainly. There is no other help, and none that changes with the score."
        onBack={() => go({ name: 'settings' })}
        items={[
          ...assistLines().map((line, i) => ({ key: `assist-${i}`, label: <b>{line.name}</b>, detail: line.what, onSelect: () => undefined })),
          { key: 'back', label: 'Back', onSelect: () => go({ name: 'settings' }) },
        ]}
      />
    );
  }

  return undefined;
}
