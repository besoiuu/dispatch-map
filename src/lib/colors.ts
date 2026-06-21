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

let colorBlindMode = false;
export function setColorBlindMode(enabled: boolean) {
  colorBlindMode = enabled;
  regionColorCache.clear();
}

const regionColorCache = new Map<string, string>();

export function getRegionColor(plz2: string): string {
  const cached = regionColorCache.get(plz2);
  if (cached) return cached;

  const hue = colorBlindMode ? codeToHueCB(plz2) : codeToHue(plz2);
  const color = hslToHex(hue, colorBlindMode ? 70 : 60, 50);
  regionColorCache.set(plz2, color);
  return color;
}

export function getRegionColorFaded(plz2: string, dark = false): string {
  const hue = colorBlindMode ? codeToHueCB(plz2) : codeToHue(plz2);
  if (dark) return hslToHex(hue, 25, 22);
  return hslToHex(hue, 25, 88);
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
