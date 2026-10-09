function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function codeToHue(code: string): number {
  let num = 0;
  for (let i = 0; i < code.length; i++) {
    num = num * 31 + code.charCodeAt(i);
  }
  return (num * 137.508) % 360;
}

const CB_HUES = [210, 30, 180, 60, 270, 0, 120, 300, 90, 330];

function codeToHueCB(code: string): number {
  let num = 0;
  for (let i = 0; i < code.length; i++) num = num * 31 + code.charCodeAt(i);
  return CB_HUES[Math.abs(num) % CB_HUES.length];
}

// Country-based hue: each country gets a fixed base hue, tiles are shades of it
const COUNTRY_HUES: Record<string, number> = {
  de: 210,  // blue
  nl: 30,   // orange
  fr: 260,  // purple
  be: 55,   // gold
  dk: 340,  // pink
  at: 145,  // teal
  cz: 300,  // magenta
  pl: 0,    // red
  hu: 100,  // lime green
  ro: 180,  // cyan
  it: 70,   // yellow-green
  sk: 235,  // steel blue
};

let countryHueMode = '';
export function setCountryHueContext(countryCode: string) { countryHueMode = countryCode; }

function codeToHueCountry(code: string): number {
  const baseHue = COUNTRY_HUES[countryHueMode] ?? 0;
  let num = 0;
  for (let i = 0; i < code.length; i++) num = num * 31 + code.charCodeAt(i);
  return (baseHue + (num % 20) - 10 + 360) % 360;
}

let colorBlindMode = false;
export function setColorBlindMode(enabled: boolean) {
  colorBlindMode = enabled;
  regionColorCache.clear();
  fadedColorCache.clear();
}

const regionColorCache = new Map<string, string>();

export function getRegionColor(plz2: string): string {
  const key = countryHueMode + ':' + plz2 + (colorBlindMode ? ':cb' : '');
  const cached = regionColorCache.get(key);
  if (cached) return cached;

  const hue = countryHueMode ? codeToHueCountry(plz2) : (colorBlindMode ? codeToHueCB(plz2) : codeToHue(plz2));
  const sat = colorBlindMode ? 30 : (countryHueMode ? 55 : 60);
  const light = colorBlindMode ? (60 + (codeToHue(plz2) % 15)) : (countryHueMode ? (45 + (codeToHue(plz2) % 15)) : 50);
  const color = hslToHex(hue, sat, light);
  regionColorCache.set(key, color);
  return color;
}

const fadedColorCache = new Map<string, string>();

export function getRegionColorFaded(plz2: string, dark = false): string {
  // Cached like `getRegionColor`: this is called once per region every time a
  // colour expression is rebuilt, which is on every route change.
  const key = `${countryHueMode}:${plz2}:${dark ? 'd' : 'l'}${colorBlindMode ? ':cb' : ''}`;
  const hit = fadedColorCache.get(key);
  if (hit) return hit;
  const hue = countryHueMode ? codeToHueCountry(plz2) : (colorBlindMode ? codeToHueCB(plz2) : codeToHue(plz2));
  const fadedSat = colorBlindMode ? 15 : 40;
  const color = dark
    ? hslToHex(hue, colorBlindMode ? 20 : 35, 25)
    : hslToHex(hue, fadedSat, 78);
  fadedColorCache.set(key, color);
  return color;
}

/**
 * Black or white, whichever can actually be read on `background`.
 *
 * Route badges and map pins painted white text onto the route colour. Five of
 * the sixteen route colours are pale enough that white on them is close to
 * invisible (#bfef45, #fabed4, #aaffc3, #dcbeff, #42d4f4), and several of the
 * mid-tones are not much better: white on #3cb44b is 2.7:1, on #f58231 2.6:1,
 * on the green used for the first pin 2.3:1. Which route got which colour
 * depended on the order routes were created in, so it looked intermittent.
 *
 * The rule is "white unless white fails", not "whichever has more contrast".
 * Both guarantee a pass - if white is under 4.5:1 then black is necessarily
 * over 4.67:1 - but pure max-contrast flips on near-ties and puts black text
 * on crimson, where white reads better and is already 4.56:1. A luminance
 * threshold cannot promise either: the obvious 0.5 cut-off chose white for
 * exactly the mid-tones listed above.
 */
export function textOn(background: string): '#000000' | '#ffffff' {
  const hex = background.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff';
  const channel = (i: number) => {
    const v = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  const againstWhite = 1.05 / (l + 0.05);
  return againstWhite >= 4.5 ? '#ffffff' : '#000000';
}

export function buildRegionColorExpression(
  plz2Codes: string[],
  propertyKey: string = 'plz2'
): unknown[] {
  const pairs: (string | string[])[] = [];
  for (const code of plz2Codes) {
    pairs.push(code, getRegionColor(code));
  }
  return ['match', ['get', propertyKey], ...pairs, '#cccccc'];
}

export function buildFadedRegionColorExpression(
  plz2Codes: string[],
  propertyKey: string = 'plz2',
  dark = false
): unknown[] {
  const pairs: (string | string[])[] = [];
  for (const code of plz2Codes) {
    pairs.push(code, getRegionColorFaded(code, dark));
  }
  return ['match', ['get', propertyKey], ...pairs, dark ? '#1a1a1a' : '#f0f0f0'];
}

export const ROUTE_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
  '#dcbeff',
  '#9A6324',
  '#800000',
  '#aaffc3',
  '#808000',
  '#000075',
];

export function getNextRouteColor(usedColors: string[]): string {
  const available = ROUTE_COLORS.find((c) => !usedColors.includes(c));
  return available ?? ROUTE_COLORS[usedColors.length % ROUTE_COLORS.length];
}
