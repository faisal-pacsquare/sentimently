import { nextOccurrence } from './rules';

describe('yearly occasions', () => {
  it('E8-1 finds the next time an occasion falls on or after today', () => {
    expect(nextOccurrence('2020-11-25', '2026-11-18')).toBe('2026-11-25');
    expect(nextOccurrence('2020-11-18', '2026-11-18')).toBe('2026-11-18'); // today counts
    expect(nextOccurrence('2020-11-17', '2026-11-18')).toBe('2027-11-17'); // already passed: next year
    expect(nextOccurrence('2026-03-01T00:00:00.000Z', '2026-11-18')).toBe(
      '2027-03-01',
    ); // full timestamps are fine
  });

  it('E8-1 a 29 February occasion falls on 28 February in other years', () => {
    expect(nextOccurrence('2024-02-29', '2027-01-10')).toBe('2027-02-28');
    expect(nextOccurrence('2024-02-29', '2027-03-01')).toBe('2028-02-29');
  });
});
