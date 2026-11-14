import { barShares, linePath, linePoints } from './chartMath';

/** One horizontal bar: a name, the bar, and its figure. `tone` colours it as money in or money out. */
export function BarRow({ name, share, figure, tone }: { name: string; share: number; figure: string; tone: 'in' | 'out' | 'net' }) {
  return (
    <span class={`bar-row ${tone}`}>
      <span class="bar-name">{name}</span>
      <span class="bar-track">
        <span class="bar-amount" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
      </span>
      <b class="bar-figure">{figure}</b>
    </span>
  );
}

/** How long each of a set of bars should be, against the longest of them. */
export const sharesOf = barShares;

export interface Series {
  name: string;
  values: number[];
  colour: string;
}

/**
 * A small line chart of one or more series over the same steps (seasons). All of them share one scale that
 * starts at zero (or below, if any figure is negative); the legend gives each one's latest figure.
 */
export function LineChart({ series, labels, format, width = 260, height = 78 }: { series: Series[]; labels: string[]; format: (value: number) => string; width?: number; height?: number }) {
  const usable = series.filter((s) => s.values.length > 0);
  if (usable.length === 0) return null;
  const all = usable.flatMap((s) => s.values);
  const range = { low: Math.min(0, ...all), high: Math.max(0, ...all) };
  return (
    <div class="line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Chart over seasons" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} class="grid-line" />
        ))}
        {usable.map((s) => {
          const points = linePoints(s.values, width, height, 8, range);
          return (
            <g key={s.name}>
              <path d={linePath(points)} fill="none" stroke={s.colour} stroke-width="2.500" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="2.600" fill={s.colour} />
              ))}
            </g>
          );
        })}
      </svg>
      <div class="chart-foot">
        <span class="chart-range">
          {labels[0]}
          {labels.length > 1 ? ` to ${labels[labels.length - 1]}` : ''}
        </span>
        {usable.map((s) => (
          <span key={s.name} class="chart-key">
            <i style={{ background: s.colour }} />
            {s.name} <b>{format(s.values[s.values.length - 1] as number)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
