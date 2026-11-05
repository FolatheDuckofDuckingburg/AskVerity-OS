/**
 * Verity — the mascot.
 *
 * A shaded yellow sphere with two tall oval eyes and a wide grin, drawn in SVG.
 * Verity has no fixed gender: the desktop refers to Verity by name, or as
 * "they" when a pronoun is unavoidable.
 *
 * Expressions swap only the eyes and mouth; the sphere never moves.
 */

const INK = '#1b1708';

let gradientSeq = 0;

function faceId() {
  gradientSeq += 1;
  return `verity-face-${gradientSeq}`;
}

function defs(id) {
  return `
    <defs>
      <radialGradient id="${id}" cx="36%" cy="26%" r="82%">
        <stop offset="0" stop-color="#fff98a"/>
        <stop offset="0.28" stop-color="#fff23f"/>
        <stop offset="0.62" stop-color="#ffdd05"/>
        <stop offset="0.86" stop-color="#f3c400"/>
        <stop offset="1" stop-color="#d9a900"/>
      </radialGradient>
      <radialGradient id="${id}-shade" cx="82%" cy="92%" r="72%">
        <stop offset="0" stop-color="#7a5a00" stop-opacity="0.34"/>
        <stop offset="0.55" stop-color="#7a5a00" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#7a5a00" stop-opacity="0"/>
      </radialGradient>
      <filter id="${id}-soft" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="0.5"/>
      </filter>
      <filter id="${id}-shadow" x="-40%" y="-60%" width="180%" height="220%">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
    </defs>`;
}

const FACES = {
  happy: {
    label: 'Verity, smiling',
    eyes: `
      <ellipse cx="44" cy="51" rx="6.8" ry="12.4" transform="rotate(-4 44 51)"/>
      <ellipse cx="76" cy="51" rx="6.8" ry="12.4" transform="rotate(4 76 51)"/>`,
    mouth: `
      <path d="M25 67.5C27.5 90.5 92.5 90.5 95 67.5"/>
      <path d="M25 67.5c-2.9-2.7-4.3-5.8-3-8"/>
      <path d="M95 67.5c2.9-2.7 4.3-5.8 3-8"/>`,
    mouthWidth: 6.8,
  },
  thinking: {
    label: 'Verity, looking upward and thinking',
    eyes: `
      <ellipse cx="44" cy="46.5" rx="5.9" ry="10.4" transform="rotate(-3 44 46.5)"/>
      <ellipse cx="76" cy="46.5" rx="5.9" ry="10.4" transform="rotate(3 76 46.5)"/>`,
    mouth: `<path d="M50 80.5q10 3.5 20 0"/>`,
    mouthWidth: 5.2,
  },
  curious: {
    label: 'Verity, looking curious',
    eyes: `
      <ellipse cx="43.5" cy="50" rx="6.6" ry="12.4" transform="rotate(-6 43.5 50)"/>
      <ellipse cx="77" cy="46" rx="5.6" ry="10.6" transform="rotate(4 77 46)"/>`,
    mouth: `<path d="M49 76q11 10 22 0"/>`,
    mouthWidth: 5.6,
  },
  confused: {
    label: 'Verity, looking a little confused',
    eyes: `
      <ellipse cx="43.5" cy="52" rx="5.4" ry="10.6" transform="rotate(14 43.5 52)"/>
      <ellipse cx="76.5" cy="50" rx="5.4" ry="10.6" transform="rotate(-14 76.5 50)"/>`,
    mouth: `<path d="M46 80q7-7 14 0t14 0"/>`,
    mouthWidth: 5,
  },
  excited: {
    label: 'Verity, beaming',
    eyes: `
      <path d="M36 54q8-13 16 0"/>
      <path d="M68 54q8-13 16 0"/>`,
    eyesStroke: true,
    mouth: `
      <path d="M36 68q24 33 48 0Z" fill="${INK}" stroke="none"/>
      <path d="M52 88q8 5.5 16 0Z" fill="#ff8f8f" stroke="none"/>`,
    mouthWidth: 0,
  },
  sleeping: {
    label: 'Verity, sleeping',
    eyes: `
      <path d="M37 51q7 6.5 14 0"/>
      <path d="M69 51q7 6.5 14 0"/>`,
    eyesStroke: true,
    mouth: `<path d="M51 80q9 5 18 0"/>`,
    mouthWidth: 4.8,
    extra: `
      <text x="96" y="32" class="verity__z verity__z--1">z</text>
      <text x="105" y="20" class="verity__z verity__z--2">z</text>`,
  },
};

export const EXPRESSIONS = Object.keys(FACES);

export function isExpression(value) {
  return Object.hasOwn(FACES, value);
}

/**
 * @param {string} expression one of EXPRESSIONS
 * @param {{ decorative?: boolean, className?: string }} [options]
 */
export function veritySVG(expression = 'happy', options = {}) {
  const face = FACES[expression] ?? FACES.happy;
  const { decorative = false, className = '' } = options;
  const id = faceId();
  const a11y = decorative
    ? 'aria-hidden="true" role="presentation"'
    : `role="img" aria-label="${face.label}"`;

  const eyeAttrs = face.eyesStroke
    ? `fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"`
    : `fill="${INK}"`;

  const mouthAttrs = face.mouthWidth
    ? `fill="none" stroke="${INK}" stroke-width="${face.mouthWidth}" stroke-linecap="round"`
    : '';

  return `<svg class="verity-svg verity-svg--${expression} ${className}" viewBox="0 0 120 120" ${a11y} focusable="false">
    ${defs(id)}
    <g class="verity__body">
      <ellipse cx="60" cy="113" rx="31" ry="4.6" fill="#000000" opacity=".24" filter="url(#${id}-shadow)"/>
      <circle cx="60" cy="61" r="46" fill="url(#${id})"/>
      <circle cx="60" cy="61" r="46" fill="url(#${id}-shade)"/>
      <g class="verity__eyes" ${eyeAttrs} filter="url(#${id}-soft)">${face.eyes}</g>
      <g class="verity__mouth" ${mouthAttrs} filter="url(#${id}-soft)">${face.mouth}</g>
      ${face.extra ?? ''}
    </g>
  </svg>`;
}

/** Small face used in the Start button, avatars and status pills. */
export function verityMiniSVG() {
  const id = faceId();
  return `<svg viewBox="0 0 40 40" role="presentation" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="${id}" cx="36%" cy="26%" r="82%">
        <stop offset="0" stop-color="#fff98a"/>
        <stop offset="0.4" stop-color="#ffe81f"/>
        <stop offset="1" stop-color="#dfae00"/>
      </radialGradient>
    </defs>
    <circle cx="20" cy="21" r="17" fill="url(#${id})"/>
    <ellipse cx="14.6" cy="18.4" rx="2.5" ry="4.5" fill="${INK}"/>
    <ellipse cx="25.4" cy="18.4" rx="2.5" ry="4.5" fill="${INK}"/>
    <path d="M11.8 24.2c1 5.4 5 7.6 8.2 7.6s7.2-2.2 8.2-7.6" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M11.8 24.2c-.8-1.9-.6-3.2.5-3.7" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M28.2 24.2c.8-1.9.6-3.2-.5-3.7" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

/**
 * Mount a mascot into a container and keep a handle on its expression.
 * @param {HTMLElement} container
 */
export function createVerity(container, { expression = 'happy', decorative = true } = {}) {
  let current = expression;

  const paint = () => {
    container.innerHTML = veritySVG(current, { decorative });
  };

  paint();

  return {
    element: container,
    get expression() {
      return current;
    },
    set(next) {
      if (!isExpression(next) || next === current) return;
      current = next;
      paint();
    },
  };
}
