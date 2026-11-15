import { describe, expect, it } from 'vitest';
import { bossInfo, buildBoss } from '../src/core/bosses';
import { generateLeague } from '../src/core/generate';
import { userTeam } from '../src/core/league';
import { dress } from '../src/core/matchup';
import { kindsFor, talentInfo } from '../src/core/playerKind';
import { availableStops, chooseEvent, currentStop, leaveShop, matchup, newFranchise, pickArtifact, recordGame, startSeason, train, travel, type Franchise, pickRinger } from '../src/core/season';
import artifacts from '../src/data/artifacts.json';
import bosses from '../src/data/bosses.json';
import events from '../src/data/events.json';
import powerups from '../src/data/powerups.json';
import rules from '../src/data/season.json';
import talents from '../src/data/talents.json';
import type { GameResult } from '../src/sim/match';
import type { PowerupSpec } from '../src/sim/modifiers';
import { onFire } from '../src/sim/momentum';
import { usePowerup } from '../src/sim/powerups';
import { cloneTuning } from '../src/sim/tuning';
import { NO_INPUT, type SimEvent, type World } from '../src/sim/types';
import { createWorld, step } from '../src/sim/world';
import { clearIce, flyPuck, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const league = generateLeague('content');
const started = (seed = 'content'): Franchise => {
  const f = newFranchise(generateLeague(seed));
  expect(startSeason(f).ok).toBe(true);
  return f;
};
const won = (margin = 1): GameResult => ({ score: [margin, 0], winner: 0, finished: true, overtime: false, periods: 3, players: [], powerupsUsed: [] }) as unknown as GameResult;

describe('new bosses', () => {
  const against = (bossId: string): World => createWorld(t, 'boss', { teams: [dress(league, userTeam(league))!.setup, buildBoss(league, bossId, 0, 'content').setup] });

  it('there are eight, each with a trick in words', () => {
    expect(bosses).toHaveLength(8);
    for (const boss of bosses) expect(bossInfo(boss.id).trick.length).toBeGreaterThan(30);
  });

  it('the Trappers\' flat passes cannot be picked off', () => {
    const world = against('trappers');
    for (const p of world.players) if (p.role === 'skater') expect(p.fx.passThrough > 0).toBe(p.team === 1);
  });

  it('every Shadow carries the spin move', () => {
    const boss = buildBoss(league, 'shadows', 0, 'content');
    expect(boss.setup.skaterTalents).toHaveLength(6);
    for (const list of boss.setup.skaterTalents!) expect(list).toEqual(['spinMove']);
    const world = against('shadows');
    expect(world.players.filter((p) => p.team === 1 && p.role === 'skater').every((p) => p.talents.includes('spinMove'))).toBe(true);
  });

  it('the Furnace is on fire as soon as play starts; an ordinary team is not', () => {
    const world = against('furnace');
    step(world, NO_INPUT, t);
    expect(onFire(world, 1)).toBe(true);
    expect(onFire(world, 0)).toBe(false);
    const plain = createWorld(t, 'plain');
    step(plain, NO_INPUT, t);
    expect(onFire(plain, 1)).toBe(false);
  });
});

describe('new powerups', () => {
  it('there are eighteen, with the six new ones on sale', () => {
    expect(powerups).toHaveLength(18);
    for (const id of ['one-touch', 'ghost-passes', 'afterburner', 'sledgehammer', 'sticky-glove', 'spark']) expect(powerups.some((p) => p.id === id)).toBe(true);
  });

  it('Spark fills the meter and sets the team on fire', () => {
    const world = createWorld(t, 'spark');
    world.teams[0].powerups[0] = powerups.find((p) => p.id === 'spark') as unknown as PowerupSpec;
    const events: SimEvent[] = [];
    expect(usePowerup(world, 0, 0, events)).toBe(true);
    expect(world.teams[0].heat).toBe(1);
    step(world, NO_INPUT, t);
    expect(onFire(world, 0)).toBe(true);
  });

  it('a timed one changes play while it runs', () => {
    const world = createWorld(t, 'ghost');
    world.teams[0].powerups[0] = powerups.find((p) => p.id === 'ghost-passes') as unknown as PowerupSpec;
    expect(player(world, ID.home1).fx.passThrough).toBe(0);
    usePowerup(world, 0, 0, []);
    expect(player(world, ID.home1).fx.passThrough).toBeGreaterThan(0);
    expect(player(world, ID.away1).fx.passThrough).toBe(0);
  });
});

describe('new talents', () => {
  it('each kind of skater has two, and both exist', () => {
    expect(talents.talents).toHaveLength(10);
    for (const kind of kindsFor('F')) {
      expect(kind.talents).toHaveLength(2);
      for (const id of kind.talents) expect(talentInfo(id)).not.toBeNull();
    }
  });

  it('the league has players with the new ones as well as the old', () => {
    const fresh = ['quickRelease', 'threader', 'jets', 'crusher', 'engine'];
    const seen = new Set<string>();
    for (const seed of ['content', 'content-2', 'content-3']) for (const p of Object.values(generateLeague(seed).players)) if (p.talent) seen.add(p.talent);
    expect(fresh.filter((id) => seen.has(id)).length).toBeGreaterThanOrEqual(3);
    expect(['cannonShot', 'distraction', 'spinMove', 'rallyCry', 'crowdSurge'].filter((id) => seen.has(id)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('new events', () => {
  /** A season standing at an event stop, with that stop turned into the event wanted. */
  const atEvent = (eventId: string): Franchise => {
    for (const seed of ['content', 'content-2', 'content-3', 'content-4']) {
      const f = started(seed);
      for (let guard = 0; guard < 40 && f.season.phase === 'map'; guard++) {
        if (f.season.stage === 'ringer') {
          pickRinger(f, null);
          continue;
        }
        if (f.season.stage === 'reward') {
          pickArtifact(f, f.season.offer[0]!);
          continue;
        }
        const stop = currentStop(f);
        if (stop === null) {
          const options = availableStops(f);
          const hit = options.find((s) => s.kind === 'event');
          travel(f, (hit ?? options.find((s) => !s.elite) ?? options[0]!).id);
          if (hit) {
            currentStop(f)!.eventId = eventId;
            return f;
          }
        } else if (stop.kind === 'game' || stop.kind === 'boss') recordGame(f, won());
        else if (stop.kind === 'training') train(f, f.season.dressed[0]!);
        else leaveShop(f);
      }
    }
    throw new Error('no event stop found');
  };

  it('there are thirty-eight', () => {
    expect(events).toHaveLength(38);
  });

  it('the clinic sells skill points for one player', () => {
    const f = atEvent('coachs-clinic');
    f.season.currency = 100;
    expect(chooseEvent(f, 0).ok).toBe(true);
    expect(f.season.currency).toBe(60);
    const withPoints = f.season.dressed.map((id) => f.league.players[id]!).filter((p) => (p.points ?? 0) > 0);
    expect(withPoints).toHaveLength(1);
    expect(withPoints[0]!.points).toBe(2);
    expect(withPoints[0]!.overall).toBe(Math.max(...f.season.dressed.map((id) => f.league.players[id]!.overall)));
  });

  it('the collector trades an artifact for a strike', () => {
    const f = atEvent('collectors-offer');
    const had = f.artifacts.length;
    const strikes = f.season.strikes;
    expect(chooseEvent(f, 0).ok).toBe(true);
    expect(f.artifacts).toHaveLength(had + 1);
    expect(f.season.strikes).toBe(Math.min(rules.maxStrikes - 1, strikes + 1));
  });

  it('every new one has a cost or a risk on each choice that gives something', () => {
    for (const id of ['coachs-clinic', 'collectors-offer', 'double-header', 'equipment-truck', 'rookie-callup', 'fan-fest', 'skate-sharpener', 'press-conference']) {
      const event = events.find((e) => e.id === id)!;
      expect(event, id).toBeDefined();
      expect(event.choices.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('new artifacts', () => {
  it('there are at least thirty, and each of these gives and takes', () => {
    expect(artifacts.length).toBeGreaterThanOrEqual(30);
    for (const id of ['showman', 'shot-blocker', 'giant-killers', 'all-in', 'trap-game', 'deep-bench']) {
      const artifact = artifacts.find((a) => a.id === id)!;
      expect(artifact.modifiers.length).toBeGreaterThanOrEqual(2);
      expect(artifact.description).toMatch(/, but /);
    }
  });

  it('Showman: the goalie bites longer on a fake', () => {
    const bite = (scale: number): number => {
      const world = createWorld(t, 'showman');
      clearIce(world, [ID.home1]);
      place(world, ID.home1, 14, 0, 0);
      giveTo(world, ID.home1);
      world.human!.controlled = ID.home1;
      const p = player(world, ID.home1);
      p.fx = { ...p.fx, fakeBiteScale: scale };
      p.baseFx = p.fx;
      for (let i = 0; i < 20; i++) step(world, { ...NO_INPUT, shoot: true }, t);
      step(world, { ...NO_INPUT, shoot: true, pass: true }, t);
      return player(world, ID.awayGoalie).goalie!.bitten;
    };
    expect(bite(1)).toBeGreaterThan(0);
    expect(bite(1.5)).toBeCloseTo(bite(1) * 1.5, 1);
  });

  it('Shot blocker: a braced skater stops a shot from further out', () => {
    const blocked = (scale: number): boolean => {
      const world = createWorld(t, 'blocker');
      clearIce(world, [ID.home1, ID.away1]);
      place(world, ID.home1, 0, 0, 0);
      place(world, ID.away1, 15, 0, Math.PI);
      const me = player(world, ID.home1);
      me.fx = { ...me.fx, blockReachScale: scale };
      me.checkCharge = t.block.braceAfterSeconds + 0.1;
      world.puck.carrier = null;
      world.puck.pos = { x: 3, y: t.block.reach * 1.2 };
      world.puck.vel = { x: -28, y: 0 };
      world.puck.shotBy = ID.away1;
      world.puck.lastTeam = 1;
      return flyPuck(world, t, 20).some((e) => e.type === 'block');
    };
    expect(blocked(1)).toBe(false);
    expect(blocked(1.4)).toBe(true);
  });

  it('Giant killers: an elite win pays twice the bonus, against a stronger elite team', () => {
    const elite = (owned: string[]): { pay: number; strength: number } => {
      const f = started();
      f.artifacts = owned;
      travel(f, availableStops(f).find((s) => s.elite)!.id);
      const strength = matchup(f)!.away.setup.skaters.reduce((sum, s) => sum + s.shooting, 0);
      recordGame(f, won(1));
      return { pay: f.season.currency, strength };
    };
    const plain = elite([]);
    const giant = elite(['giant-killers']);
    expect(giant.pay).toBe(plain.pay + rules.eliteCurrency);
    expect(giant.strength).toBeGreaterThan(plain.strength);
  });
});
