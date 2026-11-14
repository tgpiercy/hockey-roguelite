// Runs franchises for many seasons with an automatic manager and reports whether the league stays healthy.
//
//   npm run seasons -- --seeds 20 --years 20
//
// Games are settled quickly from team strength rather than simulated, so this takes seconds.
import { createServer } from 'vite';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const seeds = Number(option('seeds', 20));
const years = Number(option('years', 20));

const server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const harness = await server.ssrLoadModule('/tests/harness/seasons.ts');
  const started = Date.now();
  const runs = [];
  for (let i = 0; i < seeds; i++) runs.push(harness.runFranchise(`seasons-${i}`, years));
  console.log(harness.formatSeasons(harness.summarise(runs), seeds));
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
} finally {
  await server.close();
}
