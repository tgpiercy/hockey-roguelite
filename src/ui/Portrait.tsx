import type { Portrait } from '../core/portrait';

/** A colour mixed toward black by `amount` (0 to 1), for shading. */
function darken(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number): string =>
    Math.round(c * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

interface Props {
  portrait: Portrait;
  /** The colours he wears: the disc behind him and his collar. */
  primary: string;
  secondary: string;
  size?: number;
}

/**
 * A player's head and shoulders, drawn from his portrait: head shape, skin, hair, brows and beard,
 * on a disc in his team's colour. Simple and stylised on purpose: it has to read at 26 pixels.
 */
export function PortraitFace({ portrait: p, primary, secondary, size = 28 }: Props) {
  const shade = darken(p.skin, 0.16);
  const halfWidth = p.face === 'long' ? 9.6 : p.face === 'square' ? 11 : 10.8;
  const hair = p.hairColour;
  return (
    <svg class="portrait" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Player portrait">
      <defs>
        <clipPath id="portrait-disc">
          <circle cx="24" cy="24" r="23" />
        </clipPath>
      </defs>
      <circle cx="24" cy="24" r="23" fill={darken(primary, 0.35)} />
      <g clip-path="url(#portrait-disc)">
        {/* Shoulders in the jersey, with a collar in the team's second colour. */}
        <path d="M4 50c0-9 8-14 20-14s20 5 20 14z" fill={primary} />
        <path d="M17 37.500 24 42l7-4.500" fill="none" stroke={secondary} stroke-width="2.600" stroke-linecap="round" />
        <rect x="20" y="30" width="8" height="8" rx="2" fill={shade} />

        {/* Ears, then the head on top of them. */}
        <circle cx={24 - halfWidth} cy="23" r="2.400" fill={shade} />
        <circle cx={24 + halfWidth} cy="23" r="2.400" fill={shade} />
        {p.face === 'square' ? <rect x="13" y="9.500" width="22" height="25" rx="8.500" fill={p.skin} /> : <ellipse cx="24" cy="22" rx={halfWidth} ry={p.face === 'long' ? 13.500 : 12.500} fill={p.skin} />}

        {/* Beard under everything else on the face. */}
        {p.beard === 'full' && <path d="M14.500 24c0 8 4 11.500 9.500 11.500S33.500 32 33.500 24c-2 3.500-5 5-9.500 5s-7.500-1.500-9.500-5z" fill={hair} />}
        {p.beard === 'stubble' && <path d="M14.500 24c0 8 4 11.500 9.500 11.500S33.500 32 33.500 24c-2 3.500-5 5-9.500 5s-7.500-1.500-9.500-5z" fill={hair} opacity="0.280" />}
        {p.beard === 'moustache' && <path d="M19.500 28.200q4.500-2.200 9 0q-4.500 1.800-9 0z" fill={hair} />}

        {/* Hair. */}
        {p.hairStyle === 'short' && <path d="M12.500 20Q13 7.500 24 7.500Q35 7.500 35.500 20Q31 13.500 24 13.500Q17 13.500 12.500 20Z" fill={hair} />}
        {p.hairStyle === 'buzz' && <path d="M13 19Q14 9 24 9Q34 9 35 19Q30 15 24 15Q18 15 13 19Z" fill={hair} opacity="0.780" />}
        {p.hairStyle === 'flow' && <path d="M10.500 29Q8.500 7.500 24 6.500Q39.500 7.500 37.500 29Q36.500 18 31 14Q24 12 17 14Q11.500 18 10.500 29Z" fill={hair} />}
        {p.hairStyle === 'side' && <path d="M12.500 20Q12 7.500 25 7.500Q36 7.500 35.500 19Q30.500 11.500 20 14.500Q15 16.500 12.500 20Z" fill={hair} />}
        {p.hairStyle === 'curly' && (
          <g fill={hair}>
            {[14.500, 19, 24, 29, 33.500].map((x, i) => (
              <circle key={x} cx={x} cy={i === 0 || i === 4 ? 14.500 : 10.500} r="4.600" />
            ))}
          </g>
        )}
        {p.hairStyle === 'bald' && <path d="M18 11q3-2 6-1.500" fill="none" stroke="#ffffff" stroke-width="1.200" stroke-linecap="round" opacity="0.500" />}

        {/* Brows, eyes, nose, mouth. */}
        <g fill="none" stroke={darken(hair, 0.2)} stroke-width={p.brows === 'heavy' ? 1.900 : 1.200} stroke-linecap="round">
          {p.brows === 'arched' ? <path d="M17 19.500q2.500-1.800 5 0M26 19.500q2.500-1.800 5 0" /> : <path d="M17 19.200h5M26 19.200h5" />}
        </g>
        <circle cx="19.500" cy="22.600" r="1.500" fill={p.eyeColour} />
        <circle cx="28.500" cy="22.600" r="1.500" fill={p.eyeColour} />
        <path d="M24 23.500l-1 3.200h1.600" fill="none" stroke={shade} stroke-width="1.200" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M20.800 30.200q3.200 1.800 6.400 0" fill="none" stroke={darken(p.skin, 0.45)} stroke-width="1.300" stroke-linecap="round" />
      </g>
      <circle cx="24" cy="24" r="23" fill="none" stroke={secondary} stroke-width="1.600" />
    </svg>
  );
}
