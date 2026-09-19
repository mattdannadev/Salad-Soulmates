import { z } from 'zod';

export const FACILITY_TIMEZONE = 'America/Chicago';
export const QUANTITY_SCALE = 10000;
export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(
    z.number().finite().parse(value),
  );
}
/** SQL DATE values are calendar dates; converting them to local midnight changes their day. */
export function formatDate(value: string) {
  if (z.iso.date().safeParse(value).success) {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`),
    );
  }
  const instant = new Date(z.iso.datetime({ offset: true }).parse(value));
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: FACILITY_TIMEZONE,
  }).format(instant);
}
export function facilityDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FACILITY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(z.date().parse(value));
}
