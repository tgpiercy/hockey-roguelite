import type * as Phaser from 'phaser';
import { createRng } from '../core/rng';
import look from '../data/rinkLook.json';
import type { Tuning } from '../sim/tuning';
import type { SimEvent, World } from '../sim/types';

const fx = look.effects;
const colour = (hex: string): number => Number.parseInt(hex.slice(1), 16);

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
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private confetti: Confetto[] = [];
  /** The two teams' colours, for the confetti: set by the scene. */
  teamColours: [string, string] = [look.colours.teamHome, look.colours.teamAway];
  private trail: { x: number; y: number; age: number }[] = [];
  private lastPos = new Map<number, { x: number; y: number; speed: number }>();
  /** How far through his stride each player is, in radians. */
  readonly stride = new Map<number, number>();
  /** What each player has just done (a pass, a poke, a hit; a goalie's glove save), and the seconds it is still shown for. */
  readonly action = new Map<number, { kind: 'pass' | 'poke' | 'hit' | 'glove'; left: number }>();
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
      } else if (e.type === 'check' && !e.success) {
        this.action.set(e.player, { kind: e.kind === 'body' ? 'hit' : 'poke', left: e.kind === 'body' ? look.figure.actionSeconds.hit : look.figure.actionSeconds.poke });
      } else if (e.type === 'check' && e.success) {
        this.action.set(e.player, { kind: e.kind === 'body' ? 'hit' : 'poke', left: e.kind === 'body' ? look.figure.actionSeconds.hit : look.figure.actionSeconds.poke });
        const target = players[e.target];
        if (target) {
          this.addRing(target.pos.x, target.pos.y, e.kind === 'body' ? fx.hitRingSize : fx.hitRingSize * 0.6, look.colours.accent);
          if (e.kind === 'body') {
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
        this.excitement = Math.max(this.excitement, 0.5);
      } else if (e.type === 'shot') {
        this.excitement = Math.max(this.excitement, Math.min(0.6, e.speed / t.shot.maxSpeed));
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
      if (left - dt <= 0) this.padsDown.delete(id);
      else this.padsDown.set(id, left - dt);
    }

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
      this.stride.set(p.id, (this.stride.get(p.id) ?? this.rng.range(0, 6)) + speed * dt * fx.stridePerMetre);
      const last = this.lastPos.get(p.id);
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
    for (const mark of this.marks) mark.age += dt;
    this.marks = this.marks.filter((mark) => mark.age < fx.markSeconds);

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

  /** Marks cut into the ice: drawn under the players. */
  drawUnder(g: Phaser.GameObjects.Graphics, view: View): void {
    const width = Math.max(1, fx.markWidth * view.zoom);
    for (const mark of this.marks) {
      g.lineStyle(width, colour(look.colours.mark), fx.markAlpha * (1 - mark.age / fx.markSeconds));
      g.lineBetween(view.sx(mark.x1), view.sy(mark.y1), view.sx(mark.x2), view.sy(mark.y2));
    }
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      g.lineStyle(Math.max(1.5, fx.trailWidth * view.zoom), colour(look.colours.puck), fx.trailAlpha * (1 - b.age / fx.trailSeconds));
      g.lineBetween(view.sx(a.x), view.sy(a.y), view.sx(b.x), view.sy(b.y));
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
  }
}
