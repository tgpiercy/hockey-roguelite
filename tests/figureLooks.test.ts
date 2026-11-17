import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/core/generate';
import { BUILDS, buildOf, lookOf, teamLooks } from '../src/core/playerLook';
import { portraitOf } from '../src/core/portrait';
import look from '../src/data/rinkLook.json';
import { teamCrest } from '../src/core/crest';
import { MASCOT_KINDS, mascotKind, mascotLook } from '../src/core/mascotKind';
import mascotData from '../src/data/mascotLook.json';
import names from '../src/data/names.json';
import { ACTIONS, figure, figureColours, lookKey, PLAIN_LOOK, STANDING, withStick, type Figure, type FigureLook, type Shape } from '../src/game/figure';

const F = look.figure;
type Limb = Extract<Shape, { kind: 'limb' }>;
type Circle = Extract<Shape, { kind: 'circle' }>;

type Poly = Extract<Shape, { kind: 'poly' }>;
/** The middle of a many-sided piece and half its width. */
const middle = (s: Poly): { x: number; y: number; r: number } => {
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, r: (Math.max(...xs) - Math.min(...xs)) / 2 };
};
/** Where his head is: his face, which the helmet sits on. */
const helmetOf = (fig: Figure): { x: number; y: number; r: number } => {
  const face = fig.shapes.find((s): s is Poly => s.tag === 'skin' && s.kind === 'poly');
  if (!face) throw new Error('no head');
  return middle(face);
};
const faceOf = helmetOf;
const lowest = (fig: Figure): number => Math.max(...fig.shapes.map((s) => (s.kind === 'circle' ? s.y + s.r : s.kind === 'limb' ? Math.max(s.y1, s.y2) + s.w / 2 : Math.max(...s.points.map((p) => p[1])))));

describe('the head is a head, not most of him', () => {
  it('he stands more than three heads tall, and his face shows an eye, a brow and a mouth under the helmet', () => {
    const fig = figure(STANDING);
    const shell = fig.shapes.find((s): s is Poly => s.tag === 'helmet' && s.kind === 'poly');
    if (!shell) throw new Error('no helmet shell');
    const ys = [...shell.points.map((p) => p[1]), ...(fig.shapes.find((s): s is Poly => s.tag === 'skin' && s.kind === 'poly')?.points.map((p) => p[1]) ?? [])];
    const headHeight = Math.max(...ys) - Math.min(...ys);
    expect(F.height / headHeight).toBeGreaterThan(3);
    expect(F.height / headHeight).toBeLessThan(4.5);
    expect(fig.shapes.filter((s) => s.tag === 'eye').length).toBeGreaterThanOrEqual(3);
    // The eye is on the face, in front of its middle, and below the helmet's brow.
    const eye = fig.shapes.find((s) => s.tag === 'eye') as Circle;
    expect(eye.x).toBeGreaterThan(faceOf(fig).x);
    expect(eye.y).toBeGreaterThan(Math.min(...shell.points.map((p) => p[1])) + headHeight * 0.4);
    // He is drawn in profile: the nose stands out in front of the helmet's brow.
    const face = fig.shapes.find((s): s is Poly => s.tag === 'skin' && s.kind === 'poly')!;
    expect(Math.max(...face.points.map((p) => p[0]))).toBeGreaterThan(Math.max(...shell.points.map((p) => p[0])));
  });

  it('the arm and leg on his far side are marked as such, and nothing else is', () => {
    const fig = figure(STANDING);
    const farTags = new Set(fig.shapes.filter((s) => s.far).map((s) => s.tag));
    expect([...farTags].sort()).toEqual(['accent', 'blade', 'glove', 'jersey', 'pants', 'skate', 'sock']);
    expect(fig.shapes.filter((s) => s.far && (s.tag === 'skin' || s.tag === 'helmet'))).toHaveLength(0);
    expect(fig.shapes.filter((s) => s.tag === 'skate' && s.far)).toHaveLength(1);
  });
});

describe('what is particular to a player', () => {
  const of = (who: Partial<FigureLook>): Figure => figure(STANDING, { ...PLAIN_LOOK, ...who });
  const widthOf = (fig: Figure): number => fig.shapes.filter((s): s is Poly => s.kind === 'poly' && s.tag === 'jersey').reduce((widest, s) => Math.max(widest, middle(s).r), 0);

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
    // A skater's helmet is one shell; a goalie's has a chin guard as well.
    expect(skater.shapes.filter((s) => s.tag === 'helmet').length).toBe(1);
    expect(keeper.shapes.filter((s) => s.tag === 'helmet').length).toBe(2);
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
    expect(mascot.filter((x) => x === 'fur').length).toBeGreaterThanOrEqual(2);
    expect(mascot).toContain('muzzle');
    expect(mascot).not.toContain('helmet');
    expect(mascot).not.toContain('skin');
  });

  it('the stick goes in behind the whole near arm, band and all', () => {
    const end = { x: 1.6, y: -0.1 };
    const after = (fig: Figure): string[] => {
      const shapes = withStick(fig, end, 1);
      return shapes.slice(shapes.findIndex((s) => s.tag === 'stick') + 2).map((s) => s.tag);
    };
    expect(after(of({}))).toEqual(['jersey', 'jersey', 'accent', 'glove', 'glove']);
    expect(after(of({ mark: 'captain' }))).toEqual(['jersey', 'jersey', 'accent', 'mark', 'glove', 'glove']);
    expect(after(figure({ ...STANDING, goalie: true }))).toEqual(['jersey', 'jersey', 'accent', 'pad', 'accent']);
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


describe('a mascot wears the costume of his club', () => {
  it('a club named for an animal has that animal, and any other club the same one every time', () => {
    expect(mascotKind('Highmoor Owls')).toBe('owl');
    expect(mascotKind('Foxcombe Foxes')).toBe('fox');
    expect(mascotKind('Northgate Otters')).toBe('otter');
    expect(mascotKind('Highmoor Badgers')).toBe('badger');
    expect(mascotKind('Eastmere Herons')).toBe('bird');
    expect(mascotKind('Highmoor Comets')).toBe(mascotKind('Highmoor Comets'));
    expect(mascotData.others).toContain(mascotKind('Highmoor Comets'));
    expect(mascotData.others).toContain(mascotKind('The Night Shift'));
    for (const kind of [...Object.values(mascotData.byNoun), ...mascotData.others]) expect(MASCOT_KINDS).toContain(kind);
    // Every club a league can have gets a costume that exists.
    for (const place of names.teamPlaces) for (const noun of names.teamNouns) expect(MASCOT_KINDS).toContain(mascotKind(`${place} ${noun}`));
  });

  it('every costume has its colours and is drawn differently on the ice, in every pose', () => {
    const drawn = new Set<string>();
    for (const kind of MASCOT_KINDS) {
      const K = mascotLook(kind);
      expect(K.fur).toMatch(/^#[0-9a-f]{6}$/i);
      expect(K.muzzle).toMatch(/^#[0-9a-f]{6}$/i);
      expect(K.name.length).toBeGreaterThan(3);
      const who = { ...PLAIN_LOOK, build: 'heavy' as const, mark: 'mascot' as const, costume: kind };
      const fig = figure(STANDING, who);
      drawn.add(JSON.stringify(fig.shapes.map((s) => `${s.kind}:${s.tag}`)));
      // A tail, where he has one, is behind him.
      const tails = figure(STANDING, who).shapes.length - figure(STANDING, { ...who, costume: 'bear' }).shapes.length;
      if (K.tail !== 'none' && K.ears === 'round' && K.snout === 'short') expect(tails).toBeGreaterThan(0);
      for (const action of ACTIONS) expect(figure({ ...STANDING, action, goalie: action === 'glove' }, who).shapes.length).toBeGreaterThan(10);
      expect(lookKey(who)).toContain(kind);
    }
    expect(drawn.size).toBeGreaterThanOrEqual(MASCOT_KINDS.length - 1);
  });

  it('his paws and legs are fur whichever kit his club wears, and a player keeps his gloves', () => {
    const crest = teamCrest('Highmoor Owls');
    const fur = mascotLook('owl').fur;
    for (const kit of ['home', 'away'] as const) {
      const colours = figureColours(crest, false, '#000000', kit, undefined, 'owl');
      expect(colours.glove).toBe(fur);
      expect(colours.sock).toBe(fur);
      expect(colours.fur).toBe(fur);
      expect(figureColours(crest, false, '#000000', kit).glove).not.toBe(fur);
    }
  });
});
