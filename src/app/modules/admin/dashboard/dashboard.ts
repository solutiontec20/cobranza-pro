import { Component, computed, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageModule } from 'primeng/message';
import { AdminDashboardStore } from './admin-dashboard.store';
import { RecoveryChart } from './recovery-chart';
import { currentLimaDate, formatEsDate } from '../../../core/calculations/date-time';
import { PenCurrency } from '../../../shared/pipes/pen-currency';

const EMPTY_BUCKET = { count: 0, percent: 0 };

@Component({
  selector: 'app-dashboard',
  imports: [
    CardModule,
    ButtonModule,
    TableModule,
    ProgressBarModule,
    SkeletonModule,
    MessageModule,
    PenCurrency,
    RecoveryChart,
  ],
  templateUrl: './dashboard.html',
})
export default class Dashboard {
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

  constructor() {
    void this.store.load();
  }
}
