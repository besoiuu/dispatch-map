/**
 * Turning a driving duration into days a dispatcher can promise.
 *
 * OSRM answers "43h 36m", which reads like a number and is not one: nobody
 * drives 43 hours. Under EU rules (Regulation 561/2006) that run is five
 * days, and the difference between "43h 36m" and "arrives Thursday" is the
 * difference between a number on a screen and something you can tell a
 * carrier.
 *
 * The rules modelled here, and only these:
 *
 *   - 9 h driving a day, twice a week extendable to 10 h. The extension is
 *     NOT assumed: it is the driver's to spend, not the planner's, and
 *     planning on it means every week is an exception.
 *   - a 45 min break after 4.5 h of driving. Taken as two 15/30 min halves
 *     in practice; the total is what matters here.
 *   - 11 h of daily rest between driving days, reducible to 9 h three times
 *     a week. Again the reduction is not assumed.
 *
 * What this deliberately does NOT model: loading and unloading time,
 * ferries, weekly rest, multi-manning, or the tachograph's own
 * bookkeeping. It is an honest floor - the journey takes AT LEAST this
 * long - and it is labelled that way in the UI rather than presented as a
 * schedule.
 */

/** EU 561/2006, the non-extended figures. */
export const DRIVING_HOURS_PER_DAY = 9;
export const BREAK_AFTER_HOURS = 4.5;
export const BREAK_MINUTES = 45;
export const DAILY_REST_HOURS = 11;

export interface DrivingPlan {
  /** Pure driving, as the router gave it. */
  drivingSeconds: number;
  /** Driving + the 45 min breaks it forces. */
  elapsedSeconds: number;
  /** Driving days, counting a part-day as a day. */
  days: number;
  /** 45 min breaks the driving time forces. */
  breaks: number;
  /** Nights away: one fewer than the days. */
  nights: number;
  /** True when it does not fit in a single legal day. */
  overnight: boolean;
}

/**
 * How long a drive really takes, and how many days it spans.
 *
 * Breaks are counted from DRIVING time, not elapsed: the 45 minutes is
 * owed after 4.5 h behind the wheel, and counting it against elapsed time
 * would compound - each break pushing the clock forward and so earning
 * another break.
 */
export function planDriving(drivingSeconds: number): DrivingPlan {
  const s = Math.max(0, Math.round(drivingSeconds || 0));
  if (s === 0) {
    return { drivingSeconds: 0, elapsedSeconds: 0, days: 0, breaks: 0, nights: 0, overnight: false };
  }

  const hours = s / 3600;
  // A break is owed after each completed 4.5 h. Exactly 4.5 h of driving
  // needs none - the break comes after, and the day ends there.
  const breaks = Math.max(0, Math.ceil(hours / BREAK_AFTER_HOURS) - 1);
  const days = Math.max(1, Math.ceil(hours / DRIVING_HOURS_PER_DAY));

  return {
    drivingSeconds: s,
    elapsedSeconds: s + breaks * BREAK_MINUTES * 60,
    days,
    breaks,
    nights: days - 1,
    overnight: days > 1,
  };
}

/** "2 z · 3h 10m" — days only when there is more than one. */
export function formatPlan(plan: DrivingPlan): string {
  const h = Math.floor(plan.drivingSeconds / 3600);
  const m = Math.round((plan.drivingSeconds % 3600) / 60);
  const hm = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return plan.days > 1 ? `${plan.days} zile · ${hm}` : hm;
}
