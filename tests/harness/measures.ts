import { bossInfo } from '../../src/core/bosses';
import { abilityModifiers, boostedRatings, gearModifiers, generateItem, itemModifiers } from '../../src/core/gear';
import { createRng } from '../../src/core/rng';
import gearData from '../../src/data/gear.json';
import { rinkInfo, rinkTuning } from '../../src/core/rinks';
import ai from '../../src/data/ai.json';
import bosses from '../../src/data/bosses.json';
import rinks from '../../src/data/rinks.json';
import { gameResult } from '../../src/sim/match';
import type { Modifier } from '../../src/sim/modifiers';
import { cloneTuning } from '../../src/sim/tuning';
import { NO_INPUT } from '../../src/sim/types';
import { createGame, createWorld, step, STEPS_PER_SECOND, type TeamSetup } from '../../src/sim/world';
import { clearIce, giveTo, ID, place, player } from '../helpers';
import { goalLineX } from '../../src/sim/rink';
import { createNaivePlayer, standIn, type Stand } from './bot';
import { runSeries, uniformTeam } from './harness';

/**
 * Measurements that were first written as throw-away tests and are kept here so that a number in
 * docs/TUNING.md can be run again after any change: `npm run measure -- <name>`. Each returns lines of
 * text, one per row of its table.
 */

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** One AI skater alone from centre ice against a goalie of a given rating: goals in `n` tries, at each AI level. */
export function measureBreakaways(n: number): string[] {
  const t = cloneTuning();
  const lines: string[] = ['Breakaways: one AI skater in alone from centre, goals scored (no person on either team, so no goalie assist)'];
  for (const level of [0.3, 0.5, 0.65, 0.8]) {
    const cells: string[] = [];
    for (const rating of [60, 68, 76, 85]) {
      let goals = 0;
      for (let i = 0; i < n; i++) {
        const team = uniformTeam(70);
        const world = createWorld(t, `ba-${i}`, { human: false, levels: [level, level], teams: [{ ...team, goalie: { reflexes: rating, positioning: rating, reboundControl: rating, stamina: rating } }, uniformTeam(72)] });
        clearIce(world, [ID.away1]);
        place(world, ID.away1, 4, (i % 5) - 2, Math.PI);
        giveTo(world, ID.away1);
        player(world, ID.away1).vel = { x: -5, y: 0 };
        let done = false;
        for (let s = 0; s < 60 * 7 && !done; s++) {
          for (const e of step(world, NO_INPUT, t)) {
            if (e.type === 'goal') {
              goals += e.team === 1 ? 1 : 0;
              done = true;
            }
            if (e.type === 'save' && e.frozen) done = true;
          }
          if (s % 20 === 0) clearIce(world, [ID.away1]);
        }
      }
      cells.push(`goalie ${rating}: ${goals}/${n}`);
    }
    lines.push(`  level ${level}  ${cells.join('   ')}`);
  }
  return lines;
}

/** The three AI styles against each other, equal teams. */
export function measureStyles(n: number): string[] {
  const lines = ['AI styles against each other, equal teams at 70'];
  for (const [a, b] of [['rush', 'cycle'], ['rush', 'dump'], ['cycle', 'dump']] as const) {
    const r = runSeries(n, { ...uniformTeam(70), style: a }, { ...uniformTeam(70), style: b }, `styles-${a}-${b}`);
    lines.push(`  ${a} v ${b}: ${a} wins ${pct(r.winRateA)}, goals ${r.goalsPerGameA.toFixed(2)} to ${r.goalsPerGameB.toFixed(2)}, shots ${r.shotsPerGameA.toFixed(0)} to ${r.shotsPerGameB.toFixed(0)}`);
  }
  // Each against a team with no leaning at all: how strong the style is in itself.
  for (const a of ['rush', 'cycle', 'dump']) {
    const r = runSeries(n, { ...uniformTeam(70), style: a }, uniformTeam(70), `styles-${a}-plain`);
    lines.push(`  ${a} v no style: ${a} wins ${pct(r.winRateA)}, goals ${r.goalsPerGameA.toFixed(2)} to ${r.goalsPerGameB.toFixed(2)}, shots ${r.shotsPerGameA.toFixed(0)} to ${r.shotsPerGameB.toFixed(0)}`);
  }
  lines.push(`  (style numbers: ${Object.entries(ai.styles).map(([id, s]) => `${id} pass ${s.pass} long ${s.longShot} dump ${s.dump}`).join('; ')})`);
  return lines;
}

/** Each boss's trick on a 70 team against a plain 70 team (AI on both sides), and the scripted player's 67 team against a 73 team with the trick. */
export function measureBosses(n: number, who: Stand = 'script', only: string | null = null): string[] {
  const t = cloneTuning();
  const lines = [`Bosses: the trick against a plain equal team (AI v AI), and the ${who} against it`];
  for (const b of bosses) {
    if (only !== null && b.id !== only) continue;
    const mods = bossInfo(b.id).modifiers as Modifier[];
    const r = runSeries(n, { ...uniformTeam(70), modifiers: mods }, uniformTeam(70), `boss-${b.id}`);
    let wins = 0;
    let scored = 0;
    let let_in = 0;
    const games = Math.max(10, Math.round(n * 0.4));
    for (let i = 0; i < games; i++) {
      const world = createGame(t, `bb-${b.id}-${i}`, { teams: [uniformTeam(67), { ...uniformTeam(73), modifiers: mods }], levels: [null, 0.5], overtimeLimit: 300 });
      const bot = standIn(who, t, `bb-${b.id}-${i}`);
      for (let s = 0; s < 30 * 60 * STEPS_PER_SECOND && world.phase !== 'final'; s++) step(world, bot(world), t);
      const result = gameResult(world);
      if (result.winner === 0) wins++;
      scored += result.score[0];
      let_in += result.score[1];
    }
    lines.push(`  ${b.id.padEnd(14)} trick wins ${pct(r.winRateA).padStart(4)}  goals ${r.goalsPerGameA.toFixed(2)} to ${r.goalsPerGameB.toFixed(2)}   ${who} beats it ${pct(wins / games).padStart(4)}, ${(scored / games).toFixed(1)} to ${(let_in / games).toFixed(1)} (${games} games; a boss's mascot is not in this)`);
  }
  return lines;
}

/** All-AI games on every rink. */
export function measureRinks(n: number): string[] {
  const lines = ['Rinks: all-AI games, equal teams, level 0.5'];
  for (const rink of rinks.rinks) {
    if (rink.rules && 'firstTo' in rink.rules) {
      lines.push(`  ${rink.id.padEnd(14)} (no clock: not comparable by goals a game)`);
      continue;
    }
    const team: TeamSetup = uniformTeam(70);
    const r = runSeries(n, team, team, `rink-${rink.id}`, { tuning: rinkTuning(cloneTuning(), rinkInfo(rink.id)) });
    lines.push(`  ${rink.id.padEnd(14)} goals ${r.goalsPerGameA.toFixed(2)} and ${r.goalsPerGameB.toFixed(2)}  shots ${r.shotsPerGameA.toFixed(0)}  save ${r.savePct.toFixed(3)}  overtime ${pct(r.overtimeRate)}`);
  }
  return lines;
}

/**
 * Where a stand-in's shots and goals come from: by how far out and how sharp the angle, with how often the
 * other team throws a check at him while he carries in their end, and how his carries there end.
 */
export function measureCarry(n: number, level: number, who: Stand): string[] {
  const t = cloneTuning();
  const goalX = goalLineX(t);
  const bands = ['under 3 m', '3 to 6 m', '6 to 10 m', 'over 10 m'];
  const angles = ['in front', 'off to a side', 'sharp angle'];
  const shots = new Map<string, { shots: number; goals: number }>();
  const tally = (key: string): { shots: number; goals: number } => shots.get(key) ?? shots.set(key, { shots: 0, goals: 0 }).get(key)!;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let checksAt = 0;
  let checksWon = 0;
  let blocks = 0;
  let bracedAtShot = 0;
  let guardNear = 0;
  let humanShots = 0;
  let carrySeconds = 0;
  let carries = 0;
  const ends = { shot: 0, checked: 0, other: 0 };
  for (let g = 0; g < n; g++) {
    const world = createGame(t, `carry-${g}`, { teams: [uniformTeam(67), uniformTeam(70)], levels: [null, level], overtimeLimit: 300 });
    const player = standIn(who, t, `carry-${g}`);
    let last: string | null = null;
    let carrying = false;
    for (let i = 0; i < 30 * 60 * STEPS_PER_SECOND && world.phase !== 'final'; i++) {
      const me = world.human ? world.players[world.human.controlled] : undefined;
      const inZone = me !== undefined && world.puck.carrier === me.id && me.pos.x > goalX - 10 && world.phase === 'play';
      if (inZone) carrySeconds += 1 / STEPS_PER_SECOND;
      if (inZone && !carrying) carries += 1;
      const events = step(world, player(world), t);
      let ended: keyof typeof ends | null = null;
      for (const e of events) {
        if (e.type === 'shot' && world.players[e.player]?.team === 0) {
          const p = world.players[e.player]!;
          const dx = goalX - p.pos.x;
          const d = Math.hypot(dx, p.pos.y);
          const angle = (Math.atan2(Math.abs(p.pos.y), Math.max(0.01, dx)) * 180) / Math.PI;
          last = `${bands[d < 3 ? 0 : d < 6 ? 1 : d < 10 ? 2 : 3]}, ${angles[angle < 25 ? 0 : angle < 55 ? 1 : 2]}`;
          tally(last).shots += 1;
          ended = 'shot';
          humanShots += 1;
          const them = world.players.filter((o) => o.team === 1 && o.onIce && o.role === 'skater');
          if (them.some((o) => o.checkCharge >= t.block.braceAfterSeconds)) bracedAtShot += 1;
          // A defender between him and the net: nearer the net than he is, and within 1.5 m of the line to it.
          if (them.some((o) => o.pos.x > p.pos.x && Math.abs((goalX - p.pos.x) * (o.pos.y - p.pos.y) - (0 - p.pos.y) * (o.pos.x - p.pos.x)) / Math.max(0.01, d) < 1.5)) guardNear += 1;
        } else if (e.type === 'block' && world.players[e.player]?.team === 1) {
          blocks += 1;
        } else if (e.type === 'goal') {
          if (e.team === 0) {
            goalsFor += 1;
            if (last) tally(last).goals += 1;
          } else goalsAgainst += 1;
          last = null;
        } else if (e.type === 'check' && world.players[e.target]?.team === 0 && world.players[e.player]?.team === 1) {
          checksAt += 1;
          if (e.success) {
            checksWon += 1;
            if (carrying) ended = 'checked';
          }
        }
      }
      const still = me !== undefined && world.puck.carrier === me.id;
      if (carrying && !still) ends[ended ?? 'other'] += 1;
      carrying = inZone && still;
    }
  }
  const lines = [`Where the ${who}'s goals come from: ${n} games, a 67 team against a 70 team at level ${level}`];
  lines.push(`  goals for ${(goalsFor / n).toFixed(2)}, against ${(goalsAgainst / n).toFixed(2)} a game`);
  for (const band of bands) {
    for (const angle of angles) {
      const row = shots.get(`${band}, ${angle}`);
      if (row && row.shots >= n / 4) lines.push(`  ${`${band}, ${angle}`.padEnd(28)} ${(row.shots / n).toFixed(1).padStart(5)} shots a game, ${(row.goals / n).toFixed(2)} goals, ${pct(row.goals / row.shots)} go in`);
    }
  }
  lines.push(`  carrying in their end: ${(carries / n).toFixed(1)} times a game, ${(carrySeconds / Math.max(1, carries)).toFixed(1)} s each; ended by a shot ${pct(ends.shot / Math.max(1, carries))}, by a check ${pct(ends.checked / Math.max(1, carries))}, otherwise ${pct(ends.other / Math.max(1, carries))}`);
  lines.push(`  checks thrown at his team: ${(checksAt / n).toFixed(1)} a game, ${pct(checksWon / Math.max(1, checksAt))} take the puck`);
  lines.push(`  of his shots: a defender between him and the net ${pct(guardNear / Math.max(1, humanShots))}, one down to block ${pct(bracedAtShot / Math.max(1, humanShots))}; shots blocked ${(blocks / n).toFixed(1)} a game`);
  return lines;
}

/**
 * The shape of play that goals come out of, for a stand-in's team and the AI team against it:
 * how often a team-mate is open for a pass near the net while the stand-in carries in their end, and what
 * becomes of rebounds (who gets to them, and how many are goals inside three seconds).
 * With `who` 'idle' both teams are AI, which is the plain game with nobody's help in it.
 */
export function measureShape(n: number, level: number, who: Stand): string[] {
  const t = cloneTuning();
  const goalX = goalLineX(t);
  const allAi = who === 'idle';
  let carrySteps = 0;
  let openSteps = 0;
  let oneTimers = 0;
  const goals: [number, number] = [0, 0];
  // By the team that shot: rebounds, who got them, goals soon after.
  const reb = [0, 1].map(() => ({ rebounds: 0, won: 0, lost: 0, goals: 0, tips: 0 }));
  // By the team a goal ahead with a minute left: such games, goals it added, goals the other side got back.
  const late = [0, 1].map(() => ({ games: 0, more: 0, tied: 0 }));
  for (let g = 0; g < n; g++) {
    const world = createGame(t, `shape-${g}`, { teams: [uniformTeam(allAi ? 70 : 67), uniformTeam(70)], levels: [allAi ? level : null, level], human: !allAi, overtimeLimit: 300 });
    const player = allAi ? () => NO_INPUT : standIn(who, t, `shape-${g}`);
    // A rebound waiting to be picked up: the team that shot, and the steps since.
    let loose: { team: 0 | 1; age: number; taken: boolean } | null = null;
    // The lead (team 0's) when the last minute of the last period began.
    let lateLead: number | null = null;
    for (let i = 0; i < 30 * 60 * STEPS_PER_SECOND && world.phase !== 'final'; i++) {
      const carrier = world.puck.carrier === null ? undefined : world.players[world.puck.carrier];
      if (carrier && carrier.team === 0 && carrier.role === 'skater' && carrier.pos.x > goalX - 12 && world.phase === 'play') {
        carrySteps += 1;
        const them = world.players.filter((o) => o.team === 1 && o.onIce && o.role === 'skater');
        // Open: a team-mate within 7 m of the net and in front of it, nobody within 2 m of him, nobody within 0.8 m of the pass.
        const open = world.players.some((m) => {
          if (m.team !== 0 || !m.onIce || m.role !== 'skater' || m.id === carrier.id) return false;
          if (Math.hypot(goalX - m.pos.x, m.pos.y) > 7 || m.pos.x > goalX - 1) return false;
          if (them.some((o) => Math.hypot(o.pos.x - m.pos.x, o.pos.y - m.pos.y) < 2)) return false;
          const len = Math.hypot(m.pos.x - carrier.pos.x, m.pos.y - carrier.pos.y) || 1;
          return them.every((o) => {
            const along = ((o.pos.x - carrier.pos.x) * (m.pos.x - carrier.pos.x) + (o.pos.y - carrier.pos.y) * (m.pos.y - carrier.pos.y)) / len;
            if (along <= 0 || along >= len) return true;
            return Math.abs((o.pos.x - carrier.pos.x) * (m.pos.y - carrier.pos.y) - (o.pos.y - carrier.pos.y) * (m.pos.x - carrier.pos.x)) / len > 0.8;
          });
        });
        if (open) openSteps += 1;
      }
      if (lateLead === null && world.period === t.period.count && !world.overtime && world.clock <= ai.late.seconds) {
        lateLead = world.score[0] - world.score[1];
        if (Math.abs(lateLead) === 1) late[lateLead > 0 ? 0 : 1]!.games += 1;
      }
      const events = step(world, player(world), t);
      if (loose) (loose as { age: number }).age += 1;
      for (const e of events) {
        if (e.type === 'shot' && e.oneTimer && world.players[e.player]?.team === 0) oneTimers += 1;
        if (e.type === 'tip') reb[world.players[e.player]?.team ?? 0]!.tips += 1;
        if (e.type === 'save' && !e.frozen) {
          const shooters = (1 - (world.players[e.goalie]?.team ?? 0)) as 0 | 1;
          reb[shooters]!.rebounds += 1;
          loose = { team: shooters, age: 0, taken: false };
        } else if (e.type === 'save') loose = null;
        if (e.type === 'pickup' && loose && !loose.taken) {
          const by = world.players[e.player];
          if (by && by.role === 'skater') {
            loose.taken = true;
            if (by.team === loose.team) reb[loose.team]!.won += 1;
            else reb[loose.team]!.lost += 1;
          }
        }
        if (e.type === 'goal') {
          if (lateLead !== null && Math.abs(lateLead) === 1 && world.period === t.period.count && !world.overtime) late[lateLead > 0 ? 0 : 1]![e.team === (lateLead > 0 ? 0 : 1) ? 'more' : 'tied'] += 1;
          goals[e.team] += 1;
          if (loose && e.team === loose.team && loose.age <= 3 * STEPS_PER_SECOND) reb[loose.team]!.goals += 1;
          loose = null;
        }
      }
      if (loose && loose.age > 3 * STEPS_PER_SECOND) loose = null;
    }
  }
  const lines = [`The shape of play: ${n} games, ${allAi ? 'two AI teams of 70' : `the ${who} on a 67 team against a 70 team`}, level ${level}`];
  lines.push(`  goals ${(goals[0] / n).toFixed(2)} to ${(goals[1] / n).toFixed(2)} a game`);
  lines.push(`  team 0 carrying in their end: a team-mate open near the net ${pct(openSteps / Math.max(1, carrySteps))} of the time (${(carrySteps / n / STEPS_PER_SECOND).toFixed(0)} s a game); one-timers ${(oneTimers / n).toFixed(1)} a game`);
  for (const team of [0, 1]) {
    const r = reb[team]!;
    lines.push(`  team ${team} shooting: rebounds ${(r.rebounds / n).toFixed(1)} a game; the shooters get ${pct(r.won / Math.max(1, r.rebounds))}, the defenders ${pct(r.lost / Math.max(1, r.rebounds))}; goals inside 3 s ${(r.goals / n).toFixed(2)} a game; tips ${(r.tips / n).toFixed(1)}`);
  }
  for (const team of [0, 1]) {
    const l = late[team]!;
    lines.push(`  team ${team} a goal up with ${ai.late.seconds} s left: ${l.games} games; it scored again ${(l.more / Math.max(1, l.games)).toFixed(2)} a game, the other side ${(l.tied / Math.max(1, l.games)).toFixed(2)}`);
  }
  return lines;
}

/**
 * What gear is worth on the ice: a 70 team in which every player wears a full set of real pieces of one
 * rarity (rolled as packs roll them, with their perks and set bonuses), against a plain 70 team, all AI.
 */
export function measureGear(n: number, part: 'all' | 'ratings' | 'perks' | 'sets' = 'all'): string[] {
  const lines = [`Gear (${part === 'all' ? 'everything it gives' : `${part} only`}): a 70 team wearing a piece in every slot against a plain 70 team, AI level 0.5`];
  const plain = uniformTeam(70);
  for (const [rarity, level] of [['common', 1], ['rare', 1], ['epic', 1], ['legendary', 1], ['legendary', gearData.maxLevel]] as const) {
    const rng = createRng(`gear-worth/${rarity}/${level}`);
    let made = 0;
    const kit = (kind: 'skater' | 'goalie'): Modifier[] => {
      const items = gearData.slots[kind].map((slot) => {
        // Rolled as a pack rolls it; kept when it is for the slot wanted.
        for (;;) {
          const item = generateItem(rng, `g${made++}`, rarity, kind);
          if (item.slot === slot) return { ...item, level };
        }
      });
      // To see what each part of gear is worth: the rating points alone, the perks alone, or the set bonuses alone.
      const whole = gearModifiers(items);
      if (part === 'all') return whole;
      const points = whole.filter((m) => m.stat.startsWith('rating.'));
      if (part === 'ratings') return points;
      const perks = items.flatMap((item) => itemModifiers(item).filter((m) => !m.stat.startsWith('rating.')));
      if (part === 'perks') return perks;
      const rest = [...points, ...perks];
      return whole.filter((m) => {
        const at = rest.indexOf(m);
        if (at >= 0) rest.splice(at, 1);
        return at < 0;
      });
    };
    const skaters = plain.skaters.map(() => kit('skater'));
    const goalie = kit('goalie');
    const points = skaters.flat().filter((m) => m.stat.startsWith('rating.')).reduce((sum, m) => sum + m.value, 0) / (skaters.length * 6);
    const team: TeamSetup = {
      skaters: plain.skaters.map((r, i) => boostedRatings(r, skaters[i]!)),
      goalie: boostedRatings(plain.goalie, goalie),
      skaterModifiers: skaters.map(abilityModifiers),
      goalieModifiers: abilityModifiers(goalie),
    };
    const r = runSeries(n, team, plain, `gear-${rarity}-${level}`);
    lines.push(`  ${`${rarity}, level ${level}`.padEnd(20)} about +${points.toFixed(1)} on each skater rating   wins ${pct(r.winRateA)}   goals ${r.goalsPerGameA.toFixed(2)} to ${r.goalsPerGameB.toFixed(2)}`);
  }
  return lines;
}
