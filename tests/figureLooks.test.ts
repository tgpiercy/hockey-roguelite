import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { BUILDS, buildOf, lookOf, teamLooks } from '../src/core/playerLook';
import { portraitOf } from '../src/core/portrait';
import look from '../src/data/rinkLook.json';
import { ACTIONS, figure, lookKey, PLAIN_LOOK, STANDING, withStick, type Figure, type FigureLook, type Shape } from '../src/game/figure';

const F = look.figure;
type Limb = Extract<Shape, { kind: 'limb' }>;
type Circle = Extract<Shape, { kind: 'circle' }>;

const helmetOf = (fig: Figure): Circle => {
  // Where his head is: the face, which the helmet sits on. (The helmet itself is a shell, not a circle.)
  const h = fig.shapes.find((s) => s.tag === 'skin');
  if (!h || h.kind !== 'circle') throw new Error('no head');
  return h;
};
const faceOf = (fig: Figure): Circle => {
  const face = fig.shapes.find((s) => s.tag === 'skin');
  if (!face || face.kind !== 'circle') throw new Error('no face');
  return face;
};
const lowest = (fig: Figure): number => Math.max(...fig.shapes.map((s) => (s.kind === 'circle' ? s.y + s.r : s.kind === 'limb' ? Math.max(s.y1, s.y2) + s.w / 2 : Math.max(...s.points.map((p) => p[1])))));

describe('the head is most of him', () => {
  it('the head is more than half his height, and his face shows an eye and a mouth', () => {
    const fig = figure(STANDING);
    expect(faceOf(fig).r * 2).toBeGreaterThan(F.height * 0.5);
    expect(fig.shapes.filter((s) => s.tag === 'eye').length).toBeGreaterThanOrEqual(2);
    // The helmet does not cover the eye: the shell's lower edge, from brow to nape, passes above it.
    const shell = fig.shapes.find((s) => s.tag === 'helmet');
    if (!shell || shell.kind !== 'poly') throw new Error('no helmet shell');
    const brow = shell.points[0]!;
    const nape = shell.points[shell.points.length - 1]!;
    const eye = fig.shapes.find((s) => s.tag === 'eye') as Circle;
    const edgeAtEye = nape[1] + ((eye.x - nape[0]) / (brow[0] - nape[0])) * (brow[1] - nape[1]);
    expect(eye.y - eye.r).toBeGreaterThan(edgeAtEye);
    // The brow is in front of the face and the nape behind it.
    expect(brow[0]).toBeGreaterThan(faceOf(fig).x);
    expect(nape[0]).toBeLessThan(faceOf(fig).x);
  });
});

describe('what is particular to a player', () => {
  const of = (who: Partial<FigureLook>): Figure => figure(STANDING, { ...PLAIN_LOOK, ...who });
  const widthOf = (fig: Figure): number => fig.shapes.filter((s): s is Limb => s.kind === 'limb' && s.tag === 'jersey').reduce((widest, s) => Math.max(widest, s.w), 0);

  it('a heavy build is wider than a slight one and a tall one stands taller; the head is the same for all', () => {
    expect(widthOf(of({ build: 'heavy' }))).toBeGreaterThan(widthOf(of({ build: 'regular' })));
    expect(widthOf(of({ build: 'regular' }))).toBeGreaterThan(widthOf(of({ build: 'slight' })));
    expect(of({ build: 'tall' }).top).toBeLessThan(of({ build: 'regular' }).top);
    for (const build of BUILDS) {
      expect(faceOf(of({ build })).r).toBeCloseTo(faceOf(of({})).r);
      // Whatever his build, his skates are on the ice.
      expect(lowest(of({ build }))).toBeCloseTo(lowest(of({})));
    }
  });

  it('hair shows at the nape by its style, a bald man has none, and a beard is drawn on the face', () => {
    const hair = (who: Partial<FigureLook>): number => of(who).shapes.filter((s) => s.tag === 'hair').length;
    expect(hair({ hair: 'bald' })).toBe(0);
    expect(hair({ hair: 'short' })).toBeGreaterThan(0);
    expect(hair({ hair: 'flow' })).toBeGreaterThan(hair({ hair: 'short' }));
    expect(hair({ hair: 'bald', beard: 'full' })).toBeGreaterThan(0);
    expect(hair({ hair: 'bald', beard: 'moustache' })).toBe(1);
  });

  it('the helmet has an ear piece, a chin strap and vents; a skater has a visor and a goalie bars', () => {
    const skater = figure(STANDING);
    const keeper = figure({ ...STANDING, goalie: true });
    expect(skater.shapes.filter((s) => s.tag === 'helmet').length).toBe(2);
    expect(skater.shapes.filter((s) => s.tag === 'visor' && s.kind === 'limb').length).toBe(2);
    expect(keeper.shapes.filter((s) => s.tag === 'visor' && s.kind === 'limb').length).toBe(0);
    // Ear hole, two vents and a strap on both; the goalie has his bars as well.
    const dark = (fig: Figure): number => fig.shapes.filter((s) => s.tag === 'cage').length;
    expect(dark(skater)).toBe(4);
    expect(dark(keeper)).toBeGreaterThan(dark(skater));
  });

  it('a captain wears a band and a mascot has ears and no helmet', () => {
    const tags = (who: Partial<FigureLook>): string[] => of(who).shapes.map((s) => s.tag);
    expect(tags({})).not.toContain('mark');
    expect(tags({ mark: 'captain' }).filter((x) => x === 'mark')).toHaveLength(1);
    const mascot = tags({ mark: 'mascot' });
    expect(mascot.filter((x) => x === 'mark').length).toBeGreaterThanOrEqual(3);
    expect(mascot).not.toContain('helmet');
  });

  it('the stick goes in behind the whole near arm, band and all', () => {
    const end = { x: 1.6, y: -0.1 };
    const after = (fig: Figure): string[] => {
      const shapes = withStick(fig, end, 1);
      return shapes.slice(shapes.findIndex((s) => s.tag === 'stick') + 2).map((s) => s.tag);
    };
    expect(after(of({}))).toEqual(['jersey', 'accent', 'glove']);
    expect(after(of({ mark: 'captain' }))).toEqual(['jersey', 'accent', 'mark', 'glove']);
    expect(after(figure({ ...STANDING, goalie: true }))).toEqual(['pad']);
  });

  it('a different look has a different key, and the same look the same one', () => {
    expect(lookKey(PLAIN_LOOK)).toBe(lookKey({ ...PLAIN_LOOK }));
    const keys = new Set<string>();
    for (const build of BUILDS) for (const mark of [undefined, 'captain', 'mascot'] as const) keys.add(lookKey({ ...PLAIN_LOOK, build, ...(mark ? { mark } : {}) }));
    expect(keys.size).toBe(BUILDS.length * 3);
  });
});

describe('a player on the ice looks like his portrait', () => {
  const league = generateLeague('looks');
  const players = Object.values(league.players);

  it('skin, hair and beard are those of his portrait, the same every time', () => {
    for (const p of players.slice(0, 40)) {
      const face = portraitOf(p.id, p.age);
      const who = lookOf(p);
      expect(who).toEqual(lookOf(p));
      expect(who.skin).toBe(face.skin);
      expect(who.hairColour).toBe(face.hairColour);
      expect(who.hair).toBe(face.hairStyle);
      expect(who.beard).toBe(face.beard);
      expect(BUILDS).toContain(who.build);
    }
  });

  it('goalies are tall, and a league has several builds and many different looks', () => {
    for (const p of players.filter((x) => x.position === 'G')) expect(buildOf(p)).toBe('tall');
    const skaters = players.filter((x) => x.position !== 'G');
    expect(new Set(skaters.map(buildOf)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(players.map((p) => JSON.stringify(lookOf(p)))).size).toBeGreaterThan(players.length / 3);
  });

  it('a team has one captain: its best skater, never the goalie', () => {
    const team = league.teams[0]!;
    const roster = team.roster.map((id) => league.players[id]!);
    const looks = teamLooks(roster);
    expect(looks).toHaveLength(roster.length);
    const captains = roster.filter((_, i) => looks[i]!.mark === 'captain');
    expect(captains).toHaveLength(1);
    expect(captains[0]!.position).not.toBe('G');
    expect(captains[0]!.overall).toBe(Math.max(...roster.filter((p) => p.position !== 'G').map((p) => p.overall)));
  });
});

describe('poses for what he is doing', () => {
  const still = figure(STANDING);
  const doing = (action: (typeof ACTIONS)[number]): Figure => figure({ ...STANDING, action });

  it('every action changes the picture, and each is mirror-exact left and right', () => {
    for (const action of ACTIONS) {
      const pose = { ...STANDING, action, goalie: action === 'glove' };
      const right = figure(pose);
      const { action: _none, ...plain } = pose;
      expect(JSON.stringify(right.shapes), action).not.toBe(JSON.stringify(figure(plain).shapes));
      const left = figure({ ...pose, side: -1 });
      expect(left.hand.x).toBeCloseTo(-right.hand.x);
      expect(left.hand.y).toBeCloseTo(right.hand.y);
    }
  });

  it('a pass and a poke push the stick hand forward, a poke further', () => {
    expect(doing('pass').hand.x).toBeGreaterThan(still.hand.x);
    expect(doing('poke').hand.x).toBeGreaterThan(doing('pass').hand.x);
  });

  it('a hit drops the shoulder and leans in; a deke leans back; a tired man is bent over', () => {
    expect(helmetOf(doing('hit')).x).toBeGreaterThan(helmetOf(still).x);
    expect(helmetOf(doing('hit')).y).toBeGreaterThan(helmetOf(still).y);
    expect(helmetOf(doing('deke')).x).toBeLessThan(helmetOf(still).x);
    expect(helmetOf(doing('tired')).y).toBeGreaterThan(helmetOf(still).y);
    expect(doing('tired').hand.y).toBeGreaterThan(still.hand.y);
  });

  it('a glove save throws the catching glove up', () => {
    const glove = (fig: Figure): number => Math.min(...fig.shapes.filter((s): s is Circle => s.tag === 'glove' && s.kind === 'circle').map((s) => s.y));
    const standing = figure({ ...STANDING, goalie: true });
    const save = figure({ ...STANDING, goalie: true, action: 'glove' });
    expect(glove(save)).toBeLessThan(glove(standing) - 0.5);
  });

  it('the scorer raises both hands and a team-mate one', () => {
    const raised = (fig: Figure): number => fig.shapes.filter((s): s is Circle => s.tag === 'glove' && s.kind === 'circle').filter((s) => s.y < faceOf(fig).y + 0.6).length;
    expect(raised(figure({ ...STANDING, cheer: true }))).toBe(2);
    expect(raised(figure({ ...STANDING, mateCheer: true }))).toBe(1);
    expect(raised(still)).toBe(0);
  });
});
