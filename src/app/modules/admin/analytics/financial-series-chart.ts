import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import Chart from 'chart.js/auto';
import { AnalyticsBucket, AnalyticsFinancialPoint } from '../../../core/models/analytics.model';
import {
  formatBucketLabel,
  formatFinancialAmount as formatPenAmount,
  formatRange,
} from './analytics-calculations';

export type FinancialChartKind = 'profit' | 'cashflow';

@Component({
  selector: 'app-financial-series-chart',
  template: `
    <h3 class="m-0 text-base font-semibold text-surface-900 dark:text-surface-0">{{ title() }}</h3>
    <p class="mb-2 mt-1 text-xs text-surface-500 dark:text-surface-400">{{ description() }}</p>
    <div class="relative h-[260px] w-full sm:h-[300px]" role="group" [attr.aria-label]="title()">
      <canvas #chartCanvas role="img" [attr.aria-label]="accessibleDescription()"></canvas>
    </div>
    <table class="sr-only">
      <caption>
        {{
          title()
        }}
        por período, en soles peruanos
      </caption>
      <thead>
        <tr>
          <th scope="col">Período</th>
          @for (label of seriesLabels(); track label) {
            <th scope="col">{{ label }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (point of points(); track point.bucketStart) {
          <tr>
            <th scope="row">{{ formatPointRange(point) }}</th>
            @for (value of valuesFor(point); track $index) {
              <td>{{ formatFinancialAmount(value) }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [':host { display: block; min-width: 0; }'],
})
export class FinancialSeriesChart {
  readonly kind = input.required<FinancialChartKind>();
  readonly bucket = input.required<AnalyticsBucket>();
  readonly points = input.required<AnalyticsFinancialPoint[]>();
  protected readonly title = computed(() =>
    this.kind() === 'profit' ? 'Evolución financiera' : 'Desembolsos frente a cobros',
  );
  protected readonly description = computed(() =>
    this.kind() === 'profit'
      ? 'Interés cobrado, gastos operativos y utilidad neta por período.'
      : 'Préstamos desembolsados y cobranza recibida por período.',
  );
  protected readonly seriesLabels = computed(() =>
    this.kind() === 'profit'
      ? ['Interés cobrado', 'Gastos operativos', 'Utilidad neta']
      : ['Desembolsos de préstamos', 'Cobranza recibida'],
  );
  protected readonly accessibleDescription = computed(
    () =>
      `${this.title()}. ${this.description()} Series: ${this.seriesLabels().join(', ')}. ` +
      'Valores en soles peruanos; el detalle numérico está en la tabla del período.',
  );

  private readonly destroyRef = inject(DestroyRef);
  private readonly chartCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chart: Chart<'line', number[], string> | null = null;

  constructor() {
    afterRenderEffect(() => {
      const points = this.points();
      const kind = this.kind();
      const bucket = this.bucket();
      const labels = points.map((point) =>
        formatBucketLabel(point.bucketStart, point.bucketEnd, bucket),
      );
      const datasets = this.buildDatasets(points, kind);
      const chartTextColor = getComputedStyle(this.chartCanvas().nativeElement).color || '#64748b';

      if (!this.chart) {
        this.chart = new Chart(this.chartCanvas().nativeElement, {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: chartTextColor, usePointStyle: true, boxWidth: 8 },
              },
              tooltip: {
                callbacks: {
                  label: (context) =>
                    `${context.dataset.label}: ${formatPenAmount(context.parsed.y ?? 0)}`,
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: chartTextColor, maxTicksLimit: 8, maxRotation: 0 },
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(148, 163, 184, 0.2)' },
                ticks: {
                  color: chartTextColor,
                  callback: (value) =>
                    new Intl.NumberFormat('es-PE', {
                      style: 'currency',
                      currency: 'PEN',
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(Number(value)),
                },
              },
            },
          },
        });
      } else {
        this.chart.data.labels = labels;
        this.chart.data.datasets = datasets;
        this.chart.update();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }

  protected valuesFor(point: AnalyticsFinancialPoint): number[] {
    return this.kind() === 'profit'
      ? [point.interestCollected, point.operatingExpenses, point.netProfit]
      : [point.loanDisbursements, point.collectedAmount];
  }

  protected formatFinancialAmount(amount: number): string {
    return formatPenAmount(amount);
  }

  protected formatPointRange(point: AnalyticsFinancialPoint): string {
    return formatRange(point.bucketStart, point.bucketEnd);
  }

  private buildDatasets(points: AnalyticsFinancialPoint[], kind: FinancialChartKind) {
    const common = { tension: 0.28, pointRadius: points.length > 20 ? 0 : 3, borderWidth: 2 };
    if (kind === 'profit') {
      return [
        {
          ...common,
          label: 'Interés cobrado',
          data: points.map((point) => point.interestCollected),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
        },
        {
          ...common,
          label: 'Gastos operativos',
          data: points.map((point) => point.operatingExpenses),
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.12)',
        },
        {
          ...common,
          label: 'Utilidad neta',
          data: points.map((point) => point.netProfit),
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.12)',
          borderWidth: 3,
        },
      ];
    }

    return [
      {
        ...common,
        label: 'Desembolsos de préstamos',
        data: points.map((point) => point.loanDisbursements),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.12)',
      },
      {
        ...common,
        label: 'Cobranza recibida',
        data: points.map((point) => point.collectedAmount),
        borderColor: '#0891b2',
        backgroundColor: 'rgba(8, 145, 178, 0.12)',
      },
    ];
  }
}
