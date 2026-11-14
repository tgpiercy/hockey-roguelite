import physics from '../data/physics.json';

/** Every number the simulation uses. The shape comes from src/data/physics.json. */
export type Tuning = typeof physics;

export const defaultTuning: Tuning = physics;

/** A separate copy that can be edited without touching the defaults. */
export function cloneTuning(source: Tuning = physics): Tuning {
  return JSON.parse(JSON.stringify(source)) as Tuning;
}
