/** How long each bar should be, as a share (0 to 1) of the longest. Zero, negative or missing values give an empty bar. */
export function barShares(values: readonly number[]): number[] {
  const largest = Math.max(0, ...values.filter((value) => Number.isFinite(value)));
  return values.map((value) => (largest <= 0 || !(value > 0) ? 0 : value / largest));
}

/**
 * Where each value of a series sits in a chart box `width` by `height`, with y measured down from the top.
 * The lowest value is at the bottom and the highest at the top, with a little room above and below;
 * a flat series runs through the middle; a single value sits in the centre. Give `range` to put several
 * series on one shared scale instead of each on its own.
 */
export function linePoints(values: readonly number[], width: number, height: number, pad = 4, range?: { low: number; high: number }): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const low = range ? range.low : Math.min(...values);
  const high = range ? range.high : Math.max(...values);
  const span = high - low;
  const inner = Math.max(0, height - pad * 2);
  return values.map((value, i) => ({
    x: values.length === 1 ? width / 2 : (i / (values.length - 1)) * width,
    y: span === 0 ? height / 2 : pad + (1 - (value - low) / span) * inner,
  }));
}

/** The points of a series as an SVG path. */
export function linePath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}
