/**
 * Which way the menus are moving, so a screen can slide in from the side it came from: deeper into the game
 * (`forward`), or back to a screen already passed through on the way here (`back`). `trail` is the screens
 * passed through, oldest first, and is changed to match. Pure, so it can be tested.
 */
export function navStep(trail: string[], name: string, most = 40): 'forward' | 'back' | 'same' {
  if (trail[trail.length - 1] === name) return 'same';
  const at = trail.lastIndexOf(name);
  if (at >= 0) {
    // Seen on the way here: everything after it is left behind.
    trail.length = at + 1;
    return 'back';
  }
  trail.push(name);
  if (trail.length > most) trail.splice(0, trail.length - most);
  return 'forward';
}
