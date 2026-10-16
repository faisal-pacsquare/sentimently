/**
 * Pure business rules for delivery and dates (Phase0/02_Business_Rules.md).
 * No I/O here, so every rule can be tested with fixed inputs.
 */

export interface Rate {
  fee: number;
  minDays: number;
  maxDays: number;
  sameDay: boolean;
}

export interface DeliveryConfig {
  freeDeliveryThreshold: number;
  sameDayCutoffHour: number;
  deliveryRates: Record<string, Rate>;
  restOfPakistan: Rate;
  sameDayCapacity?: Record<string, number>;
}

/** Pakistan Standard Time is UTC+5 all year (no daylight saving). */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Studio working days, Monday to Saturday (assumed; Sunday is closed). */
const WORKING_DAYS = [1, 2, 3, 4, 5, 6];
/** Flowers and chocolate cannot be scheduled further ahead than this (SC-01). */
export const PERISHABLE_MAX_DAYS_AHEAD = 3;

export interface PktNow {
  date: string; // YYYY-MM-DD in Pakistan
  hour: number;
}

export function pkt(now: Date): PktNow {
  const t = new Date(now.getTime() + PKT_OFFSET_MS);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() };
}

const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const isWorkingDay = (date: string) => WORKING_DAYS.includes(dow(date));

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextWorkingDay(date: string): string {
  let d = date;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

/** n working days after `date` (counting from the next working day if `date` is closed). */
export function addWorkingDays(date: string, n: number): string {
  let d = nextWorkingDay(date);
  for (let left = n; left > 0;) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

export const isRealDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
  addDays(date, 0) === date;

/** DL-01 to DL-05: a listed city gets its own rate, any other city is "rest of Pakistan" (DL-04). */
export function rateFor(
  config: DeliveryConfig,
  city: string,
): { rate: Rate; city: string } {
  const wanted = city.trim().toLowerCase();
  const name = Object.keys(config.deliveryRates).find(
    (k) => k.toLowerCase() === wanted,
  );
  return name
    ? { rate: config.deliveryRates[name], city: name }
    : { rate: config.restOfPakistan, city: city.trim() };
}

/** DL-06 digital only: no fee. DL-07 free when the subtotal is over the threshold (exactly the threshold still pays). */
export function deliveryFee(
  subtotal: number,
  hasPhysical: boolean,
  rate: Rate,
  config: DeliveryConfig,
): number {
  if (!hasPhysical) return 0;
  return subtotal > config.freeDeliveryThreshold ? 0 : rate.fee;
}

export interface Timing {
  sameDay: boolean;
  earliestDate: string;
  estimatedBy: string;
}

/**
 * DL-01 to DL-04, DL-08, DL-09.
 * Same-day needs: a same-day city, no production lead time, a working day, before the cut-off, and capacity left.
 * `leadDays` is the longest made-to-order lead time in the basket (DL-08); delivery counts from the end of it.
 */
export function timing(args: {
  now: Date;
  rate: Rate;
  config: DeliveryConfig;
  leadDays: number;
  capacityLeft: number;
}): Timing {
  const { rate, config, leadDays, capacityLeft } = args;
  const today = pkt(args.now);
  const sameDay =
    rate.sameDay &&
    leadDays === 0 &&
    isWorkingDay(today.date) &&
    today.hour < config.sameDayCutoffHour &&
    capacityLeft > 0;

  const minTransit = rate.sameDay ? (sameDay ? 0 : 1) : rate.minDays;
  const maxTransit = rate.sameDay ? (sameDay ? 0 : 1) : rate.maxDays;
  return {
    sameDay,
    earliestDate: addWorkingDays(today.date, leadDays + minTransit),
    estimatedBy: addWorkingDays(today.date, leadDays + maxTransit),
  };
}

/** SC-01: a perishable gift may be scheduled at most 3 days ahead (day 3 is fine, day 4 is not). */
export function perishableDateOk(now: Date, requestedDate: string): boolean {
  const today = pkt(now).date;
  return requestedDate <= addDays(today, PERISHABLE_MAX_DAYS_AHEAD);
}

const isLeapYear = (y: number) =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The next time a yearly occasion (a birthday, an anniversary) falls on or after `today`.
 * A 29 February occasion falls on 28 February in years that have no 29th.
 */
export function nextOccurrence(date: string, today: string): string {
  const [, month, day] = date.slice(0, 10).split('-').map(Number);
  const year = Number(today.slice(0, 4));
  const on = (y: number) => {
    const d = month === 2 && day === 29 && !isLeapYear(y) ? 28 : day;
    return `${y}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  return on(year) >= today ? on(year) : on(year + 1);
}
