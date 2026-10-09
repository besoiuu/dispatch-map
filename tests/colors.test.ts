// Route colours, and whether anyone can read what is written on them.
//
// Badges and map pins painted `text-white` onto the route colour, and five of
// the sixteen route colours are pale enough that white on them is close to
// invisible. A route assigned mint green had unreadable stop letters on every
// pin and every sidebar row - and which route got which colour was decided by
// the order the routes were created in, so it looked intermittent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_COLORS, getNextRouteColor, textOn } from '@/lib/colors';

/** WCAG relative luminance, independently of the implementation under test. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = (i: number) => {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('EVERY ROUTE COLOUR CAN CARRY READABLE TEXT', () => {
  // 4.5:1 is the WCAG AA threshold for normal text. The badges are small and
  // bold, so this is the right bar rather than the relaxed large-text one.
  for (const color of ROUTE_COLORS) {
    const ratio = contrast(color, textOn(color));
    assert.ok(ratio >= 4.5, `${color} cu ${textOn(color)} da doar ${ratio.toFixed(2)}:1`);
  }
});

test('the pale route colours get black text, not white', () => {
  // These are the ones that were unreadable.
  for (const pale of ['#bfef45', '#fabed4', '#aaffc3', '#dcbeff', '#42d4f4']) {
    assert.equal(textOn(pale), '#000000', pale);
  }
});

test('the dark route colours keep white text', () => {
  for (const dark of ['#800000', '#000075', '#911eb4', '#e6194b', '#4363d8']) {
    assert.equal(textOn(dark), '#ffffff', dark);
  }
});

test('the first and last pin colours are readable too', () => {
  // Green for the first stop, red for the last, hardcoded in RouteMarkers.
  for (const c of ['#22c55e', '#ef4444', '#9ca3af']) {
    assert.ok(contrast(c, textOn(c)) >= 4.5, c);
  }
});

test('a short hex and a malformed one do not throw', () => {
  assert.equal(textOn('#fff'), '#000000');
  assert.equal(textOn('nonsense'), '#ffffff');
});

test('route colours are handed out without repeating until they run out', () => {
  const used: string[] = [];
  for (let i = 0; i < ROUTE_COLORS.length; i++) {
    const next = getNextRouteColor(used);
    assert.ok(!used.includes(next), `culoarea ${next} s-a repetat la ruta ${i + 1}`);
    used.push(next);
  }
  // Past sixteen routes it has to reuse one; it must still answer.
  assert.ok(ROUTE_COLORS.includes(getNextRouteColor(used)));
});
