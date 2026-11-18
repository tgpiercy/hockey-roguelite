import type * as Phaser from 'phaser';
import { createRng } from '../core/rng';
import look from '../data/rinkLook.json';
import { venueLook, type Venue } from './venue';

const arena = look.arena;
const comic = look.comicArena;
const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);

interface Fan {
  x: number;
  y: number;
  /** 0 or 1 for a fan in a team's colours, -1 for everyone else. */
  team: -1 | 0 | 1;
  shade: number;
  phase: number;
  /** Which row of the stand he sits in, the front row 0. */
  row: number;
}

/** A sign held up in the crowd this frame: where its foot is, whose side, and whether that side is on its feet. */
export interface SignPost {
  x: number;
  y: number;
  team: 0 | 1;
  up: boolean;
}

/**
 * The stands around the rink: rows of fans following the boards, mostly in neutral colours with pockets
 * of each team's. They sway gently, and jump when the crowd is excited. Laid out once per screen size;
 * the same seed always seats the same crowd.
 */
/**
 * How each team's supporters feel, from the score: 1 when their side is ahead, -1 when it is behind by enough
 * to hush them, 0 otherwise. The drawing sways a happy crowd more and lets a beaten one sit dim and still.
 */
export function crowdMoods(score: readonly [number, number]): [number, number] {
  const lead = score[0] - score[1];
  const of = (mine: number): number => (mine >= 1 ? 1 : mine <= -arena.mood.behindBy ? -1 : 0);
  return [of(lead), of(-lead)];
}

export class Crowd {
  private fans: Fan[] = [];
  private key = '';
  /** The fans holding signs, as places in `fans`. */
  private holders: number[] = [];
  /** Where each sign is this frame: filled by `draw`, read by the scene, which letters them. */
  readonly signs: SignPost[] = [];

  /** The building: how many rows there are, how full, and whether cameras flash. */
  constructor(private venue: Venue = venueLook(), private heads = false) {}

  /** Seats the crowd around a rink drawn at this place and size. Does nothing if nothing has changed. */
  layout(left: number, top: number, width: number, height: number, corner: number, screenW: number, screenH: number, topBar: number): void {
    const key = [left, top, width, height, corner, screenW, screenH].map(Math.round).join(',');
    if (key === this.key) return;
    this.key = key;
    this.fans = [];
    const rng = createRng('crowd');
    // Drawn as people (a head on a pair of shoulders), the crowd is fewer and bigger: the same depth of stand, in fewer rows.
    const gap = this.heads ? comic.headGap : arena.seatGap;
    const rowGap = this.heads ? comic.headRow : arena.rowGap;
    const rows = this.heads ? Math.max(1, Math.round((this.venue.rows * arena.rowGap) / comic.headRow)) : this.venue.rows;
    for (let row = 0; row < rows; row++) {
      const d = arena.firstRowOffset + row * rowGap + (this.heads ? comic.headSize * 0.3 : 0);
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
        this.fans.push({ x, y, team: team as -1 | 0 | 1, shade: rng.int(0, arena.neutralColours.length - 1), phase: rng.range(0, Math.PI * 2), row });
      }
    }
    // A few of them hold signs: fans in a club's colours, a row or more back from the glass, wherever there is a stand.
    this.holders = [];
    if (this.heads) {
      const able = this.fans.map((fan, i) => ({ fan, i })).filter(({ fan }) => fan.team !== -1 && fan.row >= 2 && fan.row <= 4);
      const step = Math.floor(able.length / look.signs.count);
      if (step >= 1) for (let k = 0; k < look.signs.count; k++) this.holders.push(able[k * step + Math.floor(step / 2)]!.i);
    }
  }

  /**
   * Draws the crowd. `excitement` is 0 to 1; `cheering` is the team whose fans are on their feet, or null.
   * `still` skips the movement, for the low-detail setting.
   */
  draw(g: Phaser.GameObjects.Graphics, timeSeconds: number, excitement: number, cheering: 0 | 1 | null, teamColours: [string, string], still: boolean, noFlashes = false, moods: readonly [number, number] = [0, 0]): void {
    const size = arena.fanSize;
    const neutrals = arena.neutralColours.map(colour);
    const teams = [colour(teamColours[0]), colour(teamColours[1])];
    // Cameras: a different handful of fans each moment, more of them the louder it is. No dice: the moment picks them.
    const flashes = still || noFlashes ? 0 : Math.round(this.fans.length * this.venue.flashShare * excitement);
    const moment = Math.floor(timeSeconds * arena.flashesPerSecond);
    this.signs.length = 0;
    for (const [index, fan] of this.fans.entries()) {
      const mine = fan.team !== -1 && fan.team === cheering;
      // Everyone sways a little; a cheering team's fans jump, and the rest stir with the noise.
      // A side that is ahead is livelier; one well behind sits dim and still, until its own team scores.
      const mood = fan.team === -1 ? 0 : (moods[fan.team] ?? 0);
      const spirit = mine ? 1 : mood > 0 ? arena.mood.aheadSway : mood < 0 ? arena.mood.sagSway : 1;
      const lift = still ? 0 : Math.abs(Math.sin(timeSeconds * (mine ? arena.jumpSpeed : arena.swaySpeed) + fan.phase)) * (mine ? arena.jumpPixels : arena.swayPixels * (0.4 + excitement) * spirit);
      const tint = fan.team === -1 ? (neutrals[fan.shade] as number) : (teams[fan.team] as number);
      const alpha = fan.team === -1 ? 0.55 + excitement * 0.3 : mood < 0 && !mine ? 0.95 * arena.mood.sagAlpha : 0.95;
      if (this.heads) {
        // A person: shoulders in his colours with a line of ink round them, and a head.
        const big = comic.headSize;
        const y = fan.y - lift;
        g.fillStyle(colour(comic.inkColour), Math.min(1, alpha + 0.2));
        g.fillRect(fan.x - big / 2 - 1, y - big * 0.1 - 1, big + 2, big * 0.6 + 2);
        g.fillCircle(fan.x, y - big * 0.28, big * 0.36 + 1);
        g.fillStyle(tint, Math.min(1, alpha + 0.2));
        g.fillRect(fan.x - big / 2, y - big * 0.1, big, big * 0.6);
        g.fillStyle(colour(comic.headSkins[(index * 13 + fan.shade) % comic.headSkins.length] as string), mood < 0 && !mine ? arena.mood.sagAlpha : 1);
        g.fillCircle(fan.x, y - big * 0.28, big * 0.36);
        if (fan.team !== -1 && this.holders.includes(index)) this.signs.push({ x: fan.x, y: y - big * 0.5, team: fan.team, up: mine });
      } else {
        g.fillStyle(tint, alpha);
        g.fillRect(fan.x - size / 2, fan.y - size / 2 - lift, size, size);
      }
      if (flashes > 0 && (index * 7919 + moment * 104729) % this.fans.length < flashes) {
        g.fillStyle(colour(look.colours.light), 0.95);
        g.fillCircle(fan.x, fan.y - lift, size * 0.9);
      }
    }
  }
}
