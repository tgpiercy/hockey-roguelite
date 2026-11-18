import { goalLines } from '../core/goalLog';
import type { Crest } from '../core/crest';
import { MASCOT_ID } from '../core/mascot';
import type { DressedTeam } from '../core/matchup';
import { portraitOf } from '../core/portrait';
import { threeStars } from '../core/stars';
import type { GameResult, PlayerLine, MascotLine } from '../sim/match';
import { CrestBadge } from './Crest';
import { Icon } from './Icon';
import { mascotKind } from '../core/mascotKind';
import { MascotFace } from './MascotFace';
import { PortraitFace } from './Portrait';

interface Props {
  result: GameResult | null;
  /** The two dressed teams, so players can be shown by name. */
  teams: [DressedTeam, DressedTeam];
  /** Each team's crest, in the colours it wore. */
  crests: [Crest, Crest];
  /** The goal of the game in words, and whether it can be watched again. */
  best?: { text: string; canWatch: boolean } | null;
}

const minutes = (seconds: number): string => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** Where a simulation player sits in his team's dressed list: line 1, line 2, then the goalie. */
const indexInTeam = (p: PlayerLine): number => (p.role === 'goalie' ? 6 : p.line * 3 + p.slot);

function TeamTable({ team, crest, players, mascot }: { team: DressedTeam; crest: Crest; players: PlayerLine[]; mascot: MascotLine | null }) {
  const named = (p: PlayerLine) => team.players[indexInTeam(p)];
  const skaters = players.filter((p) => p.role === 'skater');
  const goalies = players.filter((p) => p.role === 'goalie');
  return (
    <div class="summary-team">
      <h2>
        <CrestBadge crest={crest} size={20} /> {team.name}
      </h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th title="Goals">G</th>
            <th title="Assists">A</th>
            <th title="Shots">S</th>
            <th title="Hits">H</th>
            <th title="Time on ice">TOI</th>
          </tr>
        </thead>
        <tbody>
          {skaters.map((p) => (
            <tr key={p.id} class={p.goals > 0 ? 'scored' : ''}>
              <td>
                {named(p)?.name ?? `Line ${p.line + 1}`}
                {named(p)?.id === MASCOT_ID ? ' (mascot)' : ''}
              </td>
              <td>{named(p)?.position ?? ''}</td>
              <td>{p.goals}</td>
              <td>{p.assists}</td>
              <td>{p.shots}</td>
              <td>{p.hits}</td>
              <td>{minutes(p.timeOnIce)}</td>
            </tr>
          ))}
          {mascot && mascot.arrivals > 0 && (
            <tr class={mascot.goals > 0 ? 'scored' : ''}>
              <td>{team.setup.mascot?.name ?? 'Mascot'} (mascot)</td>
              <td></td>
              <td>{mascot.goals}</td>
              <td>{mascot.assists}</td>
              <td>{mascot.shots}</td>
              <td>{mascot.hits}</td>
              <td>{minutes(mascot.timeOnIce)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {goalies.map((p) => (
        <div class="summary-goalie" key={p.id}>
          {/* Both goalies on the same terms: rating, shots faced and the share stopped. */}
          {named(p)?.name ?? 'Goalie'} (G{named(p) ? `, rated ${named(p)!.overall}` : ''}): {p.saves} of {p.saves + p.goalsAgainst} stopped{p.saves + p.goalsAgainst > 0 ? `, ${(p.saves / (p.saves + p.goalsAgainst)).toFixed(3).replace(/^0/, '')}` : ''}
        </div>
      ))}
    </div>
  );
}

/** End-of-game screen: both crests and the score, the three stars of the game, and every player's line. */
export function GameSummary({ result, teams, crests, best }: Props) {
  if (!result || !result.finished) return null;
  const [you, them] = result.score;
  const verdict = result.winner === 0 ? 'Victory' : result.winner === 1 ? 'Defeat' : 'Tie';
  const stars = threeStars(result);
  const howScored = goalLines(result);
  return (
    <div class="summary look-b" style={{ '--home': crests[0].primary, '--away': crests[1].primary }}>
      <div class="summary-score">
        <div class="summary-side">
          <CrestBadge crest={crests[0]} size={54} />
          <span>{teams[0].name}</span>
        </div>
        <div class="summary-middle">
          <div class={`summary-verdict ${result.winner === 0 ? 'won' : result.winner === 1 ? 'lost' : ''}`}>{verdict}</div>
          <div class="summary-numbers">
            {you} <i>–</i> {them}
          </div>
          {result.overtime && <div class="summary-ot">Overtime</div>}
        </div>
        <div class="summary-side">
          <CrestBadge crest={crests[1]} size={54} />
          <span>{teams[1].name}</span>
        </div>
      </div>

      {stars.length > 0 && (
        <div class="summary-stars">
          {stars.map((star, i) => {
            const player = teams[star.team].players[star.index];
            const crest = crests[star.team];
            return (
              <div class="summary-star" key={`${star.team}-${star.index}`}>
                <span class="star-rank">
                  {Array.from({ length: 3 - i }, (_, n) => (
                    <Icon key={n} name="prestige" size={12} />
                  ))}
                </span>
                {player && player.id !== MASCOT_ID ? (
                  <PortraitFace portrait={portraitOf(player.id, player.age)} primary={crest.primary} secondary={crest.secondary} size={34} />
                ) : (
                  <MascotFace kind={mascotKind(teams[star.team].name)} primary={crest.primary} secondary={crest.secondary} size={34} />
                )}
                <span class="star-who">
                  <b>{player?.name ?? 'Player'}</b>
                  <small>{star.line}</small>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {howScored.length > 0 && (
        <div class="summary-how">
          {howScored.map((words) => (
            <div key={words}>{words}</div>
          ))}
        </div>
      )}
      <div class="summary-teams">
        <TeamTable team={teams[0]} crest={crests[0]} players={result.players.filter((p) => p.team === 0)} mascot={result.mascots?.[0] ?? null} />
        <TeamTable team={teams[1]} crest={crests[1]} players={result.players.filter((p) => p.team === 1)} mascot={result.mascots?.[1] ?? null} />
      </div>
      {best && (
        <div class="summary-again">
          Goal of the game: {best.text}.
          {best.canWatch && (
            <>
              {' '}
              <span class="glyph glyph-x">X</span> watch it again
            </>
          )}
        </div>
      )}
      <div class="summary-again summary-go">
        <span class="glyph glyph-a">A</span> Continue
      </div>
    </div>
  );
}
