import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { AnalyticsFinancialPoint, AnalyticsPreset } from '../../../core/models/analytics.model';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import {
  EXPENSE_CATEGORY_LABELS,
  formatRange,
  isValidDate,
  isValidRange,
} from './analytics-calculations';
import { AnalyticsStore } from './analytics.store';
import { CollectorsChart } from './collectors-chart';
import { ExpenseCategoriesChart } from './expense-categories-chart';
import { FinancialSeriesChart } from './financial-series-chart';

const PERIOD_NOUN: Record<Exclude<AnalyticsPreset, 'custom'>, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
};

@Component({
  selector: 'app-analytics',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    SkeletonModule,
    PenCurrency,
    FinancialSeriesChart,
    CollectorsChart,
    ExpenseCategoriesChart,
  ],
  templateUrl: './analytics.html',
})
export default class Analytics {
  protected readonly store = inject(AnalyticsStore);

  protected readonly presetOptions = [
    { label: 'Día', value: 'day' as const },
    { label: 'Semana', value: 'week' as const },
    { label: 'Mes', value: 'month' as const },
    { label: 'Año', value: 'year' as const },
    { label: 'Rango', value: 'custom' as const },
  ];
  protected readonly loadingCards = [1, 2, 3, 4, 5];
  protected readonly categoryLabels = EXPENSE_CATEGORY_LABELS;
  protected readonly rangeError = signal<string | null>(null);

  protected readonly collectorSelectOptions = computed(() => [
    { label: 'Todos los cobradores', value: null as string | null },
    ...this.store.collectorOptions().map((option) => ({
      label: option.fullName,
      value: option.id as string | null,
    })),
  ]);

  /** Exact limits being shown, e.g. `22/11/2026` or `16/11/2026 – 22/11/2026`. */
  protected readonly rangeText = computed(() => {
    const { start, end } = this.store.range();
    return formatRange(start, end);
  });
  protected readonly periodTitle = computed(() => {
    const preset = this.store.preset();
    return preset === 'custom' ? 'Rango personalizado' : PERIOD_NOUN[preset];
  });
  protected readonly dateLabel = computed(() => {
    const preset = this.store.preset();
    if (preset === 'day') return 'Día';
    if (preset === 'week') return 'Cualquier día de la semana';
    if (preset === 'month') return 'Cualquier día del mes';
    return 'Cualquier día del año';
  });
  protected readonly showEvolution = computed(() => this.store.series().length > 1);

  protected changePreset(preset: AnalyticsPreset): void {
    this.rangeError.set(null);
    this.store.setPreset(preset);
  }

  protected changeReferenceDate(event: Event): void {
    const input = event.target as HTMLInputElement;
    // An empty or impossible date never reaches Supabase; put the last valid one back.
    if (!this.store.setReferenceDate(input.value)) {
      input.value = this.store.referenceDate();
    }
  }

  protected changeCustomStart(event: Event): void {
    this.applyCustomRange((event.target as HTMLInputElement).value, this.store.customEnd(), event);
  }

  protected changeCustomEnd(event: Event): void {
    this.applyCustomRange(
      this.store.customStart(),
      (event.target as HTMLInputElement).value,
      event,
    );
  }

  protected selectCollector(collectorId: string | null): void {
    this.store.setCollector(collectorId);
  }

  protected rangeOf(point: AnalyticsFinancialPoint): string {
    return formatRange(point.bucketStart, point.bucketEnd);
  }

  private applyCustomRange(start: string, end: string, event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!isValidDate(start) || !isValidDate(end)) {
      this.rangeError.set('Ingresá una fecha válida.');
    } else if (!isValidRange(start, end)) {
      this.rangeError.set(
        end < start
          ? 'La fecha final no puede ser anterior a la inicial.'
          : 'El rango no puede superar los 10 años.',
      );
    } else {
      this.rangeError.set(null);
      this.store.setCustomRange(start, end);
      return;
    }

    // Keep the last valid range on screen and in the input.
    input.value =
      input.id === 'analytics-start' ? this.store.customStart() : this.store.customEnd();
  }
}
