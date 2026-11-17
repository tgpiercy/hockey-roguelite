// The measurements behind docs/TUNING.md, each as one command, with no drawing.
//
//   npm run measure -- defence              what a person's team gives up (script and idle)
//   npm run measure -- breakaways           a lone AI skater against a goalie, by rating and level
//   npm run measure -- styles               the three AI styles against each other
//   npm run measure -- bosses               each boss's trick, AI v AI and against the script
//   npm run measure -- rinks                all-AI games on every rink
//   npm run measure -- seasons              whole seasons with a scripted player
//   npm run measure -- gear                 what a full set of gear of each rarity is worth, all-AI
//   npm run measure -- carry                where a stand-in's shots and goals come from, and how he is defended
//   npm run measure -- all                  everything above (slow)
//
// Options: --games N (default 40; seasons: number of seasons), --level L (default 0.5),
//          --difficulty rookie|pro|allstar (seasons; default pro), --player script|novice|passer|idle (default script).
import { createServer } from 'vite';

const args = process.argv.slice(2);
const what = args.find((a) => !a.startsWith('--')) ?? 'help';
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const games = Number(option('games', 40));
const level = Number(option('level', 0.5));
const difficulty = String(option('difficulty', 'pro'));
const who = String(option('player', 'script'));

const NAMES = ['defence', 'breakaways', 'styles', 'bosses', 'rinks', 'seasons', 'carry', 'gear'];
if (what !== 'all' && !NAMES.includes(what)) {
  console.log(`Usage: npm run measure -- <${NAMES.join('|')}|all> [--games N] [--level L] [--difficulty D] [--player script|novice|passer|idle]`);
  process.exit(what === 'help' ? 0 : 1);
}

// Vite loads the TypeScript and JSON for us, so no build step or extra dependency is needed.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const measures = await server.ssrLoadModule('/tests/harness/measures.ts');
  const defence = await server.ssrLoadModule('/tests/harness/defence.ts');
  const checks = await server.ssrLoadModule('/tests/harness/checks.ts');
  const run = {
    defence: () => [
      `What a person's team gives up: ${games} games, a 67 team against a 70 team at level ${level}`,
      ...(who === 'script' ? ['script', 'idle'] : [who]).map((p) => `  ${defence.defenceLine(p, defence.measureDefence(games, level, p, 'def'))}`),
    ],
    breakaways: () => measures.measureBreakaways(Math.max(20, games)),
    styles: () => measures.measureStyles(Math.max(40, games)),
    bosses: () => measures.measureBosses(Math.max(40, games)),
    rinks: () => measures.measureRinks(Math.max(40, games)),
    gear: () => measures.measureGear(Math.max(40, games), String(option('part', 'all'))),
    carry: () => measures.measureCarry(games, level, who === 'idle' ? 'script' : who),
    seasons: () => {
      const r = checks.measureSeasons(games, difficulty, 'bench', who);
      return [
        `Seasons: ${games} on ${difficulty}, the ${who} player, a new franchise, plain choices`,
        `  first region cleared ${Math.round(r.clearedFirstRegion * 100)}%   title ${Math.round(r.champions * 100)}%   wins ${r.wins.toFixed(1)} of ${r.played.toFixed(1)} games`,
        `  how far: ${r.clearedRegions.map((share, i) => `region ${i + 1} ${Math.round((share ?? 0) * 100)}%`).join(', ')}, playoffs ${Math.round(r.playoffs * 100)}%, title ${Math.round(r.champions * 100)}%`,
        `  Pucks earned ${Math.round(r.pucksEarned)}, spent ${Math.round(r.pucksSpent)}, left ${Math.round(r.pucksLeft)}; shops reached ${r.shops.toFixed(1)}, could afford something at ${r.shopsBoughtAt.toFixed(1)}`,
      ];
    },
  };
  for (const name of what === 'all' ? NAMES : [what]) {
    const started = Date.now();
    for (const line of run[name]()) console.log(line);
    console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)\n`);
  }
} finally {
  await server.close();
}
