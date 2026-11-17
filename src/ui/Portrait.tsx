import type { Portrait } from '../core/portrait';
import { darken, lighten } from '../core/teamColours';
import look from '../data/portraitLook.json';

interface Props {
  portrait: Portrait;
  /** The colours he wears: the panel behind him and his jersey. */
  primary: string;
  secondary: string;
  size?: number;
}

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** The outline of a head: crown, cheeks, jaw and chin, from the face shape's numbers. */
function headPath(face: (typeof look.faces)[keyof typeof look.faces]): string {
  const { cheek: hw, jaw: jw, chin: cw, chinY: cy } = face;
  const c = 24;
  return [
    `M${n(c - hw)} 20`,
    `C${n(c - hw)} 11 ${n(c - hw * 0.62)} 7.6 ${c} 7.6`,
    `C${n(c + hw * 0.62)} 7.6 ${n(c + hw)} 11 ${n(c + hw)} 20`,
    `L${n(c + hw)} 25`,
    `Q${n(c + hw)} 30 ${n(c + jw)} 31.6`,
    `L${n(c + cw)} ${n(cy - 0.9)}`,
    `Q${c} ${n(cy + 0.9)} ${n(c - cw)} ${n(cy - 0.9)}`,
    `L${n(c - jw)} 31.6`,
    `Q${n(c - hw)} 30 ${n(c - hw)} 25Z`,
  ].join('');
}

/**
 * A player's head and shoulders drawn as a comic panel: inked lines, a hard shadow down one side of the
 * face, a jaw of his own, eyes with whites, and dots behind him in his team's colour. From the same
 * portrait as before, so every player keeps his skin, hair, brows and beard.
 */
export function PortraitFace({ portrait: p, primary, secondary, size = 28 }: Props) {
  const ink = look.ink;
  const face = look.faces[p.face];
  const hw = face.cheek;
  const head = headPath(face);
  const shade = darken(p.skin, look.skinShade);
  const hair = p.hairColour;
  const shine = lighten(hair, look.hairShine);
  const clip = `cf-${p.face}`;
  const line = { fill: 'none', stroke: ink, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const };
  return (
    <svg class="portrait" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Player portrait">
      <defs>
        <clipPath id="cf-disc">
          <circle cx="24" cy="24" r="22.6" />
        </clipPath>
        <clipPath id={clip}>
          <path d={head} />
        </clipPath>
        <pattern id="cf-dots" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="2.5" cy="2.5" r="1.25" fill="#ffffff" />
        </pattern>
        <pattern id="cf-stubble" width="1.7" height="1.7" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <circle cx="0.85" cy="0.85" r="0.42" fill="#000000" />
        </pattern>
      </defs>
      <circle cx="24" cy="24" r="22.6" fill={darken(primary, 0.3)} />
      <g clip-path="url(#cf-disc)">
        <rect x="0" y="0" width="48" height="30" fill="url(#cf-dots)" opacity={look.dots} />
        {/* Shoulders in the jersey, a yoke and a laced collar. */}
        <path d="M3 50c0-9.500 8-14.500 21-14.500s21 5 21 14.500z" fill={primary} stroke={ink} stroke-width="1.500" />
        <path d="M30 37q8 2 13 9l3 6H30z" fill={darken(primary, 0.28)} />
        <path d="M16.500 36.800 24 43l7.500-6.200" fill="none" stroke={secondary} stroke-width="3" stroke-linejoin="round" />
        <path d="M16.500 36.800 24 43l7.500-6.200" {...line} stroke-width="0.700" transform="translate(0 2.100)" />
        {/* Neck, with the head's shadow across it. */}
        <path d="M19.300 29h9.400v8.200L24 40.600l-4.700-3.400z" fill={p.skin} stroke={ink} stroke-width="1.100" stroke-linejoin="round" />
        <path d="M19.800 29h8.400v4.200q-4.200 2.400-8.400 0z" fill={shade} />

        {/* Ears, then the head on top of them. */}
        <ellipse cx={24 - hw} cy="23.600" rx="2.100" ry="2.900" fill={p.skin} stroke={ink} stroke-width="1.100" />
        <ellipse cx={24 + hw} cy="23.600" rx="2.100" ry="2.900" fill={shade} stroke={ink} stroke-width="1.100" />
        <path d={head} fill={p.skin} />
        <g clip-path={`url(#${clip})`}>
          {/* The side away from the light, the hollow of the eyes, under the nose and under the lip. */}
          <path d={`M${n(24 + hw * 0.5)} 6Q${n(24 + hw * 0.22)} 20 ${n(24 + hw * 0.56)} 29L26 40h16V6z`} fill={shade} />
          <path d="M16.200 20.600q3.200-1.500 6.300 0l-0.400 1.500h-5.400zM25.500 20.600q3.200-1.500 6.300 0l-0.500 1.500h-5.400z" fill={shade} opacity="0.700" />
          {p.beard === 'full' && <path d="M12 23.500c1.500 4 5.500 5.300 12 5.300s10.500-1.300 12-5.300V40H12z" fill={hair} />}
          {p.beard === 'full' && <path d="M27 28.600c4-0.400 7-1.800 9-5.100V40h-9z" fill={darken(hair, 0.3)} />}
          {p.beard === 'stubble' && <path d="M12 24.500c1.500 4 5.500 5 12 5s10.500-1 12-5V40H12z" fill="url(#cf-stubble)" opacity="0.450" />}
        </g>
        <path d={head} {...line} stroke-width="1.500" />

        {/* Hair, with a streak of light in it. */}
        {p.hairStyle === 'short' && (
          <g>
            <path d="M12.200 20.500Q11.500 6 24 6Q36.500 6 35.800 20.500Q33.500 14.500 29 13.200L25.500 15.200L23 12.800L18 14.600Q14 16.500 12.200 20.500Z" fill={hair} stroke={ink} stroke-width="1.300" stroke-linejoin="round" />
            <path d="M16.500 10.500Q19.500 7.800 24 7.900" fill="none" stroke={shine} stroke-width="1.300" stroke-linecap="round" />
          </g>
        )}
        {p.hairStyle === 'buzz' && (
          <g>
            <path d="M12.800 19Q13 7.200 24 7.200Q35 7.200 35.200 19Q30 14.600 24 14.600Q18 14.600 12.800 19Z" fill={hair} opacity="0.850" stroke={ink} stroke-width="1.100" stroke-linejoin="round" />
          </g>
        )}
        {p.hairStyle === 'flow' && (
          <g>
            <path d="M10 30Q7.500 6 24 5.500Q40.500 6 38 30L35.500 27Q36 18 30.500 14L24 16L17.500 14Q12 18 12.500 27Z" fill={hair} stroke={ink} stroke-width="1.300" stroke-linejoin="round" />
            <path d="M15 11.500Q18.500 7.500 24 7.400M12.200 17.500Q11.500 22 12 25.500" fill="none" stroke={shine} stroke-width="1.300" stroke-linecap="round" />
          </g>
        )}
        {p.hairStyle === 'side' && (
          <g>
            <path d="M12.200 20.500Q11 6 25 5.800Q37 6 35.800 19.500Q31.500 11.500 21 14.200Q15 16 12.200 20.500Z" fill={hair} stroke={ink} stroke-width="1.300" stroke-linejoin="round" />
            <path d="M17 10.500Q21 7.400 27 8" fill="none" stroke={shine} stroke-width="1.300" stroke-linecap="round" />
          </g>
        )}
        {p.hairStyle === 'curly' && (
          <g>
            <path d="M12 20.500q-3-4.500 0.500-8q-0.500-5 5-5.500q3-4 7-1.500q4-2.500 7 1.500q5.500 0.500 5 5.500q3.500 3.500 0.500 8q-1-4.500-4.500-5.500q-3 1.800-5-0.300q-3 2.400-6 0q-2 2.100-5 0.300q-3.500 1-4.500 5.500z" fill={hair} stroke={ink} stroke-width="1.300" stroke-linejoin="round" />
            <path d="M17 9.500q2-2.200 4.500-1.500M26 7.800q2.500-0.800 4.500 1.200" fill="none" stroke={shine} stroke-width="1.200" stroke-linecap="round" />
          </g>
        )}
        {p.hairStyle === 'bald' && <path d="M17.500 11.500q3-2.600 7-2.300" fill="none" stroke="#ffffff" stroke-width="1.500" stroke-linecap="round" opacity="0.600" />}

        {/* Brows, eyes, nose, mouth. */}
        <g fill="none" stroke={darken(hair, 0.35)} stroke-width={p.brows === 'heavy' ? 2.300 : 1.600} stroke-linecap="round" stroke-linejoin="round">
          {p.brows === 'arched' ? <path d="M16.300 19.600q2.800-2.200 5.900-0.300M25.800 19.300q3.100-1.900 5.900 0.300" /> : <path d="M16.300 18.700l5.900 1M25.800 19.700l5.900-1" />}
        </g>
        {[19.400, 28.600].map((x) => (
          <g key={x}>
            <path d={`M${n(x - 2.5)} 22.900q2.500-2.300 5 0q-2.500 1.700-5 0z`} fill="#ffffff" />
            <circle cx={x + 0.2} cy="22.700" r="1.250" fill={p.eyeColour} />
            <circle cx={x + 0.2} cy="22.700" r="0.600" fill={ink} />
            <path d={`M${n(x - 2.6)} 22.900q2.600-2.500 5.200 0`} {...line} stroke-width="1" />
          </g>
        ))}
        <path d="M24.600 22.800l1.500 4.500-2.700 0.900" {...line} stroke-width="1.100" />
        {p.beard === 'moustache' && <path d="M18.800 30.300q2.600-2.900 5.200-1.300q2.600-1.600 5.200 1.300q-2.600 0.900-5.200-0.300q-2.600 1.200-5.200 0.300z" fill={hair} stroke={ink} stroke-width="0.800" stroke-linejoin="round" />}
        <path d="M20.400 31.300q3.400 1.300 7-0.500" {...line} stroke-width="1.200" />
        <path d="M22.300 33.300h3.200" fill="none" stroke={shade} stroke-width="1" stroke-linecap="round" />
      </g>
      <circle cx="24" cy="24" r="22.600" fill="none" stroke={ink} stroke-width="2.200" />
      <circle cx="24" cy="24" r="21" fill="none" stroke={secondary} stroke-width="1.100" />
    </svg>
  );
}
