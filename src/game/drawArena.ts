import type * as Phaser from 'phaser';
import { createRng } from '../core/rng';
import look from '../data/rinkLook.json';
import { venueLook, type Venue } from './venue';

const arena = look.arena;
const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);

interface Fan {
  x: number;
  y: number;
  /** 0 or 1 for a fan in a team's colours, -1 for everyone else. */
  team: -1 | 0 | 1;
  shade: number;
  phase: number;
}

/**
 * The stands around the rink: rows of fans following the boards, mostly in neutral colours with pockets
 * of each team's. They sway gently, and jump when the crowd is excited. Laid out once per screen size;
 * the same seed always seats the same crowd.
 */
export class Crowd {
  private fans: Fan[] = [];
  private key = '';

  /** The building: how many rows there are, how full, and whether cameras flash. */
  constructor(private venue: Venue = venueLook()) {}

  /** Seats the crowd around a rink drawn at this place and size. Does nothing if nothing has changed. */
  layout(left: number, top: number, width: number, height: number, corner: number, screenW: number, screenH: number, topBar: number): void {
    const key = [left, top, width, height, corner, screenW, screenH].map(Math.round).join(',');
    if (key === this.key) return;
    this.key = key;
    this.fans = [];
    const rng = createRng('crowd');
    const gap = arena.seatGap;
    for (let row = 0; row < this.venue.rows; row++) {
      const d = arena.firstRowOffset + row * arena.rowGap;
      const r = corner + d;
      const x0 = left - d;
      const y0 = top - d;
      const w = width + d * 2;
      const h = height + d * 2;
      // Walk the rounded rectangle one seat at a time.
      const straightW = w - r * 2;
      const straightH = h - r * 2;
      const arc = (Math.PI / 2) * r;
      const perimeter = (straightW + straightH) * 2 + arc * 4;
      for (let s = 0; s < perimeter; s += gap) {
        let x: number;
        let y: number;
        let at = s;
        if (at < straightW) {
          x = x0 + r + at;
          y = y0;
        } else if ((at -= straightW) < arc) {
          const a = -Math.PI / 2 + at / r;
          x = x0 + w - r + Math.cos(a) * r;
          y = y0 + r + Math.sin(a) * r;
        } else if ((at -= arc) < straightH) {
          x = x0 + w;
          y = y0 + r + at;
        } else if ((at -= straightH) < arc) {
          const a = at / r;
          x = x0 + w - r + Math.cos(a) * r;
          y = y0 + h - r + Math.sin(a) * r;
        } else if ((at -= arc) < straightW) {
          x = x0 + w - r - at;
          y = y0 + h;
        } else if ((at -= straightW) < arc) {
          const a = Math.PI / 2 + at / r;
          x = x0 + r + Math.cos(a) * r;
          y = y0 + h - r + Math.sin(a) * r;
        } else if ((at -= arc) < straightH) {
          x = x0;
          y = y0 + h - r - at;
        } else {
          at -= straightH;
          const a = Math.PI + at / r;
          x = x0 + r + Math.cos(a) * r;
          y = y0 + r + Math.sin(a) * r;
        }
        if (x < 2 || x > screenW - 2 || y < topBar + 2 || y > screenH - 2) continue;
        if (rng.chance(this.venue.emptySeatChance)) continue;
        // Each team's fans sit mostly behind the net their team defends.
        const side = x < left + width / 2 ? 0 : 1;
        // Most seats wear a team's colours: more of them the home side's (team 0), and each side's mostly at its own end.
        const lean = side === 0 ? arena.homeFanShare + (1 - arena.homeFanShare) * (arena.ownEndChance - 0.5) : arena.homeFanShare - arena.homeFanShare * (arena.ownEndChance - 0.5);
        const team = rng.chance(arena.teamFanChance) ? (rng.chance(lean) ? 0 : 1) : -1;
        this.fans.push({ x, y, team: team as -1 | 0 | 1, shade: rng.int(0, arena.neutralColours.length - 1), phase: rng.range(0, Math.PI * 2) });
      }
    }
  }

  /**
   * Draws the crowd. `excitement` is 0 to 1; `cheering` is the team whose fans are on their feet, or null.
   * `still` skips the movement, for the low-detail setting.
   */
  draw(g: Phaser.GameObjects.Graphics, timeSeconds: number, excitement: number, cheering: 0 | 1 | null, teamColours: [string, string], still: boolean): void {
    const size = arena.fanSize;
    const neutrals = arena.neutralColours.map(colour);
    const teams = [colour(teamColours[0]), colour(teamColours[1])];
    // Cameras: a different handful of fans each moment, more of them the louder it is. No dice: the moment picks them.
    const flashes = still ? 0 : Math.round(this.fans.length * this.venue.flashShare * excitement);
    const moment = Math.floor(timeSeconds * arena.flashesPerSecond);
    for (const [index, fan] of this.fans.entries()) {
      const mine = fan.team !== -1 && fan.team === cheering;
      // Everyone sways a little; a cheering team's fans jump, and the rest stir with the noise.
      const lift = still ? 0 : Math.abs(Math.sin(timeSeconds * (mine ? arena.jumpSpeed : arena.swaySpeed) + fan.phase)) * (mine ? arena.jumpPixels : arena.swayPixels * (0.4 + excitement));
      g.fillStyle(fan.team === -1 ? (neutrals[fan.shade] as number) : (teams[fan.team] as number), fan.team === -1 ? 0.55 + excitement * 0.3 : 0.95);
      g.fillRect(fan.x - size / 2, fan.y - size / 2 - lift, size, size);
      if (flashes > 0 && (index * 7919 + moment * 104729) % this.fans.length < flashes) {
        g.fillStyle(colour(look.colours.light), 0.95);
        g.fillCircle(fan.x, fan.y - lift, size * 0.9);
      }
    }
  }
}
