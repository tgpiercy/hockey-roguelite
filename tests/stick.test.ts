import { describe, expect, it } from 'vitest';
import { applyDeadzone } from '../src/sim/stick';

describe('applyDeadzone', () => {
  it('returns zero inside the dead zone', () => {
    expect(applyDeadzone(0, 0, 0.15)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(0.1, -0.05, 0.15)).toEqual({ x: 0, y: 0 });
  });

  it('gives full strength at full tilt', () => {
    const v = applyDeadzone(1, 0, 0.15);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it('rescales smoothly from the edge of the dead zone', () => {
    expect(applyDeadzone(0.575, 0, 0.15).x).toBeCloseTo(0.5);
    expect(applyDeadzone(0, -0.16, 0.15).y).toBeCloseTo(-0.0118, 3);
  });

  it('keeps direction and never exceeds strength 1', () => {
    const v = applyDeadzone(1, 1, 0.15);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(v.y);
  });
});
