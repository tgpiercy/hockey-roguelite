import type * as Phaser from 'phaser';
import { createRng } from '../core/rng';
import look from '../data/rinkLook.json';
import { burstPoints, placed } from './burst';
import type { Tuning } from '../sim/tuning';
import type { SimEvent, World } from '../sim/types';

const fx = look.effects;
const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** The star drawn where a hit lands: one jagged shape, stretched to size. */
const IMPACT = burstPoints('impact', fx.impact.spikes, fx.impact.depth, fx.impact.jitter);

/** How the scene turns rink metres into screen pixels. */
export interface View {
  sx(x: number): number;
  sy(y: number): number;
  zoom: number;
}

interface Mark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  age: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}
interface Confetto extends Particle {
  hex: string;
}
interface Ring {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  hex: string;
}

/**
 * Everything on the ice that is only for the eye: skate marks, snow spray, the streak behind a hard shot,
 * rings on hits and posts, the goal light, each player's skating stride. It reads the simulation and
 * the events it produced and never changes them, so a game still replays exactly from its seed.
 * All positions are in rink metres; all numbers are in the "effects" part of rinkLook.json.
 */
export class Effects {
  private readonly rng = createRng('effects');
  private marks: Mark[] = [];
  /** Seconds of play on this sheet of ice since it was last made. */
  private sheet = 0;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  /** Comic stars where a hit landed: a spot, how old it is, and whether the hit was a big one. */
  private stars: { x: number; y: number; age: number; big: boolean }[] = [];
  /** Skaters going flat out this moment, for the lines drawn streaming behind them. */
  private fast: { x: number; y: number; dx: number; dy: number }[] = [];
  /** Seconds left of the puck's trail burning bright after a hard shot or a one-timer. */
  private hot = 0;
  private confetti: Confetto[] = [];
  /** True while a player has been losing speed long enough to be gliding. */
  gliding(id: number): boolean {
    return (this.slowing.get(id) ?? 0) > look.effects.glideAfter;
  }

  /** The two teams' colours, for the confetti: set by the scene. */
  teamColours: [string, string] = [look.colours.teamHome, look.colours.teamAway];
  private trail: { x: number; y: number; age: number }[] = [];
  private lastPos = new Map<number, { x: number; y: number; speed: number }>();
  /** How far through his stride each player is, in radians. */
  readonly stride = new Map<number, number>();
  /** Seconds each player has been losing speed: past a moment of it he is gliding, and takes no strides. */
  readonly slowing = new Map<number, number>();
  /** What each player has just done (a pass, a poke, a hit; a goalie's glove save), and the seconds it is still shown for. */
  readonly action = new Map<number, { kind: 'pass' | 'poke' | 'hit' | 'glove' | 'kick' | 'shot' | 'stop' | 'rise'; left: number }>();
  /** Seconds left of each goalie's pads being down after a save, by player id. */
  readonly padsDown = new Map<number, number>();
  /** Seconds left of the red light behind each net: index 0 is the left net. */
  readonly goalLight: [number, number] = [0, 0];
  /** How worked up the crowd is, 0 to 1, and which team's fans are on their feet (or null). */
  excitement = 0;
  cheering: 0 | 1 | null = null;
  /** Set when something has just happened that should shake the screen; the scene takes it and clears it. */
  shake = 0;
  private markTimer = 0;

  constructor(private readonly full: boolean) {}

  /** Advances the effects by a stretch of game time and reacts to what happened in it. */
  update(world: World, events: SimEvent[], t: Tuning, dt: number): void {
    if (dt <= 0) return;
    const players = world.players;

    for (const e of events) {
      // A fresh sheet for each period.
      if (e.type === 'period') {
        this.marks = [];
        this.sheet = 0;
      }
      if (e.type === 'goal') {
        // The light goes on behind the net that was scored on.
        this.goalLight[e.team === 0 ? 1 : 0] = fx.goalLightSeconds;
        this.excitement = 1;
        this.cheering = e.team;
        this.shake = Math.max(this.shake, fx.goalShake);
        // Confetti in the scorers' colours bursts from the net they scored on. (Full detail only.)
        if (this.full) {
          const netX = (e.team === 0 ? 1 : -1) * (t.rink.length / 2 - t.rink.goalLineFromEnd);
          const colours = [this.teamColours[e.team], look.colours.snow, this.teamColours[e.team]];
          for (let i = 0; i < fx.confetti; i++) {
            const angle = this.rng.range(0, Math.PI * 2);
            const speed = this.rng.range(fx.confettiSpeed * 0.25, fx.confettiSpeed);
            this.confetti.push({ x: netX, y: 0, vx: Math.cos(angle) * speed - Math.sign(netX) * fx.confettiSpeed * 0.35, vy: Math.sin(angle) * speed - fx.confettiSpeed * 0.3, age: 0, life: this.rng.range(fx.confettiSeconds * 0.5, fx.confettiSeconds), hex: colours[i % colours.length] as string });
          }
        }
      } else if (e.type === 'pass') {
        this.action.set(e.player, { kind: 'pass', left: look.figure.actionSeconds.pass });
      } else if (e.type === 'shot' && players[e.player]?.role === 'skater') {
        // The follow-through of a shot. (The streak and the crowd are dealt with below.)
        this.action.set(e.player, { kind: 'shot', left: look.figure.actionSeconds.shot });
      } else if (e.type === 'check' && !e.success) {
        this.action.set(e.player, { kind: e.kind === 'body' ? 'hit' : 'poke', left: e.kind === 'body' ? look.figure.actionSeconds.hit : look.figure.actionSeconds.poke });
      } else if (e.type === 'check' && e.success) {
        this.action.set(e.player, { kind: e.kind === 'body' ? 'hit' : 'poke', left: e.kind === 'body' ? look.figure.actionSeconds.hit : look.figure.actionSeconds.poke });
        const target = players[e.target];
        if (target) {
          this.addRing(target.pos.x, target.pos.y, e.kind === 'body' ? fx.hitRingSize : fx.hitRingSize * 0.6, look.colours.accent);
          if (e.kind === 'body') {
            // A star between the two of them, where the hit landed.
            const hitter = players[e.player];
            if (this.full) this.stars.push({ x: hitter ? (hitter.pos.x + target.pos.x) / 2 : target.pos.x, y: hitter ? (hitter.pos.y + target.pos.y) / 2 : target.pos.y, age: 0, big: e.big === true });
            this.spray(target.pos.x, target.pos.y, fx.hitSpray);
            this.shake = Math.max(this.shake, fx.hitShake * (e.big ? fx.bigHitShakeScale : 1));
          }
        }
      } else if (e.type === 'post') {
        this.addRing(world.puck.pos.x, world.puck.pos.y, fx.postRingSize, look.colours.redLine);
      } else if (e.type === 'save') {
        this.padsDown.set(e.goalie, fx.padsDownSeconds);
        // A puck he holds is a glove save; one he kicks out, a pad save.
        if (e.frozen) this.action.set(e.goalie, { kind: 'glove', left: look.figure.actionSeconds.glove });
        else {
          // Moving across his crease when it hit him, he kicked it out with a pad; set, he dropped to his knees.
          const keeper = players[e.goalie];
          if (keeper && Math.hypot(keeper.vel.x, keeper.vel.y) >= fx.kickSpeed) this.action.set(e.goalie, { kind: 'kick', left: look.figure.actionSeconds.kick });
        }
        this.excitement = Math.max(this.excitement, 0.5);
      } else if (e.type === 'shot') {
        this.excitement = Math.max(this.excitement, Math.min(0.6, e.speed / t.shot.maxSpeed));
        // A hard shot or a one-timer leaves a bright streak with lines either side of it.
        if (e.oneTimer || e.speed >= t.shot.maxSpeed * fx.hotShot.fromShare) this.hot = fx.hotShot.seconds;
      }
    }

    // The crowd settles; lights and pads time out.
    this.excitement = Math.max(fx.crowdRest, this.excitement - dt * fx.crowdCalmPerSecond);
    if (this.excitement <= fx.crowdRest + 0.01) this.cheering = null;
    for (const side of [0, 1] as const) this.goalLight[side] = Math.max(0, this.goalLight[side] - dt);
    for (const [id, act] of this.action) {
      if (act.left - dt <= 0) this.action.delete(id);
      else act.left -= dt;
    }
    for (const [id, left] of this.padsDown) {
      if (left - dt <= 0) {
        this.padsDown.delete(id);
        // He does not spring from the ice to his feet in one picture: a moment on one knee first.
        if (!this.action.has(id)) this.action.set(id, { kind: 'rise', left: look.figure.actionSeconds.rise });
      } else this.padsDown.set(id, left - dt);
    }

    if (world.phase === 'play') this.sheet += dt;
    // Strides, skate marks and snow from hard stops.
    this.markTimer += dt;
    const dropMark = this.markTimer >= fx.markEverySeconds;
    if (dropMark) this.markTimer = 0;
    for (const p of players) {
      if (!p.onIce) {
        this.lastPos.delete(p.id);
        continue;
      }
      const speed = Math.hypot(p.vel.x, p.vel.y);
      const last = this.lastPos.get(p.id);
      // A man who is losing speed has stopped pushing: he glides, and his stride waits where it was.
      const losing = last !== undefined && dt > 0 && (last.speed - speed) / dt > fx.glideDrop;
      this.slowing.set(p.id, losing ? (this.slowing.get(p.id) ?? 0) + dt : 0);
      // Braking hard from speed is a stop: skates thrown out ahead, leaning back.
      if (p.role === 'skater' && last !== undefined && dt > 0 && last.speed >= fx.stopFromSpeed && (last.speed - speed) / dt > fx.stopDrop && !this.action.has(p.id)) this.action.set(p.id, { kind: 'stop', left: look.figure.actionSeconds.stop });
      if (!this.gliding(p.id)) this.stride.set(p.id, (this.stride.get(p.id) ?? this.rng.range(0, 6)) + speed * dt * fx.stridePerMetre);
      else if (!this.stride.has(p.id)) this.stride.set(p.id, this.rng.range(0, 6));
      if (this.full && last) {
        if (dropMark && speed > fx.markMinSpeed && p.role === 'skater') {
          this.marks.push({ x1: last.x, y1: last.y, x2: p.pos.x, y2: p.pos.y, age: 0 });
        }
        if (last.speed - speed > fx.stopSprayDrop * dt * 60 && last.speed > fx.stopSprayMinSpeed) this.spray(p.pos.x, p.pos.y, fx.stopSpray);
      }
      if (!last || dropMark) this.lastPos.set(p.id, { x: p.pos.x, y: p.pos.y, speed });
      else last.speed = speed;
    }
    if (this.marks.length > fx.maxMarks) this.marks.splice(0, this.marks.length - fx.maxMarks);
    // A cut in the ice is bright when it is made and fades to a faint scar that stays until the period ends.
    for (const mark of this.marks) mark.age += dt;

    // The streak behind a fast, loose puck.
    const puck = world.puck;
    const puckSpeed = Math.hypot(puck.vel.x, puck.vel.y);
    for (const point of this.trail) point.age += dt;
    this.trail = this.trail.filter((point) => point.age < fx.trailSeconds);
    if (this.full && puck.carrier === null && puckSpeed >= fx.trailMinSpeed) this.trail.push({ x: puck.pos.x, y: puck.pos.y, age: 0 });

    for (const particle of this.particles) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - Math.min(1, fx.sprayDrag * dt);
      particle.vy *= 1 - Math.min(1, fx.sprayDrag * dt);
    }
    this.particles = this.particles.filter((particle) => particle.age < particle.life);
    for (const bit of this.confetti) {
      bit.age += dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.vx *= 1 - Math.min(1, fx.sprayDrag * 0.5 * dt);
      // It flutters down the screen as it slows.
      bit.vy += fx.confettiFall * dt;
    }
    this.confetti = this.confetti.filter((bit) => bit.age < bit.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const star of this.stars) star.age += dt;
    this.stars = this.stars.filter((star) => star.age < fx.impact.seconds);
    this.hot = Math.max(0, this.hot - dt);
    // Who is going flat out, and which way: lines stream out behind them.
    this.fast = [];
    if (this.full) {
      for (const p of players) {
        if (!p.onIce || p.role !== 'skater') continue;
        const speed = Math.hypot(p.vel.x, p.vel.y);
        if (speed >= fx.speedLines.fromSpeed) this.fast.push({ x: p.pos.x, y: p.pos.y, dx: p.vel.x / speed, dy: p.vel.y / speed });
      }
    }
  }

  private addRing(x: number, y: number, size: number, hex: string): void {
    this.rings.push({ x, y, age: 0, life: fx.ringSeconds, size, hex });
  }

  private spray(x: number, y: number, count: number): void {
    if (!this.full) return;
    for (let i = 0; i < count && this.particles.length < fx.maxParticles; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(fx.spraySpeed * 0.3, fx.spraySpeed);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: this.rng.range(0.25, fx.spraySeconds) });
    }
  }

  /** The fresh sheet's shine, the haze of a worn one, and the marks cut into the ice: drawn under the players. */
  drawUnder(g: Phaser.GameObjects.Graphics, view: View, rink?: { length: number; width: number; periodSeconds: number }): void {
    if (rink && this.full) {
      const R = look.rinkDetail;
      const hx = rink.length / 2;
      const hy = rink.width / 2;
      // A new sheet shines for the first seconds of a period: bands of light across it that fade.
      const fresh = 1 - this.sheet / R.sheenSeconds;
      if (fresh > 0) {
        g.fillStyle(colour(look.colours.light), R.sheenAlpha * fresh);
        for (let k = 0; k < R.sheenBands; k++) {
          const x = -hx * 0.7 + (k / Math.max(1, R.sheenBands - 1)) * hx * 1.4;
          g.fillPoints([{ x: view.sx(x - R.sheenWidth), y: view.sy(hy * 0.92) }, { x: view.sx(x), y: view.sy(hy * 0.92) }, { x: view.sx(x + hy * 0.6), y: view.sy(-hy * 0.92) }, { x: view.sx(x + hy * 0.6 - R.sheenWidth), y: view.sy(-hy * 0.92) }] as Phaser.Math.Vector2[], true);
        }
      }
      // Late in a period the sheet is dull with snow, most where the play is: in front of each net and at centre.
      const worn = Math.max(0, this.sheet / rink.periodSeconds - R.hazeFrom) / (1 - R.hazeFrom);
      if (worn > 0) {
        g.fillStyle(colour(look.colours.mark), R.hazeAlpha * Math.min(1, worn));
        for (const x of [-hx * 0.72, 0, hx * 0.72]) g.fillEllipse(view.sx(x), view.sy(0), rink.length * 0.24 * view.zoom, rink.width * 0.62 * view.zoom);
      }
    }
    const width = Math.max(1, fx.markWidth * view.zoom);
    for (const mark of this.marks) {
      g.lineStyle(width, colour(look.colours.mark), Math.max(fx.wearAlpha, fx.markAlpha * (1 - mark.age / fx.markSeconds)));
      g.lineBetween(view.sx(mark.x1), view.sy(mark.y1), view.sx(mark.x2), view.sy(mark.y2));
    }
    const hot = this.hot > 0;
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      const fade = 1 - b.age / fx.trailSeconds;
      g.lineStyle(Math.max(1.5, fx.trailWidth * view.zoom) * (hot ? fx.hotShot.widthScale : 1), colour(hot ? look.colours.accent : look.colours.puck), (hot ? fx.hotShot.alpha : fx.trailAlpha) * fade);
      g.lineBetween(view.sx(a.x), view.sy(a.y), view.sx(b.x), view.sy(b.y));
      if (hot) {
        // Speed lines either side of a hard shot's streak.
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = (-(b.y - a.y) / length) * fx.hotShot.side;
        const ny = ((b.x - a.x) / length) * fx.hotShot.side;
        g.lineStyle(Math.max(1, fx.trailWidth * view.zoom * 0.6), colour(look.colours.light), 0.7 * fade);
        for (const k of [-1, 1]) g.lineBetween(view.sx(a.x + nx * k), view.sy(a.y + ny * k), view.sx(b.x + nx * k), view.sy(b.y + ny * k));
      }
    }
    // Lines streaming out behind a skater going flat out, at about the height of his body.
    const SL = fx.speedLines;
    g.lineStyle(Math.max(1, SL.width * view.zoom), colour(look.colours.light), SL.alpha);
    for (const p of this.fast) {
      for (let k = 0; k < SL.count; k++) {
        const across = (k - (SL.count - 1) / 2) * SL.gap;
        const x = p.x - p.dx * SL.behind - p.dy * across;
        const y = p.y - p.dy * SL.behind + p.dx * across - SL.height * 0.5;
        const reach = SL.length * (k === Math.floor(SL.count / 2) ? 1 : 0.7);
        g.lineBetween(view.sx(x), view.sy(y), view.sx(x - p.dx * reach), view.sy(y - p.dy * reach));
      }
    }
  }

  /** Snow and rings: drawn over the players. */
  drawOver(g: Phaser.GameObjects.Graphics, view: View): void {
    const size = Math.max(1.5, fx.spraySize * view.zoom);
    for (const particle of this.particles) {
      g.fillStyle(colour(look.colours.snow), 0.9 * (1 - particle.age / particle.life));
      g.fillRect(view.sx(particle.x) - size / 2, view.sy(particle.y) - size / 2, size, size);
    }
    const bitSize = Math.max(2, fx.confettiSize * view.zoom);
    for (const bit of this.confetti) {
      g.fillStyle(colour(bit.hex), Math.min(1, 2 * (1 - bit.age / bit.life)));
      g.fillRect(view.sx(bit.x) - bitSize / 2, view.sy(bit.y) - bitSize / 2, bitSize, bitSize * 0.6);
    }
    for (const r of this.rings) {
      const k = r.age / r.life;
      g.lineStyle(Math.max(1.5, 0.12 * view.zoom), colour(r.hex), 1 - k);
      g.strokeCircle(view.sx(r.x), view.sy(r.y), r.size * view.zoom * (0.3 + 0.7 * k));
    }
    // A comic star where a hit landed: it bursts out and is gone.
    const I = fx.impact;
    for (const star of this.stars) {
      const k = star.age / I.seconds;
      const size = (star.big ? I.bigSize : I.size) * view.zoom * (0.45 + 0.55 * Math.min(1, k * 3));
      const alpha = k < 0.6 ? 1 : (1 - k) / 0.4;
      const x = view.sx(star.x);
      const y = view.sy(star.y) - view.zoom * 1.2;
      g.fillStyle(colour(I.ink), alpha);
      g.fillPoints(placed(IMPACT, x, y, size * 1.14, size * 0.92, 0) as Phaser.Math.Vector2[], true);
      g.fillStyle(colour(star.big ? I.bigFill : I.fill), alpha);
      g.fillPoints(placed(IMPACT, x, y, size, size * 0.8, 0) as Phaser.Math.Vector2[], true);
    }
  }
}
