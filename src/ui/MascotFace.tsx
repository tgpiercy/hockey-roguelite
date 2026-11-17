import { mascotLook, type MascotKind } from '../core/mascotKind';
import { darken, lighten } from '../core/teamColours';
import look from '../data/portraitLook.json';

interface Props {
  kind: MascotKind;
  /** The colours of the club he belongs to: the panel behind him and his jersey. */
  primary: string;
  secondary: string;
  size?: number;
}

/**
 * A mascot's head and shoulders, drawn as the players' portraits are: inked, on dots in his club's colour.
 * A costume head of fur with the ears, snout and markings of the animal he is, big eyes and a grin.
 */
export function MascotFace({ kind, primary, secondary, size = 28 }: Props) {
  const K = mascotLook(kind);
  const ink = look.ink;
  const fur = K.fur;
  const dark = darken(fur, 0.25);
  const pale = K.muzzle;
  const gold = '#f6b93b';
  const line = { stroke: ink, 'stroke-width': 1.4, 'stroke-linejoin': 'round' as const, 'stroke-linecap': 'round' as const };
  const beak = K.snout === 'beak';
  return (
    <svg class="portrait mascot-portrait" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`The mascot, ${K.name}`}>
      <defs>
        <clipPath id="mf-disc">
          <circle cx="24" cy="24" r="22.6" />
        </clipPath>
        <pattern id="mf-dots" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="2.5" cy="2.5" r="1.25" fill="#ffffff" />
        </pattern>
      </defs>
      <circle cx="24" cy="24" r="22.6" fill={darken(primary, 0.3)} />
      <g clip-path="url(#mf-disc)">
        <rect x="0" y="0" width="48" height="32" fill="url(#mf-dots)" opacity={look.dots} />
        <path d="M3 50c0-9 8-13 21-13s21 4 21 13z" fill={primary} {...line} />
        <path d="M16.500 38.300 24 43.500l7.500-5.200" fill="none" stroke={secondary} stroke-width="3" stroke-linejoin="round" />

        {/* The whole head a little smaller than the panel, so ears and antlers fit inside it. */}
        <g transform="translate(24 27.500) scale(0.830) translate(-24 -24)">
        {/* Ears, antlers or a crest, behind the head. */}
        {K.ears === 'round' && (
          <g>
            <circle cx="11.500" cy="11.500" r="5.600" fill={fur} {...line} />
            <circle cx="36.500" cy="11.500" r="5.600" fill={fur} {...line} />
            <circle cx="11.800" cy="11.800" r="2.800" fill={pale} />
            <circle cx="36.200" cy="11.800" r="2.800" fill={pale} />
          </g>
        )}
        {K.ears === 'small' && (
          <g>
            <circle cx="11.500" cy="13.500" r="3.600" fill={fur} {...line} />
            <circle cx="36.500" cy="13.500" r="3.600" fill={fur} {...line} />
          </g>
        )}
        {K.ears === 'pointed' && (
          <g>
            <path d="M9 19 8.500 3.500 19.500 10z" fill={fur} {...line} />
            <path d="M39 19 39.500 3.500 28.500 10z" fill={fur} {...line} />
            <path d="M11 14.500 10.800 7.500 15.800 10.500z" fill={pale} />
            <path d="M37 14.500 37.200 7.500 32.200 10.500z" fill={pale} />
          </g>
        )}
        {K.ears === 'tufts' && (
          <g>
            <path d="M10 17 8 4.500 19 9.500z" fill={dark} {...line} />
            <path d="M38 17 40 4.500 29 9.500z" fill={dark} {...line} />
          </g>
        )}
        {K.ears === 'crest' && (
          <g fill={fur} {...line}>
            <path d="M24 12q-3-8 0-11q3 3 0 11z" />
            <path d="M20.500 12.500q-6-6-5-10q5 2 5 10z" />
            <path d="M27.500 12.500q6-6 5-10q-5 2-5 10z" />
          </g>
        )}
        {K.ears === 'antlers' && (
          <g fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 13q-6-2-7.500-9M9.500 9l-5-1.500M11.500 6 11 2M34 13q6-2 7.500-9M38.500 9l5-1.500M36.500 6 37 2" stroke={ink} stroke-width="5" />
            <path d="M14 13q-6-2-7.500-9M9.500 9l-5-1.500M11.500 6 11 2M34 13q6-2 7.500-9M38.500 9l5-1.500M36.500 6 37 2" stroke={pale} stroke-width="2.600" />
            <ellipse cx="9.500" cy="18" rx="3.600" ry="2.400" fill={fur} stroke={ink} stroke-width="1.300" />
            <ellipse cx="38.500" cy="18" rx="3.600" ry="2.400" fill={fur} stroke={ink} stroke-width="1.300" />
          </g>
        )}

        {/* The head, with fluff at the cheeks and a shadow down one side. */}
        <path d="M24 8.500c9.500 0 15 6 15 13.500q0 2.500-1 4.500l2.200 1.300-3 1.200 1 2.500-3.400-0.300C32.500 34.500 28.500 36 24 36s-8.500-1.500-10.800-4.800l-3.400 0.300 1-2.500-3-1.200L10 26.500q-1-2-1-4.500C9 14.500 14.500 8.500 24 8.500z" fill={fur} {...line} />
        <path d="M31 10q5 5 4.500 13.500T29 35.500q5-1 8-4.800l3.400 0.300-1-2.500 3-1.200L40 26q1.500-9-3-13.500Q34.500 10.500 31 10z" fill={dark} opacity="0.550" />
        {K.snout === 'long' && <path d="M12.500 27q2 8 11.500 8s9.500-0 11.500-8q-5 3-11.500 3t-11.500-3z" fill={pale} />}
        {kind === 'owl' && (
          <g fill={pale}>
            <circle cx="17.500" cy="19.500" r="6.800" />
            <circle cx="30.500" cy="19.500" r="6.800" />
          </g>
        )}
        {K.stripe && (
          <g>
            <path d="M20.500 9h7l-0.500 15h-6z" fill={pale} />
            <path d="M13.500 12.500q3.500-3 6.500-3.300L21 26l-5.500-1.500q-2.500-6-2-12zM34.500 12.500q-3.500-3-6.500-3.300L27 26l5.500-1.500q2.500-6 2-12z" fill={ink} opacity="0.900" />
          </g>
        )}

        {/* Eyes and brows. */}
        {[17.500, 30.500].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy="19.500" r="3.900" fill="#ffffff" stroke={ink} stroke-width="1.100" />
            <circle cx={x + (i === 0 ? 0.9 : -0.9)} cy="19.900" r="1.900" fill={ink} />
            <circle cx={x + (i === 0 ? 0.3 : -1.5)} cy="19.100" r="0.650" fill="#ffffff" />
          </g>
        ))}
        <path d="M12.500 14 20 16.300M35.500 14 28 16.300" fill="none" stroke={ink} stroke-width="1.900" stroke-linecap="round" />

        {/* Muzzle or beak, nose and grin. */}
        {beak ? (
          <g>
            <path d={kind === 'owl' ? 'M21 23.500h6L24 30z' : 'M19 23.500h10L24 34z'} fill={gold} {...line} />
            <path d={kind === 'owl' ? 'M24 23.500V30' : 'M20.500 26.500h7'} fill="none" stroke={darken(gold, 0.35)} stroke-width="1" />
          </g>
        ) : (
          <g>
            <ellipse cx="24" cy={K.snout === 'long' ? 28.300 : 28} rx={K.snout === 'long' ? 6.600 : 7.800} ry={K.snout === 'long' ? 6.300 : 5.400} fill={pale} {...line} />
            <ellipse cx="24" cy="24.900" rx="2.900" ry="2" fill={ink} />
            <ellipse cx="23.200" cy="24.300" rx="0.900" ry="0.500" fill={lighten(ink, 0.5)} />
            <path d="M24 26.900v2M19.800 29.300q4.200 3.600 8.400 0" fill="none" stroke={ink} stroke-width="1.300" stroke-linecap="round" />
            <path d="M22.300 30.800h3.400v1.700h-3.400z" fill="#ffffff" stroke={ink} stroke-width="0.700" />
          </g>
        )}
        </g>
      </g>
      <circle cx="24" cy="24" r="22.600" fill="none" stroke={ink} stroke-width="2.200" />
      <circle cx="24" cy="24" r="21" fill="none" stroke={secondary} stroke-width="1.100" />
    </svg>
  );
}
