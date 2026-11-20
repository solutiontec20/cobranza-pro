import { Pipe, PipeTransform } from '@angular/core';
import { formatEsDate } from '../../core/calculations/date-time';
import type { DateValue, EsDateStyle } from '../../core/calculations/date-time';

/**
 * Formats a date-only (`YYYY-MM-DD`) or timestamp value in Spanish (Peru). See
 * `formatEsDate` in `core/calculations/date-time.ts` for what each `style` produces.
 *
 * Usage: `{{ loan.startedOn | esDate }}`, `{{ row.dueDate | esDate:'short' }}`,
 * `{{ payment.paidAt | esDate:'datetime' }}`.
 */
@Pipe({ name: 'esDate' })
export class EsDate implements PipeTransform {
  transform(value: DateValue | null | undefined, style: EsDateStyle = 'medium'): string {
    return formatEsDate(value, style);
  }
}
