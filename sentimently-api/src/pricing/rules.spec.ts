import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addWorkingDays,
  DeliveryConfig,
  deliveryFee,
  isRealDate,
  perishableDateOk,
  pkt,
  rateFor,
  timing,
} from './rules';

const config: DeliveryConfig = JSON.parse(
  readFileSync(join(__dirname, '../../data/storeConfig.json'), 'utf8'),
)[0];

// 2026-11-18 is a Wednesday. Pakistan time is UTC+5, so 07:59Z is 12:59 and 08:00Z is 13:00.
const at = (iso: string) => new Date(iso);
const WED_10AM = at('2026-11-18T05:00:00Z');
const WED_1259 = at('2026-11-18T07:59:00Z');
const WED_1300 = at('2026-11-18T08:00:00Z');
const SUN_10AM = at('2026-11-22T05:00:00Z');

const run = (
  city: string,
  now: Date,
  leadDays = 0,
  capacityLeft = Infinity,
) => {
  const { rate } = rateFor(config, city);
  return timing({ now, rate, config, leadDays, capacityLeft });
};

describe('delivery rules', () => {
  it('uses Pakistan time, not UTC', () => {
    expect(pkt(at('2026-11-18T19:30:00Z'))).toEqual({
      date: '2026-11-19',
      hour: 0,
    });
  });

  it('DL-01 Karachi and Lahore: Rs 350, same day only before 1pm', () => {
    for (const city of ['Karachi', 'Lahore', 'karachi']) {
      expect(rateFor(config, city).rate.fee).toBe(350);
    }
    expect(run('Karachi', WED_1259).sameDay).toBe(true);
    expect(run('Karachi', WED_1259).earliestDate).toBe('2026-11-18');
    expect(run('Karachi', WED_1300).sameDay).toBe(false);
    expect(run('Karachi', WED_1300).earliestDate).toBe('2026-11-19');
  });

  it('DL-02 Islamabad and Rawalpindi: Rs 400, same day only before 1pm', () => {
    expect(rateFor(config, 'Islamabad').rate.fee).toBe(400);
    expect(rateFor(config, 'Rawalpindi').rate.fee).toBe(400);
    expect(run('Islamabad', WED_10AM).sameDay).toBe(true);
    expect(run('Rawalpindi', WED_1300).sameDay).toBe(false);
  });

  it('DL-03 mid-size cities: Rs 550, 1 to 2 working days', () => {
    for (const city of [
      'Faisalabad',
      'Multan',
      'Peshawar',
      'Sialkot',
      'Gujranwala',
      'Hyderabad',
      'Quetta',
    ]) {
      expect(rateFor(config, city).rate.fee).toBe(550);
    }
    const t = run('Multan', WED_10AM);
    expect(t).toEqual({
      sameDay: false,
      earliestDate: '2026-11-19',
      estimatedBy: '2026-11-20',
    });
  });

  it('DL-04 any other city: Rs 650, 2 to 4 working days (Saturday counts, Sunday does not)', () => {
    const { rate, city } = rateFor(config, '  Gwadar ');
    expect(rate.fee).toBe(650);
    expect(city).toBe('Gwadar');
    expect(run('Gwadar', WED_10AM)).toEqual({
      sameDay: false,
      earliestDate: '2026-11-20',
      estimatedBy: '2026-11-23',
    });
  });

  it('DL-05 Sargodha is a setting: it starts as the Rs 550 tier and can be changed without code', () => {
    expect(rateFor(config, 'Sargodha').rate).toMatchObject({
      fee: 550,
      minDays: 1,
      maxDays: 2,
      sameDay: false,
    });
    const changed: DeliveryConfig = {
      ...config,
      deliveryRates: {
        ...config.deliveryRates,
        Sargodha: { fee: 500, minDays: 1, maxDays: 1, sameDay: true },
      },
    };
    const { rate } = rateFor(changed, 'Sargodha');
    expect(rate.fee).toBe(500);
    expect(
      timing({
        now: WED_10AM,
        rate,
        config: changed,
        leadDays: 0,
        capacityLeft: Infinity,
      }).sameDay,
    ).toBe(true);
  });

  it('DL-06 digital gifts have no delivery fee', () => {
    const { rate } = rateFor(config, 'Karachi');
    expect(deliveryFee(1000, false, rate, config)).toBe(0);
  });

  it('DL-07 delivery is free only when the order is over Rs 5,000', () => {
    const { rate } = rateFor(config, 'Karachi');
    expect(deliveryFee(5000, true, rate, config)).toBe(350);
    expect(deliveryFee(5001, true, rate, config)).toBe(0);
  });

  it('DL-08 made-to-order lead time pushes the delivery date and cancels same-day', () => {
    // 5 working days of production (Thu, Fri, Sat, Mon, Tue), then 1 day to deliver
    expect(run('Karachi', WED_10AM, 5)).toEqual({
      sameDay: false,
      earliestDate: '2026-11-25',
      estimatedBy: '2026-11-25',
    });
    expect(addWorkingDays('2026-11-20', 2)).toBe('2026-11-23'); // Fri + 2 working days skips Sunday: Sat, Mon
  });

  it('DL-09 no same-day when the daily capacity is used up', () => {
    expect(run('Karachi', WED_10AM, 0, 1).sameDay).toBe(true);
    expect(run('Karachi', WED_10AM, 0, 0).sameDay).toBe(false);
  });

  it('there is no same-day on a Sunday: the next working day starts the count', () => {
    expect(run('Karachi', SUN_10AM)).toEqual({
      sameDay: false,
      earliestDate: '2026-11-24',
      estimatedBy: '2026-11-24',
    });
  });

  it('SC-01 flowers and chocolate: day 3 is allowed, day 4 is not', () => {
    expect(perishableDateOk(WED_10AM, '2026-11-21')).toBe(true);
    expect(perishableDateOk(WED_10AM, '2026-11-22')).toBe(false);
  });

  it('recognises impossible dates', () => {
    expect(isRealDate('2026-11-18')).toBe(true);
    expect(isRealDate('2026-02-31')).toBe(false);
    expect(isRealDate('18-11-2026')).toBe(false);
  });
});
