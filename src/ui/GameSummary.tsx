import type { Crest } from '../core/crest';
import { MASCOT_ID } from '../core/mascot';
import type { DressedTeam } from '../core/matchup';
import { portraitOf } from '../core/portrait';
import { threeStars } from '../core/stars';
import type { GameResult, PlayerLine, MascotLine } from '../sim/match';
import { CrestBadge } from './Crest';
import { Icon } from './Icon';
import { PortraitFace } from './Portrait';

interface Props {
  result: GameResult | null;
  /** The two dressed teams, so players can be shown by name. */
  teams: [DressedTeam, DressedTeam];
  /** Each team's crest, in the colours it wore. */
  crests: [Crest, Crest];
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
          {named(p)?.name ?? 'Goalie'} (G): {p.saves} saves, {p.goalsAgainst} against
        </div>
      ))}
    </div>
  );
}

/** End-of-game screen: both crests and the score, the three stars of the game, and every player's line. */
export function GameSummary({ result, teams, crests }: Props) {
  if (!result || !result.finished) return null;
  const [you, them] = result.score;
  const verdict = result.winner === 0 ? 'Victory' : result.winner === 1 ? 'Defeat' : 'Tie';
  const stars = threeStars(result);
  return (
    <div class="summary">
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
                  <span class="mascot-face" style={{ width: '34px', height: '34px' }}>
                    <Icon name="mascot" size={24} />
                  </span>
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

      <div class="summary-teams">
        <TeamTable team={teams[0]} crest={crests[0]} players={result.players.filter((p) => p.team === 0)} mascot={result.mascots?.[0] ?? null} />
        <TeamTable team={teams[1]} crest={crests[1]} players={result.players.filter((p) => p.team === 1)} mascot={result.mascots?.[1] ?? null} />
      </div>
      <div class="summary-again">Press A, Z or Pass to continue</div>
    </div>
  );
}
