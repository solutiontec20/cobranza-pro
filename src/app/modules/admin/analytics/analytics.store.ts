import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { currentLimaDate } from '../../../core/calculations/date-time';
import { AppError } from '../../../core/errors/app-error';
import {
  AnalyticsCollectorEntry,
  AnalyticsExpenseCategoryEntry,
  AnalyticsFinancialPoint,
  AnalyticsPreset,
  AnalyticsQuery,
  AnalyticsRange,
} from '../../../core/models/analytics.model';
import { ANALYTICS_REPOSITORY } from '../../../core/repositories/analytics.repository';
import {
  bucketForRange,
  hasFinancialActivity,
  isValidDate,
  isValidRange,
  rangeForPreset,
  shiftReferenceDate,
  summarizeSeries,
} from './analytics-calculations';

const EMPTY_SERIES: AnalyticsFinancialPoint[] = [];
const EMPTY_COLLECTORS: AnalyticsCollectorEntry[] = [];
const EMPTY_CATEGORIES: AnalyticsExpenseCategoryEntry[] = [];

/**
 * State of the Analíticas screen. It is provided by the lazy `/admin/analiticas` route only, so
 * no analytical query runs until the user opens that screen.
 *
 * The screen always shows **exactly** the selected period: one day, one Monday-to-Sunday week,
 * one calendar month, one calendar year, or a custom range. It never shows a wider window.
 *
 * Every dataset is a `resource()` keyed by its query: a change of period aborts the in-flight
 * requests and a late response can never replace a newer selection.
 */
@Injectable()
export class AnalyticsStore {
  private readonly repository = inject(ANALYTICS_REPOSITORY);

  readonly preset = signal<AnalyticsPreset>('day');
  readonly referenceDate = signal(currentLimaDate());
  readonly customStart = signal(currentLimaDate());
  readonly customEnd = signal(currentLimaDate());
  readonly collectorId = signal<string | null>(null);

  /** Inclusive Lima dates of the period being shown. */
  readonly range = computed<AnalyticsRange>(() =>
    this.preset() === 'custom'
      ? { start: this.customStart(), end: this.customEnd() }
      : rangeForPreset(this.preset(), this.referenceDate()),
  );
  readonly bucket = computed(() => bucketForRange(this.range()));

  private readonly seriesQuery = computed<AnalyticsQuery>(() => ({
    ...this.range(),
    bucket: this.bucket(),
    collectorId: this.collectorId(),
  }));
  /** Comparing collectors ignores the collector filter, so it is only re-queried by period. */
  private readonly collectorsQuery = computed<AnalyticsQuery>(() => ({
    ...this.range(),
    bucket: this.bucket(),
    collectorId: null,
  }));

  private readonly collectorOptionsResource = resource({
    loader: () => this.repository.listCollectors(),
  });
  private readonly seriesResource = resource({
    params: () => this.seriesQuery(),
    loader: ({ params, abortSignal }) => this.repository.getSeries(params, abortSignal),
  });
  private readonly collectorsResource = resource({
    params: () => this.collectorsQuery(),
    loader: ({ params, abortSignal }) =>
      this.repository.getCollectorPerformance(params, abortSignal),
  });
  private readonly categoriesResource = resource({
    params: () => this.seriesQuery(),
    loader: ({ params, abortSignal }) => this.repository.getExpenseCategories(params, abortSignal),
  });

  readonly collectorOptions = computed(() =>
    this.collectorOptionsResource.hasValue() ? this.collectorOptionsResource.value() : [],
  );
  readonly series = computed<AnalyticsFinancialPoint[]>(() =>
    this.seriesResource.hasValue() ? this.seriesResource.value() : EMPTY_SERIES,
  );
  readonly collectors = computed<AnalyticsCollectorEntry[]>(() =>
    this.collectorsResource.hasValue() ? this.collectorsResource.value() : EMPTY_COLLECTORS,
  );
  readonly categories = computed<AnalyticsExpenseCategoryEntry[]>(() =>
    this.categoriesResource.hasValue() ? this.categoriesResource.value() : EMPTY_CATEGORIES,
  );

  readonly loading = computed(
    () =>
      this.seriesResource.isLoading() ||
      this.collectorsResource.isLoading() ||
      this.categoriesResource.isLoading(),
  );
  readonly error = computed<string | null>(() => {
    const failure =
      this.seriesResource.error() ??
      this.collectorsResource.error() ??
      this.categoriesResource.error();
    if (!failure) return null;
    return AppError.from(failure).message || 'No se pudo cargar la información de analíticas.';
  });

  readonly totals = computed(() => summarizeSeries(this.series()));
  readonly hasActivity = computed(
    () =>
      hasFinancialActivity(this.series()) ||
      this.collectors().some((entry) => entry.collectedAmount !== 0 || entry.paymentsCount !== 0),
  );
  readonly selectedCollectorName = computed(() => {
    const id = this.collectorId();
    if (!id) return null;
    return this.collectorOptions().find((option) => option.id === id)?.fullName ?? null;
  });
  /** Previous/next only make sense for a calendar preset, not for a custom range. */
  readonly canShift = computed(() => this.preset() !== 'custom');

  setPreset(preset: AnalyticsPreset): void {
    if (preset === 'custom' && this.preset() !== 'custom') {
      // Start the custom range from what the user is looking at right now.
      const current = this.range();
      this.customStart.set(current.start);
      this.customEnd.set(current.end);
    }
    this.preset.set(preset);
  }

  /** Accepts only a real calendar date. Returns whether it was accepted. */
  setReferenceDate(referenceDate: string): boolean {
    if (!isValidDate(referenceDate)) return false;
    this.referenceDate.set(referenceDate);
    return true;
  }

  /** Accepts only two real dates with end not before start, within ten years. */
  setCustomRange(start: string, end: string): boolean {
    if (!isValidRange(start, end)) return false;
    this.customStart.set(start);
    this.customEnd.set(end);
    return true;
  }

  setCollector(collectorId: string | null): void {
    this.collectorId.set(collectorId);
  }

  /** Moves to the previous (-1) or next (1) day, week, month or year. */
  shiftPeriod(direction: -1 | 1): void {
    if (!this.canShift()) return;
    this.setReferenceDate(shiftReferenceDate(this.referenceDate(), this.preset(), direction));
  }

  goToToday(): void {
    this.referenceDate.set(currentLimaDate());
  }

  /** Runs the current queries again, e.g. after a failure. */
  retry(): void {
    this.seriesResource.reload();
    this.collectorsResource.reload();
    this.categoriesResource.reload();
  }
}
