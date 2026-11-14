// Plays all-AI games with no drawing and reports how the two teams did.
//
//   npm run balance -- --games 200 --home 90 --away 70
//
// Options: --games N (default 200), --home R and --away R (team ratings, default 70),
//          --level L (AI level 0 to 1, default 0.5), --seed TEXT (default "balance"),
//          --naive (team A is a scripted stand-in for a simple human player instead of the AI).
import { createServer } from 'vite';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const games = Number(option('games', 200));
const home = Number(option('home', 70));
const away = Number(option('away', 70));
const level = Number(option('level', 0.5));
const seed = String(option('seed', 'balance'));

// Vite loads the TypeScript and JSON for us, so no build step or extra dependency is needed.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const harness = await server.ssrLoadModule('/tests/harness/harness.ts');
  const started = Date.now();
  const report = () => harness.runSeries(games, harness.uniformTeam(home), harness.uniformTeam(away), seed, { level });
  if (args.includes('--naive')) {
    // A scripted stand-in for a simple human player (team A) against the AI (team B).
    const bot = await server.ssrLoadModule('/tests/harness/bot.ts');
    const r = bot.runNaiveSeries(games, harness.uniformTeam(home), harness.uniformTeam(away), seed, level);
    console.log(`Naive player rated ${home} against AI rated ${away}, AI level ${level}: ${r.games} games`);
    console.log(`  player wins ${r.wins}, loses ${r.losses}, ties ${r.ties}`);
    console.log(`  goals per game   player ${r.goalsFor.toFixed(2)}  AI ${r.goalsAgainst.toFixed(2)}`);
  } else {
    console.log(harness.formatReport(`A rated ${home} against B rated ${away}, AI level ${level}`, report()));
  }
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} finally {
  await server.close();
}
