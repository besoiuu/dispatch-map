// Turning a driving duration into days somebody can promise.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planDriving, formatPlan } from '@/lib/driverHours';

const h = (n: number) => n * 3600;

test('a short run is one day and no break', () => {
  const p = planDriving(h(3));
  assert.equal(p.days, 1);
  assert.equal(p.breaks, 0);
  assert.equal(p.overnight, false);
  assert.equal(p.elapsedSeconds, h(3));
});

test('exactly 4.5 h earns no break', () => {
  // The 45 minutes is owed AFTER 4.5 h behind the wheel. At exactly 4.5 the
  // driving is done, so charging a break here would add 45 minutes to every
  // half-day run.
  assert.equal(planDriving(h(4.5)).breaks, 0);
  assert.equal(planDriving(h(4.6)).breaks, 1);
});

test('breaks are counted from DRIVING time, not elapsed', () => {
  // Counting against elapsed compounds: each break pushes the clock on and
  // so earns another break. 9 h of driving is two stretches of 4.5 and
  // exactly one break, not two.
  const p = planDriving(h(9));
  assert.equal(p.breaks, 1);
  assert.equal(p.elapsedSeconds, h(9) + 45 * 60);
});

test('more than 9 h of driving is more than one day', () => {
  // 43h 36m - the run that reads like a number and is not one.
  const p = planDriving(h(43) + 36 * 60);
  assert.equal(p.days, 5);
  assert.equal(p.nights, 4);
  assert.equal(p.overnight, true);
});

test('the day limit is the non-extended 9 h', () => {
  // 10 h is the driver's to spend twice a week, not the planner's. Assuming
  // it makes every week an exception.
  assert.equal(planDriving(h(9)).days, 1);
  assert.equal(planDriving(h(9.5)).days, 2);
});

test('zero is zero, not one day', () => {
  const p = planDriving(0);
  assert.equal(p.days, 0);
  assert.equal(p.overnight, false);
  assert.equal(formatPlan(p), '0m');
});

test('negative or rubbish input does not invent a journey', () => {
  assert.equal(planDriving(-500).days, 0);
  assert.equal(planDriving(NaN).days, 0);
});

test('the label says days only when there is more than one', () => {
  assert.equal(formatPlan(planDriving(h(3) + 10 * 60)), '3h 10m');
  assert.match(formatPlan(planDriving(h(20))), /^3 zile · /);
});
