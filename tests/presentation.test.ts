import { describe, expect, it } from 'vitest';
import { EMBLEM_PARTS, luminance, SHAPE_POINTS, teamCrest } from '../src/core/crest';
import { generateLeague } from '../src/core/generate';
import { colourDistance, teamColour } from '../src/core/teamColours';
import audio from '../src/data/audio.json';
import crestRules from '../src/data/crests.json';
import prestigeRules from '../src/data/prestige.json';
import { crowdLift, cuesFor, soundSeconds, type SoundName } from '../src/game/soundMap';
import { cloneTuning } from '../src/sim/tuning';
import type { SimEvent } from '../src/sim/types';
import { DEFAULT_PREFS, parsePrefs, touchVisible, VOLUME_STEPS } from '../src/ui/prefs';

describe('team crests', () => {
  const league = generateLeague('crests');
  const names = league.teams.map((team) => team.name);

  it('every team gets a valid crest, the same every time', () => {
    for (const name of names) {
      const crest = teamCrest(name);
      expect(crestRules.shapes).toContain(crest.shape);
      expect(crestRules.emblems).toContain(crest.emblem);
      expect(crestRules.patterns).toContain(crest.pattern);
      expect(crest.primary).toBe(teamColour(name));
      expect(crest.secondary).toMatch(/^#[0-9a-f]{6}$/);
      expect(teamCrest(name)).toEqual(crest);
    }
  });

  it('the second colour always stands out against the main one, and the border against the field', () => {
    for (const name of names) {
      const crest = teamCrest(name);
      expect(colourDistance(crest.primary, crest.secondary)).toBeGreaterThanOrEqual(crestRules.minSecondaryDistance);
      expect(Math.abs(luminance(crest.trim) - luminance(crest.primary))).toBeGreaterThan(0.3);
    }
  });

  it('your crest wears the jersey colour you chose, whichever it is', () => {
    for (const jersey of prestigeRules.jerseys) {
      const crest = teamCrest(names[0]!, jersey.colour);
      expect(crest.primary).toBe(jersey.colour);
      expect(colourDistance(crest.primary, crest.secondary)).toBeGreaterThanOrEqual(crestRules.minSecondaryDistance);
      // The shape and emblem are the team's, whatever colour it wears.
      expect(crest.shape).toBe(teamCrest(names[0]!).shape);
      expect(crest.emblem).toBe(teamCrest(names[0]!).emblem);
    }
  });

  it('the league does not all look alike', () => {
    const crests = names.map((name) => teamCrest(name));
    expect(new Set(crests.map((c) => c.shape)).size).toBeGreaterThan(1);
    expect(new Set(crests.map((c) => c.emblem)).size).toBeGreaterThan(3);
    expect(new Set(crests.map((c) => `${c.shape}/${c.emblem}/${c.primary}`)).size).toBeGreaterThan(names.length * 0.8);
  });

  it('every shape and emblem has something to draw, inside the badge', () => {
    for (const shape of crestRules.shapes) {
      const points = SHAPE_POINTS[shape as keyof typeof SHAPE_POINTS];
      expect(points.length).toBeGreaterThanOrEqual(4);
      for (const [x, y] of points) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(1);
    }
    for (const emblem of crestRules.emblems) {
      const parts = EMBLEM_PARTS[emblem]!;
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) for (const [x, y] of part.points) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(0.75);
    }
  });
});

describe('which sound goes with what', () => {
  const t = cloneTuning();
  const names = (events: SimEvent[], myTeam: 0 | 1 = 0): SoundName[] => cuesFor(events, myTeam, t).map((cue) => cue.name);
  const goal = (team: 0 | 1): SimEvent => ({ type: 'goal', side: 1, team, scorer: null, assists: [] });

  it('your goal is a horn and a roar; theirs is a groan', () => {
    expect(names([goal(0)])).toEqual(['horn', 'roar']);
    expect(names([goal(1)])).toEqual(['groan']);
    expect(names([goal(1)], 1)).toEqual(['horn', 'roar']);
  });

  it('every kind of event has its sound', () => {
    expect(names([{ type: 'shot', speed: 30, player: 0 }])).toEqual(['shot']);
    expect(names([{ type: 'pass', player: 0, target: 1, saucer: false }])).toEqual(['pass']);
    expect(names([{ type: 'post' }])).toEqual(['post']);
    expect(names([{ type: 'save', goalie: 6, frozen: false }])).toEqual(['save']);
    expect(names([{ type: 'check', player: 0, target: 7, kind: 'body', success: true }])).toEqual(['hit']);
    expect(names([{ type: 'check', player: 0, target: 7, kind: 'poke', success: true }])).toEqual(['poke']);
    expect(names([{ type: 'check', player: 0, target: 7, kind: 'poke', success: false }])).toEqual([]);
    expect(names([{ type: 'pickup', player: 0 }])).toEqual(['tap']);
    expect(names([{ type: 'faceoff', winner: 0 }])).toEqual(['drop']);
    expect(names([{ type: 'faceoff', winner: null }])).toEqual([]);
    expect(names([{ type: 'period', period: 2 }])).toEqual(['whistle']);
    expect(names([{ type: 'final' }])).toEqual(['whistle']);
    expect(names([{ type: 'powerup', team: 0, slot: 0, id: 'x' }])).toEqual(['chime']);
    expect(names([{ type: 'talent', player: 0, id: 'x' }])).toEqual(['chime']);
    expect(names([{ type: 'change', team: 0, off: 0, on: 3 }])).toEqual([]);
  });

  it('a hard shot is louder than a soft one, and a body check that lands louder than one that misses', () => {
    const loud = (speed: number): number => cuesFor([{ type: 'shot', speed, player: 0 }], 0, t)[0]!.gain;
    expect(loud(t.shot.maxSpeed)).toBeCloseTo(1);
    expect(loud(t.shot.maxSpeed)).toBeGreaterThan(loud(t.shot.wristSpeed));
    expect(loud(1)).toBeCloseTo(audio.shotMinGain);
    const hit = (success: boolean): number => cuesFor([{ type: 'check', player: 0, target: 7, kind: 'body', success }], 0, t)[0]!.gain;
    expect(hit(true)).toBeGreaterThan(hit(false));
  });

  it('the crowd rises most for a goal, a little for a shot or a save, and not at all for a pass', () => {
    expect(crowdLift([goal(1)])).toBe(1);
    expect(crowdLift([{ type: 'shot', speed: 20, player: 0 }])).toBe(audio.crowd.shotLift);
    expect(crowdLift([{ type: 'save', goalie: 6, frozen: true }])).toBe(audio.crowd.saveLift);
    expect(crowdLift([{ type: 'pass', player: 0, target: 1, saucer: false }])).toBe(0);
    expect(crowdLift([])).toBe(0);
  });
});

describe('the sound recipes', () => {
  const sounds = Object.keys(audio.sounds) as SoundName[];

  it('there is no skating sound: it was removed after listening', () => {
    expect(audio).not.toHaveProperty('skate');
    expect(sounds).not.toContain('skate');
  });

  it('every sound the game asks for has a recipe', () => {
    const asked: SoundName[] = ['horn', 'roar', 'groan', 'shot', 'pass', 'post', 'save', 'hit', 'poke', 'tap', 'drop', 'whistle', 'chime', 'tick', 'select', 'back', 'reveal', 'legendary'];
    for (const name of asked) expect(sounds).toContain(name);
  });

  it('every layer is a real wave with a sensible pitch, length and level', () => {
    for (const name of sounds) {
      for (const layer of audio.sounds[name] as Record<string, unknown>[]) {
        expect(['noise', 'sine', 'square', 'sawtooth', 'triangle']).toContain(layer.wave);
        expect(layer.freq).toBeGreaterThan(20);
        expect(layer.freq).toBeLessThan(8000);
        expect(layer.duration).toBeGreaterThan(0.01);
        expect(layer.duration).toBeLessThan(3);
        expect(layer.gain).toBeGreaterThan(0);
        expect(layer.gain).toBeLessThanOrEqual(1);
      }
      // All layers at once stay within what the limiter can hold.
      const total = (audio.sounds[name] as { gain: number }[]).reduce((sum, layer) => sum + layer.gain, 0);
      expect(total * audio.masterGain).toBeLessThanOrEqual(audio.peakLimit);
    }
  });

  it('short sounds are short and long ones long', () => {
    expect(soundSeconds('tick')).toBeLessThan(0.1);
    expect(soundSeconds('pass')).toBeLessThan(0.15);
    expect(soundSeconds('horn')).toBeGreaterThan(1);
    expect(soundSeconds('roar')).toBeGreaterThan(soundSeconds('horn'));
    expect(soundSeconds('chime')).toBeCloseTo(0.44);
  });
});

describe('device preferences', () => {
  it('start with sound on at a moderate volume and full detail', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toEqual({ sound: true, volume: 0.7, detail: 'full', touch: 'auto', hints: true, replays: true, holdSwitch: false, bigPuck: false, calm: false, rumble: true, fullscreen: true, commentary: 'text', voice: '', music: true, musicVolume: 0.5 });
    expect(VOLUME_STEPS).toContain(DEFAULT_PREFS.volume);
  });

  it('are read back as they were saved', () => {
    const saved = { sound: false, volume: 0.4, detail: 'low' as const, touch: 'never' as const, hints: false, replays: false, holdSwitch: true, bigPuck: true, calm: true, rumble: false, fullscreen: false, commentary: 'voice' as const, voice: 'English United Kingdom', music: false, musicVolume: 0.2 };
    expect(parsePrefs(JSON.stringify(saved))).toEqual(saved);
  });

  it('fall back to the default for anything missing, broken or out of range', () => {
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('42')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"sound":"yes","volume":"loud","detail":"ultra"}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"sound":false}')).toEqual({ ...DEFAULT_PREFS, sound: false });
    expect(parsePrefs('{"volume":7}').volume).toBe(1);
    expect(parsePrefs('{"volume":-3}').volume).toBe(0);
  });

  it('keep preferences stored before the on-screen controls setting existed', () => {
    expect(parsePrefs('{"sound":false,"volume":0.4,"detail":"low"}')).toEqual({ sound: false, volume: 0.4, detail: 'low', touch: 'auto', hints: true, replays: true, holdSwitch: false, bigPuck: false, calm: false, rumble: true, fullscreen: true, commentary: 'text', voice: '', music: true, musicVolume: 0.5 });
    expect(parsePrefs('{"touch":"sometimes"}').touch).toBe('auto');
  });

  it('show the on-screen controls when asked, and by themselves only for a touch player', () => {
    expect(touchVisible('auto', false, false)).toBe(false);
    expect(touchVisible('auto', true, false)).toBe(true);
    expect(touchVisible('auto', true, true)).toBe(false);
    expect(touchVisible('always', false, true)).toBe(true);
    expect(touchVisible('never', true, false)).toBe(false);
  });
});
