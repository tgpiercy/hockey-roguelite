import { goalieReaction } from './lines';
import { wrapAngle } from './skater';
import { dist, goalieOf, otherTeam, skatersOf, targetNet } from './team';
import type { Tuning } from './tuning';
import type { InputFrame, Player, SimEvent, World } from './types';

/**
 * The shot fake: pass pressed in the middle of a wind-up cancels the shot and passes nothing. A goalie
 * he is facing from in range bites (he is stuck where he is for a moment, longer the slower his
 * reactions), and defenders close by cannot check for a moment. Returns the input with the pass button
 * taken out for as long as it stays down, so the fake does not also pass.
 */
export function stepFake(world: World, p: Player, hasPuck: boolean, input: InputFrame, t: Tuning, events: SimEvent[], dt: number): InputFrame {
  const f = t.fake;
  p.fake = Math.max(0, p.fake - dt);
  p.fakeCooldown = Math.max(0, p.fakeCooldown - dt);
  const pressed = input.pass && !p.passHeld && !p.fakePass;
  if (!input.pass) p.fakePass = false;

  if (hasPuck && pressed && input.shoot && p.charge >= f.minCharge && p.fakeCooldown <= 0) {
    p.charge = 0;
    p.fake = f.poseSeconds;
    p.fakeCooldown = f.cooldownSeconds;
    p.fakePass = true;

    const g = goalieOf(world, otherTeam(p.team));
    const net = targetNet(p.team, t);
    const toNet = Math.atan2(net.y - p.pos.y, net.x - p.pos.x);
    const facingNet = Math.abs(wrapAngle(toNet - p.facing)) <= (f.facingDegrees * Math.PI) / 360;
    if (g && g.onIce && g.goalie && facingNet && dist(p.pos, net) <= f.range) {
      g.goalie.bitten = f.biteSeconds * p.fx.fakeBiteScale * Math.min(f.maxBiteScale, goalieReaction(g, t) / f.fullBiteReaction);
    }
    for (const o of skatersOf(world, otherTeam(p.team))) {
      if (!o.onIce || dist(o.pos, p.pos) > f.defenderRange) continue;
      o.checkCooldown = Math.max(o.checkCooldown, f.defenderFreezeSeconds);
      o.ai.checkSteps = 0;
    }
    events.push({ type: 'fake', player: p.id });
  }
  return p.fakePass ? { ...input, pass: false } : input;
}
