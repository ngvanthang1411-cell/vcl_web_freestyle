/**
 * Palette maths shared by the derivation script.
 *
 * The logo carries exactly two colours: an orange ink (#F78501) and a black
 * keyline. The orange is the anchor. The other two accents are derived from it
 * by walking the hue wheel down toward sunset — orange (32°) → pink (333°) →
 * purple (300°) — so the three read as one continuous ramp rather than three
 * unrelated colours.
 */

/** Measured from public/logo.png. */
export const LOGO_ORANGE = [247, 133, 1]; // #F78501
export const LOGO_KEYLINE = [0, 0, 0];

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/**
 * The sunset sweep: three anchors, one hue family, walking down the wheel.
 *
 * The violet is lifted to #BE70FA rather than the more usual #A855F7: at its
 * natural lightness it only reached 3.86:1 on the lightest surface, which
 * fails WCAG AA for text. #BE70FA clears 5.0:1 everywhere while keeping the
 * hue inside the same sunset family.
 */
export const ANCHORS = {
  accent: LOGO_ORANGE, // 32°  — lifted straight from the logo
  secondary: [255, 77, 157], // 333° — neon pink
  tertiary: [190, 112, 250], // 274° — neon violet, lifted for AA
};

export const hex = (c) =>
  '#' +
  c
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

/** Mix each channel toward a target colour by factor k (0 = base, 1 = target). */
export function toward(base, target, k) {
  return base.map((v, i) => v + (target[i] - v) * k);
}

const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

/** WCAG contrast ratio between two colours. */
export function ratio(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** HSL of a colour, for reporting. */
export function hsl(c) {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** How far apart two hues are on the wheel, in degrees. */
export function hueGap(h1, h2) {
  const d = Math.abs(h1 - h2);
  return Math.min(d, 360 - d);
}

/** HSL to RGB, so a ramp step can be built by moving lightness alone. */
export function hslToRgb({ h, s, l }) {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = lN - c / 2;
  return rgb.map((v) => Math.round((v + m) * 255));
}

/**
 * Every accent ramp has the same shape: three steps down toward black, the
 * anchor itself, and two steps up toward white.
 *
 * The steps are expressed as lightness *deltas* rather than as a mix toward
 * black or white. Mixing changes lightness by a different amount depending on
 * where the anchor sits, which is what made the violet ramp fail AA while
 * the orange one passed. Holding the delta fixed instead gives all three
 * families the same perceptual spread, and lets each anchor be chosen for
 * how it looks rather than for where it happens to fall.
 *
 * The deep steps are fill-only — they carry backgrounds, borders and
 * gradients, never body text. The base/light/lighter steps are the ones that
 * must clear AA as text, and the derivation checks exactly those.
 */
export function buildRamp(anchor) {
  const { h, s } = hsl(anchor);
  const at = (delta) => hslToRgb({ h, s, l: Math.round(hsl(anchor).l + delta) });
  return {
    deepest: at(-26),
    deep: at(-17),
    muted: at(-10),
    base: anchor,
    light: at(9),
    lighter: at(18),
  };
}

export const RAMPS = {
  accent: buildRamp(ANCHORS.accent),
  secondary: buildRamp(ANCHORS.secondary),
  tertiary: buildRamp(ANCHORS.tertiary),
};

/** Surfaces step lighter as they come forward toward the viewer. */
export const SURFACES = {
  surface: [10, 10, 15],
  'surface-raised': [20, 18, 27],
  'surface-overlay': [28, 25, 38],
  'surface-high': [39, 35, 52],
};

export const CONTENT = {
  content: [244, 241, 247],
  'content-muted': [169, 163, 184],
  // Lifted from #8B849E, which failed AA on the lightest surface.
  'content-subtle': [148, 141, 166],
  'content-inverse': [16, 12, 20],
};

export const STATES = {
  success: [52, 211, 153],
  warning: [251, 191, 36],
  danger: [248, 113, 113],
  info: [34, 211, 238],
};
