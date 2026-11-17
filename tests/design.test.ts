import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { skatersOn, userTeam } from '../src/core/league';
import { winChance } from '../src/core/quickGame';
import { dressedStrength } from '../src/core/quickSeason';
import { franchiseOf, fromSave, SAVE_VERSION, toSave } from '../src/core/save';
import {
  availableStops,
  canSimulate,
  DIFFICULTIES,
  difficultyInfo,
  matchup,
  newFranchise,
  recordGame,
  setDifficulty,
  setSeasonLineupSlot,
  simulateGame,
  startSeason,
  travel,
  type Franchise,
} from '../src/core/season';
import { colourDistance, lighten, teamColour } from '../src/core/teamColours';
import prestigeRules from '../src/data/prestige.json';
import rules from '../src/data/season.json';
import sets from '../src/data/sets.json';
import colourRules from '../src/data/teamColours.json';
import { resolveCheck } from '../src/sim/check';
import { resolveLoosePuck } from '../src/sim/contact';
import type { GameResult, PlayerLine } from '../src/sim/match';
import type { Modifier } from '../src/sim/modifiers';
import { defaultGoalieRatings, defaultSkaterRatings } from '../src/sim/ratings';
import { shotSpeed, stepShooting } from '../src/sim/shot';
import { clearAhead } from '../src/sim/team';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent } from '../src/sim/types';
import { createWorld, step, STEPS_PER_SECOND, type TeamSetup } from '../src/sim/world';
import { clearIce, giveTo, ID, place, player } from './helpers';

const fresh = (seed = 'design', difficulty?: string): Franchise => newFranchise(generateLeague(seed), difficulty);
const atFirstGame = (seed = 'design', difficulty?: string): Franchise => {
  const f = fresh(seed, difficulty);
  startSeason(f);
  travel(f, availableStops(f).find((s) => s.kind === 'game')!.id);
  return f;
};
const line = (index: number, over: Partial<PlayerLine> = {}): PlayerLine => ({
  id: index,
  team: 0,
  role: index === 6 ? 'goalie' : 'skater',
  line: index >= 3 && index < 6 ? 1 : 0,
  slot: index === 6 ? 0 : index % 3,
  goals: 0,
  assists: 0,
  shots: 0,
  hits: 0,
  blocks: 0,
  timeOnIce: 100,
  saves: 0,
  goalsAgainst: 0,
  ...over,
});
const game = (won: boolean): GameResult => ({
  score: won ? [5, 0] : [1, 3],
  winner: won ? 0 : 1,
  finished: true,
  overtime: false,
  periods: 3,
  players: [0, 1, 2, 3, 4, 5, 6].map((i) => line(i)),
  powerupsUsed: [],
});

describe('difficulty', () => {
  it('there are four levels, and a new franchise starts on the standard one unless told otherwise', () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(['rookie', 'semipro', 'pro', 'allstar']);
    expect(fresh().difficulty).toBe(rules.startingDifficulty);
    expect(fresh('design', 'allstar').difficulty).toBe('allstar');
    expect(fresh('design', 'nonsense').difficulty).toBe(rules.startingDifficulty);
    expect(difficultyInfo('pro').levelShift).toBe(0);
  });

  it('shifts how sharp the opponent is by the amount in the table, and changes nothing else', () => {
    const at = (id: string) => matchup(atFirstGame('level', id))!;
    const pro = at('pro');
    for (const d of DIFFICULTIES) {
      const m = at(d.id);
      expect(m.level).toBeCloseTo(Math.max(0, Math.min(1, pro.level + d.levelShift)));
      expect(dressedStrength(m.away)).toBeCloseTo(dressedStrength(pro.away));
      expect(dressedStrength(m.home)).toBeCloseTo(dressedStrength(pro.home));
    }
    expect(at('rookie').level).toBeLessThan(pro.level);
    expect(at('allstar').level).toBeGreaterThan(pro.level);
  });

  it('the level never leaves the range 0 to 1, even on top of prestige', () => {
    const f = atFirstGame('clamp', 'allstar');
    f.prestige.level = prestigeRules.maxLevel;
    f.season.phase = 'playoffs';
    f.season.playoffs = { round: 1, wins: 0, losses: 0, opponentId: f.league.teams[3]!.id };
    expect(matchup(f)!.level).toBe(1);
  });

  it('can be changed between seasons but not during one', () => {
    const f = fresh();
    expect(setDifficulty(f, 'rookie').ok).toBe(true);
    expect(f.difficulty).toBe('rookie');
    expect(setDifficulty(f, 'legend').ok).toBe(false);
    startSeason(f);
    const refused = setDifficulty(f, 'allstar');
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/between seasons/);
    expect(f.difficulty).toBe('rookie');
  });

  it('an older save (version 5) loads on the standard level', () => {
    const { difficulty: _d, ...older } = fresh('old-save', 'allstar');
    const loaded = fromSave(JSON.parse(JSON.stringify({ schemaVersion: 5, savedAt: 'then', ...older })));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.schemaVersion).toBe(SAVE_VERSION);
    expect(franchiseOf(loaded.save).difficulty).toBe(rules.startingDifficulty);
    const round = fromSave(JSON.parse(JSON.stringify(toSave(fresh('round', 'rookie'), 'now'))));
    expect(round.ok && franchiseOf(round.save).difficulty).toBe('rookie');
  });
});

describe('simulating a game', () => {
  it('is offered for ordinary map games only: bosses and playoff games have to be played', () => {
    const f = atFirstGame('sim');
    expect(canSimulate(f)).toBe(true);
    const boss = atFirstGame('sim');
    boss.season.current = Object.values(boss.season.map!.stops).find((s) => s.kind === 'boss')!.id;
    expect(canSimulate(boss)).toBe(false);
    const refused = simulateGame(boss);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/played/);
    const playoffs = fresh('sim');
    startSeason(playoffs);
    playoffs.season.phase = 'playoffs';
    playoffs.season.playoffs = { round: 0, wins: 0, losses: 0, opponentId: playoffs.league.teams[3]!.id };
    expect(simulateGame(playoffs).ok).toBe(false);
    expect(simulateGame(fresh('sim')).ok).toBe(false);
  });

  it('gives the same result every time for the same franchise', () => {
    const a = atFirstGame('same');
    const b = atFirstGame('same');
    expect(simulateGame(a)).toEqual(simulateGame(b));
    expect(a).toEqual(b);
  });

  it('counts as a game in every way: the season moves on, with XP, cash, a strike or a pack', () => {
    let wins = 0;
    let losses = 0;
    for (let i = 0; i < 40; i++) {
      const f = atFirstGame(`flow-${i}`);
      const cash = f.cash;
      const result = simulateGame(f);
      expect(result.ok).toBe(true);
      expect(f.season.gamesPlayed).toBe(1);
      expect(f.cash).toBeGreaterThan(cash);
      expect(Object.values(f.season.xp).reduce((s, v) => s + v, 0)).toBeGreaterThan(0);
      expect(f.season.current).toBe(null);
      if (f.season.gamesWon === 1) {
        wins++;
        expect(f.packs.length).toBeGreaterThanOrEqual(1);
        expect(f.season.strikes).toBe(0);
      } else {
        losses++;
        expect(f.season.strikes).toBe(1);
      }
    }
    expect(wins).toBeGreaterThan(0);
    expect(losses).toBeGreaterThan(0);
  });

  it('counts your team a few rating points weaker, so you win less often than the teams deserve', () => {
    expect(rules.simPenalty).toBeGreaterThan(0);
    expect(winChance(-rules.simPenalty)).toBeLessThan(0.5);
    let wins = 0;
    let fair = 0;
    let penalised = 0;
    const games = 400;
    for (let i = 0; i < games; i++) {
      const f = atFirstGame(`odds-${i}`);
      const m = matchup(f)!;
      const edge = dressedStrength(m.home) - dressedStrength(m.away) - (m.level - 0.5) * 15;
      fair += winChance(edge);
      penalised += winChance(edge - rules.simPenalty);
      simulateGame(f);
      wins += f.season.gamesWon;
    }
    expect(penalised).toBeLessThan(fair);
    expect(Math.abs(wins - penalised) / games).toBeLessThan(0.07);
  });
});

describe('what a game earned', () => {
  it('a recorded game reports cash, Pucks, XP for every player, the pack and the milestones, and they match what was added', () => {
    const f = atFirstGame('rewards');
    // Not a cup tie: the cup pays a little of its own (tests/town.test.ts).
    delete f.season.cup;
    f.season.gamesWon = 3;
    f.season.gamesPlayed = 4;
    const cash = f.cash;
    const result = recordGame(f, game(true));
    expect(result.ok).toBe(true);
    const r = result.rewards!;
    expect(r.won).toBe(true);
    expect(r.score).toEqual([5, 0]);
    expect(r.cash).toBe(f.cash - cash);
    expect(r.pucks).toBe(f.season.currency - rules.startingCurrency);
    expect(r.pucks).toBe(rules.winCurrency + rules.maxMarginCurrency);
    const roster = userTeam(f.league).roster;
    expect(r.xp.map((x) => x.id)).toEqual(roster);
    for (const x of r.xp) {
      expect(x.earned).toBeCloseTo(f.season.xp[x.id]!);
      expect(x.earned).toBeGreaterThan(0);
    }
    expect(r.pack).toMatch(/pack/i);
    expect(f.packs.length).toBe(1 + r.milestones.length);
    expect(r.milestones.length).toBeGreaterThanOrEqual(1);
    expect(result.ok && result.message).toMatch(/Pucks/);
  });

  it('a loss reports no pack and no Pucks, and an unfinished game reports nothing', () => {
    const f = atFirstGame('rewards');
    const r = recordGame(f, game(false)).rewards!;
    expect(r.won).toBe(false);
    expect(r.pack).toBe(null);
    expect(r.pucks).toBe(0);
    expect(r.milestones).toEqual([]);
    const g = atFirstGame('rewards');
    expect(recordGame(g, { ...game(true), finished: false }).rewards).toBeUndefined();
  });
});

describe('swapping the spare', () => {
  it('between games the spare can come in for a dressed skater, and the dressed list follows', () => {
    const f = atFirstGame('spare');
    const team = userTeam(f.league);
    const spare = skatersOn(f.league, team).find((p) => !f.season.dressed.includes(p.id))!;
    const out = team.lineup.line1[1]!;
    f.season.bumps[out] = 3;
    expect(setSeasonLineupSlot(f, 0, 1, spare.id).ok).toBe(true);
    expect(team.lineup.line1[1]).toBe(spare.id);
    expect(f.season.dressed).toContain(spare.id);
    expect(f.season.dressed).not.toContain(out);
    expect(f.season.dressed).toHaveLength(7);
    // The next game is played with him, and the training bump stays with the player who earned it.
    expect(matchup(f)!.home.players.some((p) => p.id === spare.id)).toBe(true);
    expect(f.season.bumps[out]).toBe(3);
    // And he can go back in.
    expect(setSeasonLineupSlot(f, 0, 1, out).ok).toBe(true);
    expect(f.season.dressed).toContain(out);
  });

  it('the goalie cannot be put in a skater spot', () => {
    const f = atFirstGame('spare');
    const team = userTeam(f.league);
    expect(setSeasonLineupSlot(f, 0, 0, team.lineup.goalie!).ok).toBe(false);
    expect(setSeasonLineupSlot(f, 0, 0, 'nobody').ok).toBe(false);
  });
});

describe('team colours', () => {
  it('every team gets a colour from the palette, the same every time', () => {
    const league = generateLeague('colours');
    for (const team of league.teams) {
      const colour = teamColour(team.name);
      expect(colourRules.palette).toContain(colour);
      expect(teamColour(team.name)).toBe(colour);
    }
    expect(new Set(league.teams.map((t) => teamColour(t.name))).size).toBeGreaterThan(4);
  });

  it('is never close to the colour the other side is wearing', () => {
    const league = generateLeague('colours');
    for (const jersey of [...prestigeRules.jerseys.map((j) => j.colour), ...colourRules.palette]) {
      for (const team of league.teams) {
        expect(colourDistance(teamColour(team.name, jersey), jersey)).toBeGreaterThanOrEqual(colourRules.minDistance);
      }
    }
  });

  it('can be lightened for a goalie or trim', () => {
    expect(lighten('#000000', 0.5)).toBe('#808080');
    expect(lighten('#102030', 0)).toBe('#102030');
    expect(lighten('#102030', 1)).toBe('#ffffff');
  });
});

describe('real set bonuses on the ice', () => {
  const t = cloneTuning();
  t.aimAssist.strength = 0;
  const setup = (own: Modifier[] = []): TeamSetup => ({
    skaters: Array.from({ length: 6 }, () => ({ ...defaultSkaterRatings })),
    goalie: { ...defaultGoalieRatings },
    skaterModifiers: [own],
  });
  /** Sends every skater not listed to the bench, so only the ones named are on the ice. */
  const bench = (world: ReturnType<typeof createWorld>, keep: number[]): void => {
    for (const p of world.players) if (p.role === 'skater' && !keep.includes(p.id)) p.onIce = false;
  };
  const bonus = (set: string): Modifier[] => sets.find((s) => s.id === set)!.bonuses.find((b) => b.pieces === 4)!.modifiers as Modifier[];

  it('the three new abilities are off for a player without the set', () => {
    const world = createWorld(t, 'off', { human: false });
    for (const p of world.players) {
      expect(p.fx.oneTimerScale).toBe(1);
      expect(p.fx.bigHitKnock).toBe(0);
      expect(p.fx.breakawaySpeedScale).toBe(1);
    }
  });

  it('Sniper: receiving a pass opens a short window, and it closes again', () => {
    const world = createWorld(t, 'window', { human: false, teams: [setup(bonus('sniper')), setup()] });
    clearIce(world, [ID.home1]);
    const p = place(world, ID.home1, 0, 0);
    world.puck.pos = { x: 0.5, y: 0 };
    world.puck.vel = { x: -1, y: 0 };
    world.puck.passTarget = ID.home1;
    world.puck.lastTeam = 0;
    resolveLoosePuck(world, t, []);
    expect(world.puck.carrier).toBe(ID.home1);
    expect(p.oneTimer).toBe(t.shot.oneTimerWindow);
    for (let i = 0; i < STEPS_PER_SECOND * (t.shot.oneTimerWindow + 0.1); i++) step(world, NO_INPUT, t);
    expect(p.oneTimer).toBe(0);
    // Picking up a loose puck that was not a pass to him opens no window.
    const other = createWorld(t, 'window', { human: false, teams: [setup(bonus('sniper')), setup()] });
    clearIce(other, [ID.home1]);
    place(other, ID.home1, 0, 0);
    other.puck.pos = { x: 0.3, y: 0 };
    other.puck.vel = { x: 0, y: 0 };
    resolveLoosePuck(other, t, []);
    expect(player(other, ID.home1).oneTimer).toBe(0);
  });

  it('Sniper: a quick shot inside the window is as hard as a full wind-up, and harder still', () => {
    const shoot = (window: number, own: Modifier[]): number => {
      const world = createWorld(t, 'one-timer', { teams: [setup(own), setup()] });
      clearIce(world, [ID.home1]);
      place(world, ID.home1, 0, 0);
      giveTo(world, ID.home1);
      world.human!.controlled = ID.home1;
      player(world, ID.home1).oneTimer = window;
      step(world, { ...NO_INPUT, shoot: true }, t);
      const events = step(world, NO_INPUT, t);
      const shot = events.find((e): e is Extract<SimEvent, { type: 'shot' }> => e.type === 'shot');
      return shot!.speed;
    };
    const tap = shoot(0, bonus('sniper'));
    const oneTimer = shoot(0.4, bonus('sniper'));
    const noSet = shoot(0.4, []);
    const power = player(createWorld(t, 'p', { teams: [setup(), setup()] }), ID.home1).fx.shotPower;
    expect(tap).toBeCloseTo(shotSpeed(0, power, t));
    // Without the set it is still a one-timer: a full wind-up. The set makes it harder on top, by what the table says.
    const harder = sets.find((x) => x.id === 'sniper')!.bonuses[1]!.modifiers[0]!.value;
    expect(harder).toBeGreaterThan(1);
    expect(noSet).toBeCloseTo(shotSpeed(t.shot.chargeTime, power, t) * t.shot.oneTimerPower);
    expect(oneTimer).toBeCloseTo(shotSpeed(t.shot.chargeTime, power, t) * t.shot.oneTimerPower * harder);
    expect(oneTimer).toBeGreaterThan(tap * 1.5);
  });

  it('the shot rule itself: a one-timer counts as fully charged', () => {
    const world = createWorld(t, 'rule', { human: false });
    const p = player(world, ID.home1);
    p.shootHeld = true;
    p.charge = 0.05;
    const speed = stepShooting(p, true, world.puck, NO_INPUT, { shotPower: 0.7, accuracy: 1, oneTimer: 1.2 }, t, world.rng, 1 / 60);
    expect(speed).toBeCloseTo(shotSpeed(t.shot.chargeTime, 0.7, t) * 1.2);
  });

  it('Enforcer: a body check at high closing speed always frees the puck; a slow one does not', () => {
    const never = cloneTuning();
    never.check.bodyBaseChance = 0;
    never.check.ratingSwing = 0;
    const hit = (closing: number, own: Modifier[]): boolean => {
      const world = createWorld(never, 'big-hit', { human: false, teams: [setup(), setup(own)] });
      clearIce(world, [ID.home1, ID.away1]);
      place(world, ID.home1, 0, 0);
      giveTo(world, ID.home1);
      const checker = place(world, ID.away1, never.check.bodyRange * 0.6, 0, Math.PI);
      checker.vel = { x: -closing, y: 0 };
      const events: SimEvent[] = [];
      resolveCheck(world, checker, true, never, events);
      const check = events.find((e): e is Extract<SimEvent, { type: 'check' }> => e.type === 'check')!;
      expect(check.kind).toBe('body');
      return check.success;
    };
    const fast = never.check.bigHitClosingSpeed + 1;
    const slow = (never.check.minClosingSpeed + never.check.bigHitClosingSpeed) / 2;
    expect(hit(fast, bonus('enforcer'))).toBe(true);
    expect(hit(slow, bonus('enforcer'))).toBe(false);
    expect(hit(fast, [])).toBe(false);
  });

  it('Burner: faster with the puck on a breakaway, and not with a defender in the way', () => {
    const topSpeed = (own: Modifier[], defender: boolean): number => {
      const world = createWorld(t, 'breakaway', { teams: [setup(own), setup()] });
      bench(world, defender ? [ID.home1, ID.away1] : [ID.home1]);
      place(world, ID.home1, -20, 0);
      giveTo(world, ID.home1);
      world.human!.controlled = ID.home1;
      if (defender) place(world, ID.away1, 24, 9);
      let best = 0;
      for (let i = 0; i < STEPS_PER_SECOND * 3; i++) {
        step(world, { ...NO_INPUT, moveX: 1 }, t);
        if (defender) place(world, ID.away1, 24, 9);
        const p = player(world, ID.home1);
        if (world.puck.carrier === ID.home1) best = Math.max(best, Math.hypot(p.vel.x, p.vel.y));
      }
      return best;
    };
    const plain = topSpeed([], false);
    const clear = topSpeed(bonus('burner'), false);
    const blocked = topSpeed(bonus('burner'), true);
    const faster = sets.find((x) => x.id === 'burner')!.bonuses[1]!.modifiers[0]!.value;
    expect(clear).toBeGreaterThan(plain * (1 + (faster - 1) * 0.6));
    expect(blocked).toBeCloseTo(plain, 1);
  });

  it('a breakaway means no opposing skater between him and the net he attacks', () => {
    const world = createWorld(t, 'ahead', { human: false });
    bench(world, [ID.home1, ID.away1]);
    const p = place(world, ID.home1, 0, 0);
    place(world, ID.away1, 5, 3);
    expect(clearAhead(world, p)).toBe(false);
    place(world, ID.away1, -5, 3);
    expect(clearAhead(world, p)).toBe(true);
    // Team 1 attacks the other way.
    expect(clearAhead(world, player(world, ID.away1))).toBe(true);
    place(world, ID.home1, -9, 0);
    expect(clearAhead(world, player(world, ID.away1))).toBe(false);
  });
});
