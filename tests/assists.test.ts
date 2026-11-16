import { describe, expect, it } from 'vitest';
import { ASSIST_STEPS, ASSISTS, assistLine, assistsChanged, assistSteps, assistStrengths, assistTuning, nextAssistStep, presetStep, resetAssists, setAssist, type AssistKind } from '../src/core/assists';
import { generateLeague } from '../src/core/generate';
import { franchiseOf, fromSave, toSave } from '../src/core/save';
import { DIFFICULTIES, newFranchise, setDifficulty } from '../src/core/season';
import { checkRules } from '../src/sim/check';
import { cloneTuning } from '../src/sim/tuning';
import { createWorld } from '../src/sim/world';
import { ID, player } from './helpers';

const fresh = (difficulty?: string) => newFranchise(generateLeague('assists'), difficulty);
const KINDS: AssistKind[] = ['aim', 'pass', 'check', 'goalie'];

describe('the help as settings', () => {
  it('has four kinds, each with steps that exist, the most help first', () => {
    expect(ASSISTS.map((a) => a.id)).toEqual(KINDS);
    expect(ASSIST_STEPS[0]!.strength).toBe(1);
    expect(ASSIST_STEPS[ASSIST_STEPS.length - 1]!.strength).toBe(0);
    for (const a of ASSISTS) {
      expect(a.what.length).toBeGreaterThan(0);
      expect(a.steps.length).toBeGreaterThanOrEqual(2);
      const strengths = a.steps.map((id) => ASSIST_STEPS.find((s) => s.id === id)!.strength);
      expect([...strengths].sort((x, y) => y - x)).toEqual(strengths);
    }
  });

  it('every difficulty names a real step for every kind, and never more help than an easier one', () => {
    const strength = (difficulty: string, kind: AssistKind): number => ASSIST_STEPS.find((s) => s.id === presetStep(difficulty, kind))!.strength;
    for (const d of DIFFICULTIES) for (const a of ASSISTS) expect(a.steps).toContain(presetStep(d.id, a.id));
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      for (const kind of KINDS) expect(strength(DIFFICULTIES[i]!.id, kind)).toBeLessThanOrEqual(strength(DIFFICULTIES[i - 1]!.id, kind));
    }
  });

  it('a franchise has what its difficulty gives until it chooses otherwise, and the choice can be undone', () => {
    const f = fresh('rookie');
    for (const kind of KINDS) expect(assistSteps(f)[kind].id).toBe(presetStep('rookie', kind));
    expect(assistsChanged(f)).toBe(false);
    expect(setAssist(f, 'aim', 'off').ok).toBe(true);
    expect(assistSteps(f).aim.id).toBe('off');
    expect(assistStrengths(f).aim).toBe(0);
    expect(assistsChanged(f)).toBe(true);
    expect(assistLine(f)).toContain('off');
    // Set back to the difficulty's own step, the choice is forgotten.
    setAssist(f, 'aim', presetStep('rookie', 'aim'));
    expect(f.assists).toBeUndefined();
    setAssist(f, 'goalie', 'off');
    expect(resetAssists(f).ok).toBe(true);
    expect(f.assists).toBeUndefined();
  });

  it('refuses a kind or a step that does not exist', () => {
    const f = fresh();
    expect(setAssist(f, 'nonsense' as AssistKind, 'off').ok).toBe(false);
    expect(setAssist(f, 'pass', 'part').ok).toBe(false);
  });

  it('a press steps through a kind and comes round again', () => {
    const f = fresh('rookie');
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = nextAssistStep(f, 'aim');
      seen.push(next);
      setAssist(f, 'aim', next);
    }
    expect(new Set(seen).size).toBe(3);
    expect(assistSteps(f).aim.id).toBe(presetStep('rookie', 'aim'));
  });

  it('changing the difficulty puts the help back to what the new one gives', () => {
    const f = fresh('rookie');
    setAssist(f, 'check', 'off');
    expect(setDifficulty(f, 'pro').ok).toBe(true);
    expect(f.assists).toBeUndefined();
  });

  it('is kept in the save', () => {
    const f = fresh('rookie');
    setAssist(f, 'goalie', 'off');
    const loaded = fromSave(JSON.parse(JSON.stringify(toSave(f, '2026-11-16T00:00:00.000Z'))));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(assistSteps(franchiseOf(loaded.save)).goalie.id).toBe('off');
  });

  it('reaches the ice as four shares of the full strength, on a copy', () => {
    const t = cloneTuning();
    const half = assistTuning(t, { aim: 0.5, pass: 0, check: 0.5, goalie: 1 });
    expect(half.aimAssist.strength).toBe(t.aimAssist.strength * 0.5);
    expect(half.passAssist.strength).toBe(0);
    expect(half.goalieAssist.strength).toBe(t.goalieAssist.strength);
    expect(t.aimAssist.strength).toBe(1);
    expect(half.rink).toBe(t.rink);
  });

  it('part of the check help is part of the way from the plain limits to the helped ones', () => {
    const t = cloneTuning();
    const world = createWorld(t, 'check-help', {});
    world.human!.controlled = ID.home1;
    const me = player(world, ID.home1);
    const full = checkRules(world, me, t);
    const part = checkRules(world, me, assistTuning(t, { aim: 1, pass: 1, check: 0.5, goalie: 1 }));
    const off = checkRules(world, me, assistTuning(t, { aim: 1, pass: 1, check: 0, goalie: 1 }));
    expect(off.pokeBonus).toBe(0);
    expect(off.pokeConeDegrees).toBe(t.check.pokeConeDegrees);
    expect(full.pokeBonus).toBe(t.checkAssist.pokeChanceBonus);
    expect(part.pokeBonus).toBeCloseTo(full.pokeBonus / 2);
    expect(part.pokeConeDegrees).toBeCloseTo((full.pokeConeDegrees + off.pokeConeDegrees) / 2);
    expect(part.bodyHoldSeconds).toBeCloseTo((full.bodyHoldSeconds + off.bodyHoldSeconds) / 2);
    // His team-mates' share of it shrinks the same way.
    const mate = player(world, ID.home2);
    expect(checkRules(world, mate, assistTuning(t, { aim: 1, pass: 1, check: 0.5, goalie: 1 })).pokeBonus).toBeCloseTo(checkRules(world, mate, t).pokeBonus / 2);
  });
});
