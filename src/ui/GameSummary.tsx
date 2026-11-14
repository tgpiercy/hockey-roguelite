import type { DressedTeam } from '../core/matchup';
import type { GameResult, PlayerLine } from '../sim/match';

interface Props {
  result: GameResult | null;
  /** The two dressed teams, so players can be shown by name. */
  teams: [DressedTeam, DressedTeam];
}

const minutes = (seconds: number): string => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** Where a simulation player sits in his team's dressed list: line 1, line 2, then the goalie. */
const indexInTeam = (p: PlayerLine): number => (p.role === 'goalie' ? 6 : p.line * 3 + p.slot);

function TeamTable({ team, players }: { team: DressedTeam; players: PlayerLine[] }) {
  const named = (p: PlayerLine) => team.players[indexInTeam(p)];
  const skaters = players.filter((p) => p.role === 'skater');
  const goalies = players.filter((p) => p.role === 'goalie');
  return (
    <div class="summary-team">
      <h2>{team.name}</h2>
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
            <tr key={p.id}>
              <td>{named(p)?.name ?? `Line ${p.line + 1}`}</td>
              <td>{named(p)?.position ?? ''}</td>
              <td>{p.goals}</td>
              <td>{p.assists}</td>
              <td>{p.shots}</td>
              <td>{p.hits}</td>
              <td>{minutes(p.timeOnIce)}</td>
            </tr>
          ))}
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

/** End-of-game screen: final score and every player's line. */
export function GameSummary({ result, teams }: Props) {
  if (!result || !result.finished) return null;
  const [you, them] = result.score;
  const verdict = result.winner === 0 ? 'You win' : result.winner === 1 ? 'You lose' : 'Tie';
  return (
    <div class="summary">
      <h1>
        {verdict}: {you} – {them}
        {result.overtime ? ' (OT)' : ''}
      </h1>
      <div class="summary-teams">
        <TeamTable team={teams[0]} players={result.players.filter((p) => p.team === 0)} />
        <TeamTable team={teams[1]} players={result.players.filter((p) => p.team === 1)} />
      </div>
      <div class="summary-again">Press A, Z or Pass to continue</div>
    </div>
  );
}
