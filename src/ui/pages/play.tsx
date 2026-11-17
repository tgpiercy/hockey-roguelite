import { startLesson } from './teach';
import { opened, OPENS_WHEN } from '../../core/opening';
import { assistStrengths } from '../../core/assists';
import { charterOpen } from '../../core/achievements';
import { BACKUP_KEY } from '../safety';
import { ArtifactCard, type ArtChip } from '../screens/season';
import { afterTournamentGame, newTournament, tournamentOpponent, type Tournament } from '../../core/tournament';
import { CHARTERS, charterInfo, cleanVows, nextRank, setupLine, vowPackLuck, vowPay, vowPoints, VOWS, type SeasonSetup } from '../../core/charter';
import { nextRink, rinkInfo } from '../../core/rinks';
import { dropSecond } from '../../game/gamepad';
import { music } from '../../game/music';
import { points } from '../../core/standings';
import type { ComponentChildren } from 'preact';
import { teamStrength } from '../../core/bosses';
import { teamCrest } from '../../core/crest';
import { rosterOf, teamOf } from '../../core/league';
import { dress } from '../../core/matchup';
import { beginSeason } from '../../core/offseason';
import { jerseyColour, prestige } from '../../core/prestige';
import { toSave } from '../../core/save';
import { artifactInfo, bargainGames, signatureOffer, periodSecondsOf, recipeFor, powerupInfo, setLoadout } from '../../core/season';
import { teamColour } from '../../core/teamColours';
import rules from '../../data/season.json';
import { CrestBadge } from '../Crest';
import { powerupIcon } from '../screens/season';
import { Menu, type MenuItem } from '../Menu';
import { loadPrefs } from '../prefs';
import { playMatch } from '../playMatch';
import { Grade, OptionCard, RinkOutline } from '../parts';
import { store } from '../storage';
import type { AppCtx } from '../App';
import { BUTTONS, count, practicePowerups, rinkShape } from './shared';

/** Setting up a season, exhibition games, powerups and artifacts. */
export function playPages(app: AppCtx): ComponentChildren | undefined {
  const {
    screen, setScreen, message, setMessage, setPlaying, joined, setJoined, together, setTogether, exRink,
    setExRink, exShootout, setExShootout, tourney, setTourney, plan, setPlan, setPrefs, f, league,
    season, team, screenKey, go, after, home, tile, loadoutLine,
  } = app;

  if (screen.name === 'setup') {
    const charter = charterInfo(plan.charter);
    const points = vowPoints(plan.vows);
    const open = CHARTERS.filter((c) => charterOpen(f, c.id));
    const next = open[(open.findIndex((c) => c.id === charter.id) + 1) % open.length] as (typeof CHARTERS)[number];
    // The season's own powerup: one of three drawn for this season, the first until another is chosen.
    const offer = signatureOffer(f);
    const signature = plan.signature && offer.includes(plan.signature) ? plan.signature : (offer[0] as string);
    const chosen = powerupInfo(signature);
    const ready: SeasonSetup = { ...plan, signature };
    return (
      <Menu
        key={screenKey}
        title={`Season ${league.season}`}
        message={message}
        header={
          <div class="note">
            {!opened(f, 'setup')
              ? `Choose the powerup you will carry all season, and start. ${OPENS_WHEN.setup}`
              : points === 0
              ? 'No handicaps. Each one you take is worth points; every point pays more Pucks and better pack luck this season.'
              : `${points} handicap ${points === 1 ? 'point' : 'points'}: games pay ${Math.round((vowPay(plan.vows) - 1) * 100)}% more Pucks, and packs are ${Math.round((vowPackLuck(plan.vows) - 1) * 100)}% luckier, this season.`}
          </div>
        }
        onBack={home}
        columns={2}
        items={[
          tile('go', 'Start the season', setupLine(plan) || 'Standard, no handicaps', () => {
            const began = beginSeason(f, ready);
            // One copy of the franchise as the season begins, beside the save itself.
            if (began.ok) void store(toSave(f, new Date().toISOString()), BACKUP_KEY).catch(() => undefined);
            after(began, { name: 'home' });
          }, { primary: true, wide: true, detail: 'Your seventh skater is the spare: you can swap him in between games.' }),
          {
            key: 'signature',
            wide: true,
            label: <OptionCard icon="powerups" name="Your powerup" value={chosen.name} chip="Press to change" />,
            detail: `${chosen.description} Yours all season on the LT button: it is never used up, and can be used again ${rules.signatureRechargeSeconds} seconds of play after it ends. This season's three: ${offer.map((id) => powerupInfo(id).name).join(', ')}. Press to change.`,
            onSelect: () => setPlan({ ...plan, signature: offer[(offer.indexOf(signature) + 1) % offer.length] as string }),
          },
          ...(opened(f, 'setup') ? [
          { key: 'charter', wide: true, label: <OptionCard icon="charter" name="Charter" value={charter.name} chip="Press to change" />, detail: `${charter.describe} Press to change.`, onSelect: () => setPlan({ ...plan, charter: next.id }) },
          ...VOWS.map((vow): MenuItem => {
            const rank = cleanVows(plan.vows)[vow.id] ?? 0;
            return {
              key: vow.id,
              label: <OptionCard icon="handicap" name={vow.name} value={rank === 0 ? 'Off' : `${rank} ${rank === 1 ? 'point' : 'points'}`} pips={{ filled: rank, total: vow.ranks }} off={rank === 0} />,
              detail: `${vow.describe} Worth ${vow.ranks > 1 ? 'a point a rank' : 'a point'}. Press to change.`,
              onSelect: () => setPlan({ ...plan, vows: nextRank(plan.vows, vow.id) }),
            };
          }),
          ] as MenuItem[] : []),
        ]}
      />
    );
  }

  if (screen.name === 'exhibition') {
    const mine = Math.round(teamStrength(league, team.id));
    const opponents = league.teams.filter((x) => x.id !== league.userTeamId).sort((a, b) => teamStrength(league, a.id) - teamStrength(league, b.id));
    return (
      <Menu
        key={screenKey}
        remember="exhibition"
        title="Exhibition"
        header={`Your team averages ${mine} overall. Weakest opponents first. Exhibition games do not count. ${joined ? (together === 'coop' ? 'Two players, on the same team.' : 'Two players, head to head: player 2 takes the team you choose.') : 'For two players, press a button on a second controller.'}`}
        onBack={home}
        items={[
          ...(tourney && tournamentOpponent(tourney)
            ? [
                tile(
                  'tourney-play',
                  tourney.stage === 'semi' ? 'Tournament: semi-final' : 'Tournament: the final',
                  `Against ${teamOf(league, tournamentOpponent(tourney) as string).name}`,
                  () => {
                    const opponent = teamOf(league, tournamentOpponent(tourney) as string);
                    const homeTeam = dress(league, team);
                    const away = dress(league, opponent);
                    if (!homeTeam || !away) return;
                    setPlaying(true);
                    const homeColour = jerseyColour(f);
                    playMatch({ periodSeconds: periodSecondsOf(f), assists: assistStrengths(f), home: homeTeam, away, homeColour, awayColour: teamColour(away.name, homeColour), rink: exRink, ...(joined ? { second: 0 as const } : {}) }, (result) => {
                      const next = afterTournamentGame(tourney, result.winner === 0 && !result.forfeit);
                      const over = tournamentOpponent(next) === null;
                      if (next.stage === 'won') music.sting('fanfare');
                      setTourney(over ? null : next);
                      setMessage(
                        next.stage === 'won'
                          ? `You win the tournament, ${result.score[0]}-${result.score[1]} over ${opponent.name} in the final.`
                          : next.stage === 'out'
                            ? `Out of the tournament: ${result.score[0]}-${result.score[1]} against ${opponent.name}.`
                            : `Into the final, ${result.score[0]}-${result.score[1]} over ${opponent.name}. You meet ${teamOf(league, next.finalist).name}.`,
                      );
                      setPrefs(loadPrefs());
                      setPlaying(false);
                    });
                  },
                  {
                    primary: true,
                    wide: true,
                    icon: 'prestige',
                    detail: `The other semi-final: ${teamOf(league, tourney.others[0]).name} against ${teamOf(league, tourney.others[1]).name}; ${teamOf(league, tourney.finalist).name} went through. Played on ${rinkInfo(exRink).name}.`,
                  },
                ),
                { key: 'tourney-stop', label: 'Give up the tournament', detail: 'It counts for nothing either way.', onSelect: () => setTourney(null) },
              ]
            : [
                {
                  key: 'tourney',
                  label: <OptionCard icon="trophy" name="Tournament" value="A four-team knockout" chip="Start" />,
                  detail: 'A four-team knockout against the three teams nearest your strength: a semi-final, then the final, on the rink chosen below. One player, or two on the same team. It counts for nothing.',
                  onSelect: () => {
                    const made = newTournament(league, String(Date.now()));
                    setTourney(made);
                    if (made) setMessage(`Tournament: you play ${teamOf(league, made.semi).name}; ${teamOf(league, made.finalist).name} wait in the final.`);
                  },
                },
              ]),
          tile('lesson', 'First skate', 'The moves, one at a time', () => startLesson(app), {
            icon: 'training',
            wide: true,
            detail: 'About two minutes on the practice rink: skate, shoot, pass, one-timer, poke check and body check, each asked for once or twice with a line saying what it is for. It ends by itself.',
          }),
          tile(
            'practice',
            'Practice rink',
            'No clock, nothing at stake',
            () => {
              const opponent = opponents[0];
              const homeTeam = dress(league, team);
              const away = opponent ? dress(league, opponent) : null;
              if (!opponent || !homeTeam || !away) return;
              setPlaying(true);
              const homeColour = jerseyColour(f);
              playMatch({ periodSeconds: periodSecondsOf(f), assists: assistStrengths(f), home: homeTeam, away, homeColour, awayColour: teamColour(away.name, homeColour), rink: exRink, practice: true, powerups: practicePowerups, forfeitNote: 'Leave the practice rink?', ...(joined ? { second: 0 as const } : {}) }, () => {
                setScreen({ name: 'home' });
                setMessage('Back from the practice rink.');
                setPrefs(loadPrefs());
                setPlaying(false);
              });
            },
            {
              icon: 'training',
              wide: true,
              detail: `Skate, shoot, pass and check against ${opponents[0]?.name ?? 'the weakest team'} for as long as you like: no clock, no periods, nothing recorded. ${practicePowerups.map((p) => p.name).join(' and ')} are loaded on the powerup buttons, and the hints run whatever your setting. A thin circle shows how far your poke check reaches. Leave from the pause menu.`,
            },
          ),
          {
            key: 'mode',
            label: <OptionCard icon={exShootout ? 'target' : 'game'} name="Play" value={exShootout ? 'A shootout' : 'A game'} chip="Change" />,
            detail: 'Press to change. A shootout: five turns each, one skater against the goalie from centre ice, nine seconds a turn; level after five, it goes on until one scores and the other does not. With two players, each takes turns.',
            onSelect: () => setExShootout(!exShootout),
          },
          ...(exShootout
            ? []
            : [
                {
                  key: 'rink',
                  label: (
                    <OptionCard icon="rink" name="Rink" value={rinkInfo(exRink).name} chip="Change">
                      <RinkOutline {...rinkShape(exRink)} />
                    </OptionCard>
                  ),
                  detail: `${rinkInfo(exRink).describe} Press to change.`,
                  onSelect: () => setExRink(nextRink(exRink).id),
                },
              ]),
          ...(joined
            ? [
                {
                  key: 'together',
                  label: `Two players: ${together === 'coop' ? 'Co-op (same team)' : 'Versus (head to head)'}`,
                  detail: 'Press to change. Co-op: both of you play for your team. Versus: player 2 plays for the team you pick below.',
                  onSelect: () => setTogether(together === 'coop' ? 'versus' : 'coop'),
                },
                {
                  key: 'leave',
                  label: 'Player 2: leave',
                  detail: 'Back to one player. The second controller can join again by pressing a button.',
                  onSelect: () => {
                    dropSecond();
                    setJoined(false);
                  },
                },
              ]
            : []),
          ...opponents.map((opponent) => {
          const best = rosterOf(league, opponent)[0];
          return {
            key: opponent.id,
            label: (
              <span class="team-row">
                <CrestBadge crest={teamCrest(opponent.name)} size={24} />
                <span class="tname">{opponent.name}</span>
                <span>average {Math.round(teamStrength(league, opponent.id))}</span>
                {best && (
                  <span>
                    best: <Grade player={best} /> {best.name}
                  </span>
                )}
              </span>
            ),
            onSelect: () => {
              const homeTeam = dress(league, team);
              const away = dress(league, opponent);
              if (!homeTeam || !away) return;
              setPlaying(true);
              const homeColour = jerseyColour(f);
              playMatch({ periodSeconds: periodSecondsOf(f), assists: assistStrengths(f), home: homeTeam, away, homeColour, awayColour: teamColour(away.name, homeColour), rink: exRink, shootout: exShootout, ...(joined ? { second: together === 'coop' ? (0 as const) : (1 as const) } : {}) }, (result) => {
                const what = exShootout ? 'Shootout' : 'Exhibition';
                const verdict = result.winner === 0 ? 'won' : result.winner === 1 ? 'lost' : 'tied';
                setScreen({ name: 'home' });
                setMessage(result.forfeit ? `${what} against ${opponent.name} ended early.` : `${what}: ${verdict} ${result.score[0]}-${result.score[1]} against ${opponent.name}.`);
                setPrefs(loadPrefs());
                setPlaying(false);
              });
            },
          };
          }),
        ]}
      />
    );
  }

  if (screen.name === 'powerups') {
    const counts = new Map<string, number>();
    for (const id of season.powerups) counts.set(id, (counts.get(id) ?? 0) + 1);
    return (
      <Menu
        key={screenKey}
        title="Powerups"
        message={message}
        header={
          <>
            <div>{season.signature ? 'Your own powerup stays on LT all season. The ones in the bag, from shops and wins, go on RB and are used up when triggered; anything left over is lost at the end of the season.' : 'Used up when triggered in a game. Anything left over is lost at the end of the season.'}</div>
            {loadoutLine}
          </>
        }
        onBack={home}
        help="A load on a button · B back"
        items={[
          ...BUTTONS.map((button, slot) => {
            if (slot === 0 && season.signature) {
              const own = powerupInfo(season.signature);
              return tile('slot-own', `${button} button`, `${own.name} · yours all season`, () => undefined, {
                icon: powerupIcon(season.signature),
                primary: true,
                detail: `${own.description} Never used up: it can be used again ${rules.signatureRechargeSeconds} seconds of play after it ends.`,
              });
            }
            const id = season.loadout[slot];
            return tile(`slot-${slot}`, `${button} button`, id ? powerupInfo(id).name : 'Empty', () => go({ name: 'load', slot }), {
              icon: id ? powerupIcon(id) : 'powerups',
              primary: true,
              detail: id ? powerupInfo(id).description : 'Nothing loaded on this button. Press A to choose.',
            });
          }),
          ...[...counts.entries()].map(([id, count]) => {
            const p = powerupInfo(id);
            return tile(id, p.name, count > 1 ? `×${count} in the bag` : 'In the bag', () => undefined, { icon: powerupIcon(id), detail: p.description, disabled: true });
          }),
        ]}
      />
    );
  }

  if (screen.name === 'load') {
    const distinct = [...new Set(season.powerups)];
    return (
      <Menu
        key={screenKey}
        title={`${BUTTONS[screen.slot]} powerup`}
        header={distinct.length === 0 ? 'Your bag is empty. Win games, visit shops or take your chances at events.' : 'Choose what this button triggers in the next game.'}
        onBack={() => go({ name: 'powerups' })}
        items={[
          { key: 'none', label: 'Nothing', onSelect: () => after(setLoadout(f, screen.slot, null), { name: 'powerups' }) },
          ...distinct.map((id) => {
            const p = powerupInfo(id);
            const count = season.powerups.filter((x) => x === id).length;
            return tile(id, p.name, count > 1 ? `×${count}` : '', () => after(setLoadout(f, screen.slot, id), { name: 'powerups' }), { icon: powerupIcon(id), detail: p.description });
          }),
        ]}
      />
    );
  }

  if (screen.name === 'artifacts') {
    return (
      <Menu
        key={screenKey}
        title="Artifacts"
        header={f.artifacts.length === 0 ? 'None yet. Beat a boss or win an elite game to earn one.' : 'Yours for this season.'}
        onBack={home}
        help="B back"
        items={f.artifacts.map((id) => {
          const a = artifactInfo(id);
          const left = bargainGames(f, id);
          const half = recipeFor(id);
          const chips: ArtChip[] = [
            ...(left > 0 ? [{ text: `Handicap · ${left} to go`, tone: 'bargain' as const }] : []),
            ...(half ? [{ text: `+ ${artifactInfo(half.partner).name} = ${artifactInfo(half.makes).name}`, tone: 'recipe' as const }] : []),
          ];
          return {
            key: id,
            label: <ArtifactCard name={a.name} description={a.description} modifiers={left > 0 && a.bargain ? a.bargain.handicap : a.modifiers} chips={chips} />,
            detail: `${a.description}${half ? ` With ${artifactInfo(half.partner).name} it becomes ${artifactInfo(half.makes).name}.` : ''}`,
          };
        })}
      />
    );
  }

  return undefined;
}
