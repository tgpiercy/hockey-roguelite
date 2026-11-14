import type { GameResult, PlayerLine } from '../sim/match';

interface Props {
  result: GameResult | null;
}

const minutes = (seconds: number): string => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** "L1 C" for the first line's centre, "L2 W" for a second-line winger, "G" for the goalie. */
const position = (p: PlayerLine): string => (p.role === 'goalie' ? 'G' : `L${p.line + 1} ${p.slot === 0 ? 'C' : 'W'}`);

function TeamTable({ name, players }: { name: string; players: PlayerLine[] }) {
  const skaters = players.filter((p) => p.role === 'skater');
  const goalies = players.filter((p) => p.role === 'goalie');
  return (
    <div class="summary-team">
      <h2>{name}</h2>
      <table>
        <thead>
          <tr>
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
              <td>{position(p)}</td>
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
          Goalie: {p.saves} saves, {p.goalsAgainst} against
        </div>
      ))}
    </div>
  );
}

/** End-of-game screen: final score and every player's line. */
export function GameSummary({ result }: Props) {
  if (!result || !result.finished) return null;
  const [you, cpu] = result.score;
  const verdict = result.winner === 0 ? 'You win' : result.winner === 1 ? 'You lose' : 'Tie';
  return (
    <div class="summary">
      <h1>
        {verdict}: {you} – {cpu}
        {result.overtime ? ' (OT)' : ''}
      </h1>
      <div class="summary-teams">
        <TeamTable name="You" players={result.players.filter((p) => p.team === 0)} />
        <TeamTable name="CPU" players={result.players.filter((p) => p.team === 1)} />
      </div>
      <div class="summary-again">Press A (or Z) to play again</div>
    </div>
  );
}
