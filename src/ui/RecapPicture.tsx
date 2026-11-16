import type { Crest } from '../core/crest';
import { fitList, fitWords, type SeasonRecap } from '../core/recap';
import gameInfo from '../data/game.json';
import look from '../data/mapLook.json';
import { CrestBadge } from './Crest';

const W = look.recap.width;
const H = look.recap.height;
const BAND = look.recap.band;

/** A menu colour, read from the page so the picture carries real colours with it when it is saved. */
function shade(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The season on one card, drawn as a plain SVG so it can be saved as a picture: the club and its crest
 * on a band of its colour, how the season ended, and the handful of things worth remembering about it.
 */
export function RecapPicture({ recap, crest, id }: { recap: SeasonRecap; crest: Crest; id: string }) {
  const c = { deep: shade('--bg-deep'), panel: shade('--panel'), text: shade('--text'), dim: shade('--dim'), accent: shade('--accent'), good: shade('--good'), team: shade('--team'), ink: shade('--team-ink'), line: shade('--dim') };
  const font = "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";
  const room = look.recap.lineChars;
  const facts: [string, string][] = [
    ['Record', `${recap.wins} won, ${recap.losses} lost${recap.place !== null ? ` · ${recap.place}${nth(recap.place)} of ${recap.teams}` : ''}`],
    ['Top scorer', recap.topScorer ? `${recap.topScorer.name}, ${recap.topScorer.goals} goal${recap.topScorer.goals === 1 ? '' : 's'}` : 'Nobody scored'],
    ['Bosses beaten', recap.bosses.length > 0 ? fitList(recap.bosses, room) : 'None'],
    ['Artifacts', recap.artifacts.length > 0 ? fitList(recap.artifacts, room) : 'None'],
    ...(recap.cup ? ([['The cup', 'Won']] as [string, string][]) : []),
    ...(recap.setup ? ([['Played under', fitWords(recap.setup, room)]] as [string, string][]) : []),
  ];
  const x0 = BAND + 28;
  const dot = look.recap.roadDot;
  const kinds = look.recap.roadColours as Record<string, string>;
  return (
    <svg id={id} class="recap" viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg" font-family={font} role="img" aria-label={`Season ${recap.season}: ${recap.finish}`}>
      <rect width={W} height={H} fill={c.deep} />
      <rect width={BAND} height={H} fill={c.team} />
      <g transform={`translate(${BAND / 2 - 70} 40)`}>
        <CrestBadge crest={crest} size={140} />
      </g>
      <text x={BAND / 2} y={222} text-anchor="middle" font-size="20" font-weight="700" fill={c.ink}>
        {fitWords(recap.club.toUpperCase(), 22)}
      </text>
      <text x={BAND / 2} y={250} text-anchor="middle" font-size="16" fill={c.ink} opacity="0.85">
        Season {recap.season} · {recap.difficulty}
      </text>
      <text x={BAND / 2} y={272} text-anchor="middle" font-size="14" fill={c.ink} opacity="0.7">
        {fitWords(recap.league.charAt(0).toUpperCase() + recap.league.slice(1), 34)}
      </text>
      <text x={BAND / 2} y={H - 22} text-anchor="middle" font-size="13" font-weight="700" letter-spacing="2" fill={c.ink} opacity="0.7">
        {gameInfo.title.toUpperCase()}
      </text>

      <text x={x0} y={74} font-size="46" font-weight="700" fill={recap.champion ? c.accent : c.text}>
        {recap.finish.toUpperCase()}
      </text>
      <rect x={x0} y={90} width={W - x0 - 28} height={2} fill={c.line} opacity="0.4" />
      {facts.map(([label, value], i) => (
        <g key={label} transform={`translate(${x0} ${128 + i * 40})`}>
          <text font-size="13" letter-spacing="1" fill={c.dim}>
            {label.toUpperCase()}
          </text>
          <text y={20} font-size="19" font-weight="700" fill={label === 'The cup' ? c.good : c.text}>
            {value}
          </text>
        </g>
      ))}
      {/* The road walked: a dot a stop, coloured by its kind. */}
      <g transform={`translate(${x0} ${H - 30})`}>
        {recap.road.slice(0, Math.floor((W - x0 - 28) / (dot * 2.6))).map((kind, i) => (
          <circle key={i} cx={dot + i * dot * 2.6} cy={0} r={kind === 'boss' ? dot * 1.25 : dot} fill={kinds[kind] ?? c.dim} />
        ))}
      </g>
    </svg>
  );
}

function nth(n: number): string {
  return n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}

/** Saves the picture with this id as a PNG file. Resolves false if the browser would not draw it. */
export function savePicture(id: string, filename: string): Promise<boolean> {
  const svg = document.getElementById(id);
  if (!svg) return Promise.resolve(false);
  const xml = new XMLSerializer().serializeToString(svg);
  const scale = look.recap.saveScale;
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(false);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(false);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        resolve(true);
      }, 'image/png');
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}
