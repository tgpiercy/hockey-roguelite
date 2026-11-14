import data from '../data/talents.json';
import type { Modifier } from './modifiers';
import { startBoost } from './powerups';
import { goalLineX } from './rink';
import { attackDir, otherTeam, skatersOf } from './team';
import type { Tuning } from './tuning';
import type { Player, SimEvent, World } from './types';

/**
 * Talents: special abilities a skater can carry (mascots do). They all trigger by themselves,
 * so they work the same whether a person or the AI controls him, and only while he is on the ice.
 * What each one does, and its numbers, are in src/data/talents.json.
 */
interface TalentSpec {
  id: string;
  name: string;
  seconds?: number;
  cooldown?: number;
  energyBelow?: number;
  modifiers?: Modifier[];
}

const spec = (id: string): TalentSpec | undefined => (data.talents as TalentSpec[]).find((t) => t.id === id);
const ready = (p: Player, id: string): boolean => p.talents.includes(id) && (p.talentCooldown[id] ?? 0) <= 0;

/**
 * Spin move: asked when a check has just beaten the carrier. If he has the talent and it is charged,
 * the check fails instead and the talent starts recharging.
 */
export function spinEscape(carrier: Player, events: SimEvent[]): boolean {
  if (!ready(carrier, 'spinMove')) return false;
  carrier.talentCooldown.spinMove = spec('spinMove')?.cooldown ?? 0;
  events.push({ type: 'talent', player: carrier.id, id: 'spinMove' });
  return true;
}

/** One step of every other talent. `events` are the events of this step, so a goal just scored is seen. */
export function stepTalents(world: World, t: Tuning, events: SimEvent[], dt: number): void {
  for (const p of world.players) {
    if (p.talents.length === 0) continue;
    for (const id of Object.keys(p.talentCooldown)) p.talentCooldown[id] = Math.max(0, (p.talentCooldown[id] ?? 0) - dt);
    if (!p.onIce || p.role !== 'skater') continue;

    // Crowd surge: his team has just scored, so the whole team skates faster for a while.
    const surge = spec('crowdSurge');
    if (surge && p.talents.includes('crowdSurge') && events.some((e) => e.type === 'goal' && e.team === p.team)) {
      startBoost(world, p.team, { id: surge.id, name: surge.name, modifiers: surge.modifiers ?? [], secondsLeft: surge.seconds ?? 0 });
      events.push({ type: 'talent', player: p.id, id: surge.id });
    }

    // Distraction: he carries the puck into the attacking zone, and the other goalie reacts slower for a while.
    const distraction = spec('distraction');
    if (distraction && ready(p, 'distraction') && world.puck.carrier === p.id && p.pos.x * attackDir(p.team) >= goalLineX(t) * data.zoneShare) {
      startBoost(world, otherTeam(p.team), {
        id: distraction.id,
        name: distraction.name,
        modifiers: distraction.modifiers ?? [],
        secondsLeft: distraction.seconds ?? 0,
      });
      p.talentCooldown.distraction = distraction.cooldown ?? 0;
      events.push({ type: 'talent', player: p.id, id: distraction.id });
    }

    // Rally cry: once a period, when his linemates are tired, their energy is refilled.
    const rally = spec('rallyCry');
    if (rally && p.talents.includes('rallyCry') && p.rallyPeriod !== world.period) {
      const mates = skatersOf(world, p.team).filter((m) => m.onIce && m.id !== p.id);
      const average = mates.length === 0 ? 1 : mates.reduce((sum, m) => sum + m.energy, 0) / mates.length;
      if (average < (rally.energyBelow ?? 0)) {
        for (const m of mates) {
          m.energy = 1;
          m.stamina = 1;
          m.sprintLocked = false;
        }
        p.rallyPeriod = world.period;
        events.push({ type: 'talent', player: p.id, id: rally.id });
      }
    }
  }
}
