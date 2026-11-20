import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { RouterLink } from '@angular/router';
import { AdminDashboardStore } from './admin-dashboard.store';
import { RecoveryChart } from './recovery-chart';
import { currentLimaDate, formatEsDate } from '../../../core/calculations/date-time';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import { CollectorPerformanceTable } from './collector-performance-table';
import { pageItems } from '../../../core/calculations/loan-detail-filtering';
import { normalizeSearchText } from '../../../core/calculations/text';

const EMPTY_BUCKET = { count: 0, percent: 0 };

@Component({
  selector: 'app-dashboard',
  imports: [
    CardModule,
    ButtonModule,
    ProgressBarModule,
    SkeletonModule,
    MessageModule,
    FormsModule,
    InputTextModule,
    PaginatorModule,
    SelectModule,
    RouterLink,
    PenCurrency,
    RecoveryChart,
    CollectorPerformanceTable,
  ],
  templateUrl: './dashboard.html',
})
export default class Dashboard implements OnInit, OnDestroy {
  protected readonly store = inject(AdminDashboardStore);

  protected readonly today = formatEsDate(currentLimaDate(), 'long');

  protected readonly loadingRows = [1, 2, 3, 4, 5];

  protected readonly kpis = computed(() => {
    const summary = this.store.summary();
    return {
      capitalPrestado: summary?.capitalPrestado ?? 0,
      totalEsperado: summary?.totalEsperado ?? 0,
      totalCobrado: summary?.totalCobrado ?? 0,
      saldoPendiente: summary?.saldoPendiente ?? 0,
      morosidad: summary?.morosidad ?? 0,
      totalClientes: summary?.totalClientes ?? 0,
      prestamosPagados: summary?.prestamosPagados ?? 0,
      cobradores: summary?.cobradores ?? 0,
    };
  });

  protected readonly riskDistribution = computed(
    () =>
      this.store.summary()?.riskDistribution ?? {
        green: EMPTY_BUCKET,
        yellow: EMPTY_BUCKET,
        orange: EMPTY_BUCKET,
        red: EMPTY_BUCKET,
      },
  );

  protected readonly collectorPerformance = computed(() => this.store.collectorPerformance());
  protected readonly performanceQuery = signal('');
  protected readonly performanceDelayFilter = signal<'all' | 'delayed' | 'current'>('all');
  protected readonly performanceDelayOptions = [
    { label: 'Todos', value: 'all' as const },
    { label: 'Con atrasos', value: 'delayed' as const },
    { label: 'Sin atrasos', value: 'current' as const },
  ];
  protected readonly performancePageSizeOptions = [5, 10, 20];
  protected readonly performancePageFirst = signal(0);
  protected readonly performancePageRows = signal(5);
  protected readonly filteredCollectorPerformance = computed(() => {
    const query = normalizeSearchText(this.performanceQuery());
    const delay = this.performanceDelayFilter();
    return this.collectorPerformance().filter(
      (entry) =>
        (!query ||
          [entry.name, entry.dni]
            .map(normalizeSearchText)
            .some((value) => value.includes(query))) &&
        (delay === 'all' ||
          (delay === 'delayed' ? entry.delayedCount > 0 : entry.delayedCount === 0)),
    );
  });
  protected readonly visibleCollectorPerformance = computed(() =>
    pageItems(
      this.filteredCollectorPerformance(),
      this.performancePageFirst(),
      this.performancePageRows(),
    ),
  );
  protected readonly isDesktop = signal(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  private desktopQuery?: MediaQueryList;
  private desktopQueryListener?: (event: MediaQueryListEvent) => void;

  constructor() {
    void this.store.load();
  }

  protected changePerformanceQuery(event: Event): void {
    this.performanceQuery.set((event.target as HTMLInputElement).value);
    this.performancePageFirst.set(0);
  }

  protected changePerformanceDelay(filter: 'all' | 'delayed' | 'current'): void {
    this.performanceDelayFilter.set(filter);
    this.performancePageFirst.set(0);
  }

  protected changePerformancePage(event: { first?: number; rows?: number }): void {
    this.performancePageFirst.set(event.first ?? 0);
    this.performancePageRows.set(event.rows ?? 5);
  }

  ngOnInit(): void {
    if (typeof window === 'undefined') return;

    this.desktopQuery = window.matchMedia('(min-width: 1024px)');
    this.isDesktop.set(this.desktopQuery.matches);
    this.desktopQueryListener = (event) => this.isDesktop.set(event.matches);
    this.desktopQuery.addEventListener('change', this.desktopQueryListener);
  }

  ngOnDestroy(): void {
    if (this.desktopQueryListener) {
      this.desktopQuery?.removeEventListener('change', this.desktopQueryListener);
    }
  }
}
