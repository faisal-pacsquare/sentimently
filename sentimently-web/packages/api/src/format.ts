/** "Rs 3,500". Whole rupees only: the API never sends fractions. */
export function rupees(amount: number): string {
  return `Rs ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** 2026-11-18 -> "Wed 18 Nov". Plain dates are Pakistan dates, so they are formatted without any time zone shifting. */
export function shortDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** An ISO timestamp as a Pakistan-time date and time. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi',
  });
}

/** Today's date in Pakistan as YYYY-MM-DD, for date pickers. */
export function todayInPakistan(now: Date = new Date()): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

/** "5 to 7 working days", "next day", "same day". */
export function leadTimeText(min?: number | null, max?: number | null): string | null {
  if (max == null) return null;
  if (min == null || min === max) return `${max} working day${max === 1 ? '' : 's'}`;
  return `${min} to ${max} working days`;
}
