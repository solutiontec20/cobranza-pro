/**
 * Date/time utilities for the Peru (Lima) business calendar. Consolidates logic that used to be
 * copy-pasted across several stores/components (`currentLimaDate`, `dateFromIso`/`parseIsoDate`,
 * `toIsoDate`, per-component `formatDate`/`formatDateTime` methods).
 */

/** Today's calendar date in Lima time, as `YYYY-MM-DD` (matches every Postgres `date` column's
 * own `(now() at time zone 'America/Lima')::date` business-day definition). */
export function currentLimaDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value['year']}-${value['month']}-${value['day']}`;
}

/** Converts a `Date` (e.g. from a PrimeNG datepicker) back to `YYYY-MM-DD` in Lima time, so the
 * resulting business date never drifts because of the browser's own local timezone. */
export function toIsoDateLima(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value['year']}-${value['month']}-${value['day']}`;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses either a date-only Postgres `date` value (`YYYY-MM-DD`, always exactly 10 characters)
 * or a full `timestamptz` value into a `Date`.
 *
 * Date-only values are anchored at noon in Lima instead of UTC midnight: `new Date('2026-10-21')` is
 * parsed as UTC midnight, which `Intl.DateTimeFormat` can then render as the *previous* calendar
 * day once converted to a negative-UTC-offset timezone (e.g. Lima, UTC-5) — anchoring at Lima noon
 * keeps the displayed business day correct regardless of the viewer's local timezone. Full timestamps
 * already encode an exact instant and must be parsed as-is. */
export type DateValue = string | Date;

export function parseDateValue(value: DateValue): Date {
  if (value instanceof Date) return value;
  return DATE_ONLY_PATTERN.test(value) ? new Date(`${value}T12:00:00-05:00`) : new Date(value);
}

export type EsDateStyle =
  | 'medium'
  | 'short'
  | 'long'
  | 'datetime'
  | 'short-datetime'
  | 'weekday';

/** Formats a date-only or timestamp value for display, in Spanish (Peru). `style` mirrors the
 * formats that were previously duplicated across components:
 * - `'medium'` (default): e.g. "21 oct. 2026" — general-purpose date display.
 * - `'short'`: e.g. "21/10/2026" — compact tables (daily control report).
 * - `'long'`: e.g. "21 de octubre de 2026", forced to America/Lima — report headers/exports.
 * - `'datetime'`: date + time, forced to America/Lima — payment/validation timestamps. */
export function formatEsDate(
  value: DateValue | null | undefined,
  style: EsDateStyle = 'medium',
): string {
  if (!value) return '—';

  const date = parseDateValue(value);

  switch (style) {
    case 'short':
      return new Intl.DateTimeFormat('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Lima',
      }).format(date);
    case 'long':
      return new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'long',
        timeZone: 'America/Lima',
      }).format(date);
    case 'datetime':
      return new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Lima',
      }).format(date);
    case 'short-datetime':
      return new Intl.DateTimeFormat('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Lima',
      })
        .format(date)
        .replace(',', '');
    case 'weekday':
      return new Intl.DateTimeFormat('es-PE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Lima',
      }).format(date);
    default:
      return new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'medium',
        timeZone: 'America/Lima',
      }).format(date);
  }
}
