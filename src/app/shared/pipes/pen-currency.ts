import { formatCurrency, getCurrencySymbol } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

/** Formats a number as Peruvian Soles (`PEN`), in the `es-PE` locale, replicating
 * `{{ value | currency: 'PEN' : 'symbol' : digitsInfo : 'es-PE' }}` without depending on
 * `CurrencyPipe` internals — per Angular's own guidance, locale-aware built-in pipes should be
 * replicated outside templates via their standalone formatting function (`formatCurrency` here),
 * never by instantiating/injecting the pipe class itself. */
export function formatPen(value: number, digitsInfo = '1.2-2'): string {
  const symbol = getCurrencySymbol('PEN', 'wide', 'es-PE');
  return formatCurrency(value, 'es-PE', symbol, 'PEN', digitsInfo);
}

/**
 * Usage: `{{ loan.totalAmount | penCurrency }}`, or `{{ amount | penCurrency:'1.0-0' }}` for a
 * whole-soles display (no decimals).
 */
@Pipe({ name: 'penCurrency' })
export class PenCurrency implements PipeTransform {
  transform(value: number | null | undefined, digitsInfo = '1.2-2'): string | null {
    if (value === null || value === undefined) return null;
    return formatPen(value, digitsInfo);
  }
}

