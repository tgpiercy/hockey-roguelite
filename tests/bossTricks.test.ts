import { describe, expect, it } from 'vitest';
import { bossInfo } from '../src/core/bosses';
import { generateLeague } from '../src/core/generate';
import { matchup, newFranchise, startSeason, type Franchise } from '../src/core/season';
import bosses from '../src/data/bosses.json';
import mascotRules from '../src/data/mascot.json';
import { braced, resolveCheck } from '../src/sim/check';
import { activeLabels, stepConditions } from '../src/sim/conditions';
import type { Modifier } from '../src/sim/modifiers';
import { defaultSkaterRatings, skaterEffects } from '../src/sim/ratings';
import { cloneTuning } from '../src/sim/tuning';
import type { SimEvent, World } from '../src/sim/types';
import { createGame, createWorld, step, type TeamSetup } from '../src/sim/world';
import { NO_INPUT } from '../src/sim/types';
import { uniformTeam } from './harness/harness';
import { clearIce, flyPuck, giveTo, ID, place, player } from './helpers';

const t = cloneTuning();
const withMods = (modifiers: Modifier[]): TeamSetup => ({ ...uniformTeam(70), modifiers });
const has = (events: SimEvent[], type: SimEvent['type']): boolean => events.some((e) => e.type === type);

describe('the four newer boss clubs', () => {
  it('each has a trick in two sentences, a club line, a person and a rink, and its abilities are off for everyone else', () => {
    const plain = skaterEffects(defaultSkaterRatings);
    expect(plain.sureFooted).toBe(0);
    expect(plain.alwaysBraced).toBe(0);
    for (const id of ['granite', 'night-shift', 'carnival', 'pickets']) {
      const boss = bossInfo(id);
      expect(boss.id).toBe(id);
      expect(boss.trick.split('. ').length, id).toBeGreaterThanOrEqual(2);
      expect(boss.club.length, id).toBeGreaterThan(20);
      expect(boss.person.name.length, id).toBeGreaterThan(3);
    }
    // Only the Carnival brings its mascot every time.
    expect(bosses.filter((b) => (b as { mascotMisses?: number }).mascotMisses !== undefined).map((b) => b.id)).toEqual(['carnival']);
  });

  describe('Granite: never knocked down', () => {
    const sure = cloneTuning();
    sure.check.bodyBaseChance = 1;
    sure.check.ratingSwing = 0;
    /** A body check thrown at full closing speed on a carrier whose team has these modifiers. */
    const hit = (mods: Modifier[]): { world: World; events: SimEvent[] } => {
      const world = createWorld(sure, 'granite', { human: false, teams: [withMods(mods), uniformTeam(70)] });
      clearIce(world, [ID.home1, ID.away1]);
      place(world, ID.home1, 0, 0, 0);
      giveTo(world, ID.home1);
      const checker = place(world, ID.away1, 1.2, 0, Math.PI);
      checker.vel = { x: -(sure.check.bigHitClosingSpeed + 2), y: 0 };
      const events: SimEvent[] = [];
      resolveCheck(world, checker, true, sure, events);
      return { world, events };
    };

    it('the same hit that floors anyone else leaves him standing, for half the stagger', () => {
      const usual = hit([]);
      expect(usual.events[0]).toMatchObject({ kind: 'body', success: true, big: true });
      expect(player(usual.world, ID.home1).knockedDown).toBe(true);

      const granite = hit(bossInfo('granite').modifiers);
      expect(granite.events[0]).toMatchObject({ kind: 'body', success: true });
      expect((granite.events[0] as { big?: boolean }).big).toBeUndefined();
      const carrier = player(granite.world, ID.home1);
      expect(carrier.knockedDown).toBe(false);
      expect(carrier.stagger).toBeCloseTo(sure.check.staggerSeconds * sure.check.sureFootedStagger);
    });

    it('the answer works: the puck still comes loose', () => {
      const granite = hit(bossInfo('granite').modifiers);
      expect(granite.world.puck.carrier).toBeNull();
    });
  });

  describe('Night shift: stronger late', () => {
    const game = (): World => createGame(t, 'night', { human: false, levels: [0.5, 0.5], teams: [uniformTeam(70), withMods(bossInfo('night-shift').modifiers)] });
    const tick = (world: World): void => stepConditions(world, [], t.period.count);
    const theirs = (world: World) => world.players[7]!;

    it('nothing in the first two periods; faster in the last, and in overtime, once and not twice', () => {
      const world = game();
      const base = theirs(world).baseFx.topSpeedScale;
      tick(world);
      expect(theirs(world).fx.topSpeedScale).toBeCloseTo(base);
      world.period = t.period.count;
      tick(world);
      expect(theirs(world).fx.topSpeedScale).toBeCloseTo(base * 1.1);
      expect(activeLabels(world, 1)).toContain('Night shift');
      world.overtime = true;
      tick(world);
      expect(theirs(world).fx.topSpeedScale).toBeCloseTo(base * 1.1);
    });

    it('the other team gets none of it', () => {
      const world = game();
      world.period = t.period.count;
      tick(world);
      expect(world.players[0]!.fx.topSpeedScale).toBeCloseTo(world.players[0]!.baseFx.topSpeedScale);
      expect(activeLabels(world, 0)).toEqual([]);
    });
  });

  describe('Carnival: the mascot always comes', () => {
    const atBoss = (bossId: string): Franchise => {
      const f = newFranchise(generateLeague('carnival'));
      startSeason(f);
      const stop = Object.values(f.season.map!.stops).find((s) => s.kind === 'boss' && s.region === 0)!;
      stop.bossId = bossId;
      f.season.current = stop.id;
      f.season.stage = 'arrived';
      return f;
    };

    it('his chance is certain at the Carnival and the usual one at any other boss', () => {
      expect(mascotRules.baseChance + mascotRules.missStep * bossInfo('carnival').mascotMisses!).toBeGreaterThanOrEqual(1);
      expect(matchup(atBoss('carnival'))!.mascots!.away.chance).toBe(1);
      expect(matchup(atBoss('granite'))!.mascots!.away.chance).toBeCloseTo(mascotRules.baseChance);
    });

    it('he is on the ice from the opening faceoff', () => {
      const game = matchup(atBoss('carnival'))!;
      const world = createGame(t, 'carnival-game', { human: false, levels: [0.5, 0.5], teams: [game.home.setup, game.away.setup] });
      // He is rolled for as the game is made, and is on the ice at the first faceoff.
      expect(world.teams[1].mascot!.arrivals).toBe(1);
      expect(world.teams[1].mascot!.saved).not.toBeNull();
    });
  });

  describe('Pickets: blocking without going down', () => {
    /** A defender of a team with these modifiers, standing; a shot from the other team passing just beyond his body. */
    const shotPast = (mods: Modifier[]): { world: World; events: SimEvent[] } => {
      const world = createWorld(t, 'pickets', { human: false, teams: [withMods(mods), uniformTeam(70)] });
      clearIce(world, [ID.home1, ID.away1]);
      const me = place(world, ID.home1, 0, 0, 0);
      place(world, ID.away1, 15, 0, Math.PI);
      me.ai.thinkIn = 99;
      player(world, ID.away1).ai.thinkIn = 99;
      const reach = t.block.reach * me.fx.blockReachScale;
      world.puck.carrier = null;
      world.puck.pos = { x: 3, y: (t.skater.radius + t.puck.radius + reach) / 2 };
      world.puck.vel = { x: -28, y: 0 };
      world.puck.shotBy = ID.away1;
      world.puck.lastTeam = 1;
      me.checkCharge = 0;
      return { world, events: flyPuck(world, t, 20) };
    };

    it('a Picket standing with no button held is braced, and stops the shot; anyone else lets it by', () => {
      const pickets = shotPast(bossInfo('pickets').modifiers);
      expect(has(pickets.events, 'block')).toBe(true);
      const plain = shotPast([]);
      expect(has(plain.events, 'block')).toBe(false);
    });

    it('he reaches less far than a man on one knee, and is not slowed by it', () => {
      const world = createWorld(t, 'pickets', { human: false, teams: [withMods(bossInfo('pickets').modifiers), uniformTeam(70)] });
      clearIce(world, [ID.home1, ID.away1]);
      const me = place(world, ID.home1, 0, 0, 0);
      place(world, ID.away1, 15, 0, Math.PI);
      giveTo(world, ID.away1);
      expect(me.fx.blockReachScale).toBeLessThanOrEqual(1);
      expect(braced(world, me, t)).toBe(true);
      me.ai.thinkIn = 99;
      me.vel = { x: 0, y: t.block.maxSpeed * 2 };
      step(world, NO_INPUT, t);
      expect(Math.hypot(me.vel.x, me.vel.y)).toBeGreaterThan(t.block.maxSpeed);
    });

    it('the answer works: with the puck on his own stick he blocks nothing, and a carrier close by is a check, not a block', () => {
      const world = createWorld(t, 'pickets', { human: false, teams: [withMods(bossInfo('pickets').modifiers), uniformTeam(70)] });
      clearIce(world, [ID.home1, ID.away1]);
      const me = place(world, ID.home1, 0, 0, 0);
      place(world, ID.away1, t.block.minCarrierDistance - 1, 0, Math.PI);
      giveTo(world, ID.away1);
      expect(braced(world, me, t)).toBe(false);
      giveTo(world, ID.home1);
      expect(braced(world, me, t)).toBe(false);
    });
  });
});
