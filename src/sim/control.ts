import data from '../data/physics.json';
import { STEP_SECONDS } from './clock';
import { availableSkaters, carrierOf, dist } from './team';
import type { InputFrame, World } from './types';

/**
 * Decides which skater the human controls this step.
 * With the puck: always the carrier. Without it: the switch button jumps to the skater nearest the puck
 * (or, if that is already the controlled one, to the next nearest). On a line change, control moves
 * to a fresh skater as soon as one is on the ice.
 */
const giveGoSeconds = data.giveGo.seconds;

export function updateControl(world: World, input: InputFrame): void {
  const human = world.human;
  if (!human) return;
  const carrier = carrierOf(world);
  const byDistance = availableSkaters(world, human.team).sort(
    (a, b) => dist(a.pos, world.puck.pos) - dist(b.pos, world.puck.pos) || a.id - b.id,
  );
  const current = world.players[human.controlled];

  // Give and go. A fresh press of pass just after passing keeps the human on the passer; it lasts until the
  // puck comes back to him, the other team takes it, the passer leaves the ice, or the time runs out.
  const pressed = input.pass && !human.passHeld;
  human.passHeld = input.pass;
  if (human.giveGoOffer) {
    const offer = human.giveGoOffer;
    offer.left -= STEP_SECONDS;
    const passer = world.players[offer.passer];
    if (pressed && passer && passer.onIce && !passer.leaving) {
      human.giveGo = { passer: offer.passer, receiver: offer.receiver, left: giveGoSeconds };
      human.controlled = offer.passer;
      human.giveGoOffer = null;
    } else if (offer.left <= 0) {
      human.giveGoOffer = null;
    }
  }
  if (human.giveGo) {
    const go = human.giveGo;
    go.left -= STEP_SECONDS;
    const passer = world.players[go.passer];
    const lost = carrier !== null && carrier.team !== human.team;
    const done = carrier !== null && carrier.id === go.passer;
    const wandered = carrier !== null && carrier.team === human.team && carrier.id !== go.receiver && carrier.id !== go.passer;
    if (lost || done || wandered || go.left <= 0 || !passer || !passer.onIce || passer.leaving) human.giveGo = null;
    else {
      human.controlled = go.passer;
      human.switchHeld = input.switchPlayer;
      return;
    }
  }

  if (carrier && carrier.team === human.team && carrier.role === 'skater') {
    human.controlled = carrier.id;
  } else if (!current || !current.onIce || (current.leaving && byDistance.some((p) => !p.leaving))) {
    // The controlled skater has gone off, or is going off and a fresh one is on: take the nearest who is staying.
    if (byDistance[0]) human.controlled = byDistance[0].id;
  } else if (input.switchPlayer && !human.switchHeld) {
    const nearest = byDistance[0];
    const next = byDistance[1];
    if (nearest) human.controlled = nearest.id !== human.controlled || !next ? nearest.id : next.id;
  }
  human.switchHeld = input.switchPlayer;
}
